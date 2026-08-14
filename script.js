// Short name (as it appears in the schedule export) -> full name used by {{TeamOpponent|...}}.
// Add/adjust entries here as new clubs show up in the input.
const TEAM_NAMES = {
  // J1 2026/27
  "Kashima": "Kashima Antlers",
  "Kashiwa": "Kashiwa Reysol",
  "Kyoto": "Kyoto Sanga FC",
  "Hiroshima": "Sanfrecce Hiroshima",
  "Kobe": "Vissel Kobe",
  "FC Machida": "FC Machida Zelvia",
  "Urawa": "Urawa Red Diamonds",
  "Kawasaki-F": "Kawasaki Frontale",
  "G-Osaka": "Gamba Osaka",
  "C-Osaka": "Cerezo Osaka",
  "FC TOKYO": "FC Tokyo",
  "Fukuoka": "Avispa Fukuoka",
  "Okayama": "Fagiano Okayama",
  "Shimizu": "Shimizu S-Pulse",
  "Yokohama F･M": "Yokohama F. Marinos",
  "Nagoya": "Nagoya Grampus",
  "Tokyo-V": "Tokyo Verdy",
  "Mito": "Mito HollyHock",
  "Nagasaki": "V-Varen Nagasaki",
  "Chiba": "JEF United Chiba",

  // J2 2026/27
  "Yokohama FC": "Yokohama FC",
  "Shonan": "Shonan Bellmare",
  "Niigata": "Albirex Niigata",
  "Tokushima": "Tokushima Vortis",
  "Iwata": "Júbilo Iwata",
  "Omiya": "Omiya Ardija",
  "Sendai": "Vegalta Sendai",
  "Tosu": "Sagan Tosu",
  "Iwaki": "Iwaki FC",
  "Yamagata": "Montedio Yamagata",
  "Imabari": "FC Imabari",
  "Sapporo": "Hokkaido Consadole Sapporo",
  "Kofu": "Ventforet Kofu",
  "Akita": "Blaublitz Akita",
  "Fujieda": "Fujieda MYFC",
  "Oita": "Oita Trinita",
  "Toyama": "Kataller Toyama",
  "TOCHIGI-C": "Tochigi City FC",
  "Hachinohe": "Vanraure Hachinohe",
  "Miyazaki": "Tegevajaro Miyazaki",

  // J3 2026/27
  "Yamaguchi": "Renofa Yamaguchi",
  "Kumamoto": "Roasso Kumamoto",
  "Ehime FC": "Ehime FC",
  "FC Osaka": "FC Osaka",
  "Kagoshima": "Kagoshima United",
  "Kanazawa": "Zweigen Kanazawa",
  "Tochigi SC": "Tochigi SC",
  "Kitakyushu": "Giravanz Kitakyushu",
  "Nara": "Nara Club",
  "Fukushima": "Fukushima United",
  "Tottori": "Gainare Tottori",
  "Sagamihara": "SC Sagamihara",
  "FC Gifu": "FC Gifu",
  "Gunma": "Thespa Gunma",
  "Matsumoto": "Matsumoto Yamaga",
  "RYUKYU": "FC Ryukyu",
  "Sanuki": "Kamatamare Sanuki",
  "Kochi": "Kochi United",
  "Nagano": "Nagano Parceiro",
  "Shiga": "Reilac Shiga",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function extractMatchweek(sec) {
  const match = sec.match(/(\d+)\w*\s+Sec\s*$/);
  return match ? parseInt(match[1], 10) : 0;
}

function parseDate(raw) {
  // e.g. "Fri 09/18/26" -> the date part after the weekday abbreviation
  const parts = raw.trim().split(/\s+/);
  const datePart = parts.length > 1 ? parts[1] : parts[0];
  const [mm, dd, yy] = datePart.split("/").map((n) => parseInt(n, 10));
  return new Date(2000 + yy, mm - 1, dd);
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatLongDate(date) {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function seasonCode(season) {
  // "2026/27" -> "2627"; "2024" -> "2024" (both are 4 characters, for a stable 10-char id)
  if (season.includes("/")) {
    const [startYear, endYear] = season.split("/");
    return `${startYear.slice(-2)}${endYear.slice(-2).padStart(2, "0")}`;
  }
  return season;
}

// J-League ran calendar-year seasons (1992-2025) before switching to the
// autumn-spring format starting 2026/27. The autumn-spring list always
// extends one season past the current year so next year's season is
// selectable ahead of time.
function buildSeasonOptions() {
  const options = [];
  for (let year = 1992; year <= 2025; year++) {
    options.push(String(year));
  }

  const currentYear = new Date().getFullYear();
  const lastStart = Math.max(2026, currentYear + 1);
  for (let start = 2026; start <= lastStart; start++) {
    options.push(`${start}/${String(start + 1).slice(-2)}`);
  }

  return options;
}

function tryParseScore(raw) {
  // Real scores look like "2-1", "2 - 1", "2:1"; unplayed matches show "vs".
  const match = raw.trim().match(/^(\d+)\s*[-–:]\s*(\d+)$/);
  if (!match) return null;
  return { home: parseInt(match[1], 10), away: parseInt(match[2], 10) };
}

function resolveTeam(shortName, unmapped) {
  if (Object.prototype.hasOwnProperty.call(TEAM_NAMES, shortName)) {
    return TEAM_NAMES[shortName];
  }
  unmapped.add(shortName);
  return shortName;
}

// Converts a tab-separated J-League schedule export into Liquipedia wikitext.
// `league` (J1/J2/J3) and `season` (e.g. "2024" or "2026/27") come from the
// page's dropdowns; the round number is still read from the schedule's own
// "Sec" column, same as before.
function convert(inputText, league, season) {
  const lines = inputText
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  if (lines.length > 0 && /^season/i.test(lines[0])) {
    lines.shift();
  }

  const matches = [];
  for (const line of lines) {
    const cols = line.split("\t");
    if (cols.length < 8) continue;

    matches.push({
      sec: cols[2].trim(),
      dateRaw: cols[3].trim(),
      kickoff: cols[4].trim(),
      home: cols[5].trim(),
      score: cols[6].trim(),
      away: cols[7].trim(),
    });
  }

  if (matches.length === 0) {
    return { output: "", unmapped: [], error: "No match rows found in input." };
  }

  const matchweek = extractMatchweek(matches[0].sec);
  const matchlistId = `${league}L${seasonCode(season)}R${String(matchweek).padStart(2, "0")}`;
  const dates = matches.map((m) => parseDate(m.dateRaw));
  const unmapped = new Set();

  const out = [];
  out.push(`===={{HiddenSort|Matchweek ${matchweek}}}====`);
  out.push(`{{Matchlist|width=290px|id=${matchlistId}`);
  out.push(`|title=Matchweek ${matchweek}`);
  out.push(`|matchsection=Matchweek ${matchweek}`);

  let lastDateKey = null;
  for (let i = 0; i < matches.length; i++) {
    const key = dateKey(dates[i]);
    if (key !== lastDateKey) {
      out.push(`|M${i + 1}header=${formatLongDate(dates[i])}`);
      lastDateKey = key;
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const date = dateKey(dates[i]);
    const home = resolveTeam(m.home, unmapped);
    const away = resolveTeam(m.away, unmapped);

    const score = tryParseScore(m.score);
    const finished = score ? "true" : "";
    const homeScoreStr = score ? String(score.home) : "";
    const awayScoreStr = score ? String(score.away) : "";

    out.push(`|{{Match|finished=${finished}`);
    out.push(`    |date=${date} - ${m.kickoff}{{Abbr/JST}}`);
    out.push("    |comment=");
    out.push(`    |opponent1={{TeamOpponent|${home}|score=${homeScoreStr}}}`);
    out.push(`    |opponent2={{TeamOpponent|${away}|score=${awayScoreStr}}}`);
    out.push("    }}");
  }

  out.push("}}");

  return { output: out.join("\n"), unmapped: Array.from(unmapped).sort(), error: null };
}

function currentSeason() {
  const currentYear = new Date().getFullYear();
  if (currentYear <= 2025) return String(currentYear);
  return `${currentYear}/${String(currentYear + 1).slice(-2)}`;
}

function populateSeasonSelect() {
  const seasonEl = document.getElementById("season");
  const options = buildSeasonOptions();

  for (const season of options) {
    const opt = document.createElement("option");
    opt.value = season;
    opt.textContent = season;
    seasonEl.appendChild(opt);
  }

  seasonEl.value = currentSeason();
}

function runConversion() {
  const inputEl = document.getElementById("input");
  const outputEl = document.getElementById("output");
  const statusEl = document.getElementById("status");
  const leagueEl = document.getElementById("league");
  const seasonEl = document.getElementById("season");

  const result = convert(inputEl.value, leagueEl.value, seasonEl.value);

  if (result.error) {
    outputEl.value = "";
    statusEl.textContent = result.error;
    statusEl.classList.add("status--error");
    return;
  }

  outputEl.value = result.output;
  statusEl.classList.remove("status--error");

  if (result.unmapped.length > 0) {
    statusEl.textContent = `Unmapped team names (used as-is — add them to TEAM_NAMES in script.js): ${result.unmapped.join(", ")}`;
  } else {
    statusEl.textContent = "";
  }
}

async function copyOutput() {
  const outputEl = document.getElementById("output");
  const copyBtn = document.getElementById("copyBtn");
  if (!outputEl.value) return;

  if (navigator.clipboard) {
    await navigator.clipboard.writeText(outputEl.value);
  } else {
    outputEl.select();
    document.execCommand("copy");
  }

  const originalLabel = copyBtn.textContent;
  copyBtn.textContent = "Copied!";
  copyBtn.classList.add("copied");
  setTimeout(() => {
    copyBtn.textContent = originalLabel;
    copyBtn.classList.remove("copied");
  }, 1500);
}

if (typeof document !== "undefined") {
  populateSeasonSelect();
  document.getElementById("convertBtn").addEventListener("click", runConversion);
  document.getElementById("copyBtn").addEventListener("click", copyOutput);
}

if (typeof module !== "undefined") {
  module.exports = { convert, buildSeasonOptions, seasonCode, currentSeason };
}
