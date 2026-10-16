if (typeof require !== "undefined") {
  Object.assign(global, require("./common.js"));
}

// Old {{SwissTableLeague}} tiebreaker names that don't just lowercase into
// their {{SwissStandings}} equivalent (e.g. gameDiff -> gamediff works as-is).
const TIEBREAKER_RENAMES = {
  diff: "gamediff",
};

// Tiebreaker ids accepted by {{SwissStandings}}, plus the context prefixes
// ("ml.matchdiff") they can take. Anything else is flagged.
const KNOWN_TIEBREAKERS = new Set([
  "points", "buchholz", "medianbuchholz", "buchholzpoints", "medianbuchholzpoints",
  "manual", "disqualified", "startingpoints",
  "matchdiff", "matchcount", "matchwins", "matchdraws", "matchlosses", "matchwinrate", "matchscore",
  "gamediff", "gamecount", "gamewins", "gamelosses", "gamewinrate", "gamescore", "gamediffregulation",
  "roundwins", "roundlosses", "rounddiff", "roundscore",
]);
const TIEBREAKER_CONTEXTS = new Set(["full", "ml", "h2hlegacy"]);

function convertTiebreaker(name, warnings) {
  const dot = name.lastIndexOf(".");
  const context = dot === -1 ? "" : name.slice(0, dot).toLowerCase();
  const base = name.slice(dot + 1);
  const converted = Object.prototype.hasOwnProperty.call(TIEBREAKER_RENAMES, base)
    ? TIEBREAKER_RENAMES[base]
    : base.toLowerCase();

  if (!KNOWN_TIEBREAKERS.has(converted) || (context && !TIEBREAKER_CONTEXTS.has(context))) {
    warnings.push(`unknown tiebreaker: ${name}`);
  }
  return context ? `${context}.${converted}` : converted;
}

const POINTS = "win=3,draw=1,loss=0";

// Splits "a=1|b={{x|y}}|c=2" on the pipes that aren't inside a nested
// {{template}} or [[link]].
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const pair = text.slice(i, i + 2);
    if (pair === "{{" || pair === "[[") {
      depth++;
      current += pair;
      i++;
    } else if ((pair === "}}" || pair === "]]") && depth > 0) {
      depth--;
      current += pair;
      i++;
    } else if (text[i] === "|" && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += text[i];
    }
  }
  parts.push(current);
  return parts;
}

// "{{SwissTableLeague|rounds=24|title=...}}" -> { rounds: "24", title: "...", ... }
function parseSwissTableLeague(wikitext) {
  const body = wikitext.trim().replace(/^\{\{/, "").replace(/\}\}$/, "");
  const [, ...params] = splitTopLevel(body);
  const result = {};
  for (const param of params) {
    const eq = param.indexOf("=");
    if (eq === -1) continue;
    result[param.slice(0, eq).trim()] = param.slice(eq + 1).trim();
  }
  return result;
}

// Collects numbered params (team1, team2, ... / pbg1, pbg11, ...) sorted by number.
function numberedParams(params, prefix) {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  return Object.keys(params)
    .map((key) => {
      const match = key.match(pattern);
      return match ? { n: parseInt(match[1], 10), value: params[key] } : null;
    })
    .filter((entry) => entry && entry.value !== "")
    .sort((a, b) => a.n - b.n);
}

// Background values {{SwissStandings}} accepts in |bg=.
const KNOWN_BGS = new Set(["byeup", "seedup", "up", "stayup", "stay", "staydown", "down", "dq"]);

// pbg1=up|pbg2=stay|pbg11=down with 13 teams -> "1=up, 2-10=stay, 11-13=down"
// (each pbgN applies from N until the next pbg entry, or the last team).
function buildBg(params, teamCount, warnings = []) {
  const entries = numberedParams(params, "pbg");
  return entries
    .map((entry, i) => {
      if (!KNOWN_BGS.has(entry.value)) warnings.push(`unknown bg: ${entry.value}`);
      const end = i + 1 < entries.length ? entries[i + 1].n - 1 : teamCount;
      const range = end > entry.n ? `${entry.n}-${end}` : `${entry.n}`;
      return `${range}=${entry.value}`;
    })
    .join(", ");
}

// Double round robin: an odd team count needs an extra round per leg since
// one team sits out each round.
function defaultRoundCount(teamCount) {
  return teamCount % 2 === 0 ? 2 * (teamCount - 1) : 2 * teamCount;
}

// "Bangladesh Football League 2026-27" -> "BFL2627"
function defaultMatchgroupPrefix(title) {
  const seasonMatch = title.match(/\d{4}(?:[/-]\d{2,4})?/);
  const name = seasonMatch ? title.slice(0, seasonMatch.index) : title;
  const initials = name
    .split(/\s+/)
    .filter((word) => /^[A-Z0-9]/.test(word))
    .map((word) => word[0])
    .join("");
  return initials + (seasonMatch ? seasonCode(seasonMatch[0]) : "");
}

// options: { roundCount, prefix, started, finished } — blank/NaN roundCount
// and blank prefix fall back to the defaults derived from the input: the
// matchGroupIdN params when present, otherwise a double round robin and a
// prefix built from the title. A typed-in prefix overrides matchGroupIdN.
function convertSwissTableLeague(wikitext, options = {}) {
  if (!/^\s*\{\{\s*SwissTableLeague\s*\|/i.test(wikitext)) {
    return { output: "", warnings: [], error: "Input must start with {{SwissTableLeague|..." };
  }

  const params = parseSwissTableLeague(wikitext);
  const teams = numberedParams(params, "team").map((entry) => entry.value);
  if (teams.length === 0) {
    return { output: "", warnings: [], error: "No team1=, team2=, ... entries found." };
  }

  const warnings = [];
  const title = params.title || "";
  if (!title) warnings.push("no title= found");

  const tiebreakers = numberedParams(params, "tiebreaker")
    .map((entry) => convertTiebreaker(entry.value, warnings));

  const matchGroupIds = new Map(
    numberedParams(params, "matchGroupId").map((entry) => [entry.n, entry.value])
  );
  const lastMatchGroupRound = Math.max(0, ...matchGroupIds.keys());
  const useMatchGroupIds = !options.prefix && matchGroupIds.size > 0;

  const roundCount = options.roundCount > 0
    ? options.roundCount
    : useMatchGroupIds ? lastMatchGroupRound : defaultRoundCount(teams.length);
  // Rounds without a matchGroupIdN (or every round, when a prefix is typed in)
  // get {prefix}R{nn}; "J1L2627R01" -> prefix "J1L2627".
  const prefix = options.prefix
    || (useMatchGroupIds && (matchGroupIds.values().next().value.match(/^(.*)R\d+$/) || [])[1])
    || defaultMatchgroupPrefix(title);
  const roundTitle = params.roundtitle || "Round";
  const started = options.started || 0;
  const finished = options.finished || 0;

  const out = [];
  out.push("{{SwissStandings");
  out.push(`|tiebreakers={{Json|${tiebreakers.join("|")}}}`);
  out.push(`|title=${title}`);
  out.push(`|bg=${buildBg(params, teams.length, warnings)}`);
  out.push(`|points=${POINTS}`);

  for (let round = 1; round <= roundCount; round++) {
    const matchgroup = (useMatchGroupIds && matchGroupIds.get(round))
      || `${prefix}R${String(round).padStart(2, "0")}`;
    const isStarted = round <= Math.max(started, finished) ? 1 : 0;
    const isFinished = round <= finished ? 1 : 0;
    out.push(`|round${round}={{Round|title=${roundTitle} ${round}|matchgroups=${matchgroup}|started=${isStarted}|finished=${isFinished}}}`);
  }

  for (const team of teams) {
    out.push(`|{{TeamOpponent|${team}}}`);
  }
  out.push("}}");

  return { output: out.join("\n"), warnings, error: null, roundCount, prefix, useMatchGroupIds };
}

function readNumber(id) {
  return parseInt(document.getElementById(id).value, 10) || 0;
}

function runConversion() {
  const inputEl = document.getElementById("input");
  const outputEl = document.getElementById("output");
  const statusEl = document.getElementById("status");

  const result = convertSwissTableLeague(inputEl.value, {
    roundCount: readNumber("roundCount"),
    prefix: document.getElementById("prefix").value.trim(),
    started: readNumber("started"),
    finished: readNumber("finished"),
  });

  if (result.error) {
    outputEl.value = "";
    statusEl.textContent = result.error;
    statusEl.classList.add("status--error");
    return;
  }

  outputEl.value = result.output;
  statusEl.classList.remove("status--error");

  const summary = result.useMatchGroupIds
    ? `${result.roundCount} rounds, matchgroups from matchGroupIdN.`
    : `${result.roundCount} rounds, matchgroups ${result.prefix}R01…`;
  statusEl.textContent = result.warnings.length > 0
    ? `${summary} Check: ${result.warnings.join(", ")}`
    : summary;
}

if (typeof document !== "undefined") {
  document.getElementById("convertBtn").addEventListener("click", runConversion);
}

if (typeof module !== "undefined") {
  module.exports = {
    parseSwissTableLeague,
    buildBg,
    defaultRoundCount,
    defaultMatchgroupPrefix,
    convertSwissTableLeague,
  };
}
