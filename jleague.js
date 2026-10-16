if (typeof require !== "undefined") {
  Object.assign(global, require("./common.js"));
}

// Short name (as it appears in the schedule export) -> full name used by
// {{TeamOpponent|...}}, keyed by season since rosters change every year via
// promotion/relegation. Only seasons listed here are selectable — add a new
// season's block once its club list exists.
const TEAM_NAMES = {
  "2026/27": {
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
  },
};

function extractMatchweek(sec) {
  const match = sec.match(/(\d+)\w*\s+Sec\s*$/);
  return match ? parseInt(match[1], 10) : 0;
}

function resolveTeam(shortName, season, unmapped) {
  const teams = TEAM_NAMES[season] || {};
  if (Object.prototype.hasOwnProperty.call(teams, shortName)) {
    return teams[shortName];
  }
  unmapped.add(shortName);
  return shortName;
}

// Converts a tab-separated J-League schedule export into Liquipedia wikitext.
// `league` (J1/J2/J3) and `season` (e.g. "2024" or "2026/27") come from the
// page's URL/dropdown; the round number is still read from the schedule's
// own "Sec" column.
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
    const home = resolveTeam(m.home, season, unmapped);
    const away = resolveTeam(m.away, season, unmapped);

    const score = tryParseScore(m.score);
    const finished = score ? "true" : "";
    const homeScoreStr = score ? String(score.home) : "";
    const awayScoreStr = score ? String(score.away) : "";

    const dateLine = m.kickoff ? `${date} - ${m.kickoff}{{Abbr/JST}}` : date;

    out.push(`|{{Match|finished=${finished}`);
    out.push(`    |date=${dateLine}`);
    out.push("    |comment=");
    out.push(`    |opponent1={{TeamOpponent|${home}|score=${homeScoreStr}}}`);
    out.push(`    |opponent2={{TeamOpponent|${away}|score=${awayScoreStr}}}`);
    out.push("    }}");
  }

  out.push("}}");

  return { output: out.join("\n"), unmapped: Array.from(unmapped).sort(), error: null };
}

function currentLeagueFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const league = params.get("league");
  return ["J1", "J2", "J3"].includes(league) ? league : "J1";
}

// Only seasons with a team list above are selectable.
function buildJLeagueSeasonOptions() {
  return Object.keys(TEAM_NAMES);
}

function populateSeasonSelect() {
  const seasonEl = document.getElementById("season");
  const options = buildJLeagueSeasonOptions();

  for (const season of options) {
    const opt = document.createElement("option");
    opt.value = season;
    opt.textContent = season;
    seasonEl.appendChild(opt);
  }

  seasonEl.value = options[options.length - 1];
}

function runConversion() {
  const inputEl = document.getElementById("input");
  const outputEl = document.getElementById("output");
  const statusEl = document.getElementById("status");
  const seasonEl = document.getElementById("season");
  const league = currentLeagueFromUrl();

  const result = convert(inputEl.value, league, seasonEl.value);

  if (result.error) {
    outputEl.value = "";
    statusEl.textContent = result.error;
    statusEl.classList.add("status--error");
    return;
  }

  outputEl.value = result.output;
  statusEl.classList.remove("status--error");

  if (result.unmapped.length > 0) {
    statusEl.textContent = `Unmapped team names (used as-is — add them to TEAM_NAMES in jleague.js): ${result.unmapped.join(", ")}`;
  } else {
    statusEl.textContent = "";
  }
}

if (typeof document !== "undefined") {
  const league = currentLeagueFromUrl();
  document.title = `${league} Schedule Converter`;
  document.getElementById("pageTitle").textContent = `${league} Schedule → Liquipedia Converter`;
  populateSeasonSelect();
  document.getElementById("convertBtn").addEventListener("click", runConversion);
}

if (typeof module !== "undefined") {
  module.exports = { convert, buildJLeagueSeasonOptions };
}
