if (typeof require !== "undefined") {
  Object.assign(global, require("./common.js"));
}

// Old {{SwissTableLeague}} tiebreaker names that don't normalize into their
// {{SwissStandings}} equivalent (see normalizeTiebreaker).
const TIEBREAKER_RENAMES = {
  diff: "gamediff",
};

// Spelled-out old names -> new id style: "games won" -> "gamewins",
// "matches lost" -> "matchlosses", "Game Difference" -> "gamediff",
// "gameDiff" -> "gamediff".
function normalizeTiebreaker(name) {
  return name
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/^(game|match|round)e?s(?!core)/, "$1")
    .replace(/won$/, "wins")
    .replace(/lost$/, "losses")
    .replace(/(drawn|drew)$/, "draws")
    .replace(/difference$/, "diff");
}

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
  const base = normalizeTiebreaker(name.slice(dot + 1));
  const converted = Object.prototype.hasOwnProperty.call(TIEBREAKER_RENAMES, base)
    ? TIEBREAKER_RENAMES[base]
    : base;

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

// Collects numbered params (team1, team2, ... / pbg1, pbg11, ...) sorted by
// number, skipping blank ones unless keepEmpty is set.
function numberedParams(params, prefix, keepEmpty = false) {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  return Object.keys(params)
    .map((key) => {
      const match = key.match(pattern);
      return match ? { n: parseInt(match[1], 10), value: params[key] } : null;
    })
    .filter((entry) => entry && (keepEmpty || entry.value !== ""))
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
      // With no known team count the last range covers just its own row.
      const end = i + 1 < entries.length ? entries[i + 1].n - 1 : Math.max(teamCount, entry.n);
      const range = end > entry.n ? `${entry.n}-${end}` : `${entry.n}`;
      return `${range}=${entry.value}`;
    })
    .join(", ");
}

// Round robin over however many legs the old rounds= (games per team) implies
// — 38 games with 20 teams is 2 legs, 33 with 12 is 3 — defaulting to 2 legs.
// An odd team count needs an extra round per leg since one team sits out
// each round (13 teams, 24 games -> 2 legs of 13 rounds = 26).
function defaultRoundCount(teamCount, gamesPerTeam) {
  const legs = gamesPerTeam > 0 && teamCount > 1
    ? Math.max(1, Math.round(gamesPerTeam / (teamCount - 1)))
    : 2;
  return legs * (teamCount % 2 === 0 ? teamCount - 1 : teamCount);
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

// options: { roundCount, prefix, started, finished, extraTeams } — blank/NaN
// roundCount and blank prefix fall back to the defaults derived from the
// input: the matchGroupIdN params when present, otherwise the round count
// implied by rounds= and a prefix built from the title. A typed-in prefix
// overrides matchGroupIdN.
function convertSwissTableLeague(wikitext, options = {}) {
  if (!/^\s*\{\{\s*SwissTableLeague\s*\|/i.test(wikitext)) {
    return { output: "", warnings: [], error: "Input must start with {{SwissTableLeague|..." };
  }

  const params = parseSwissTableLeague(wikitext);
  // Manually added teams fill empty slots (teams not announced yet) in
  // order, and any left over are appended. Slots still empty after that
  // count towards the table size for bg ranges and the round count, but get
  // no {{TeamOpponent}} line.
  const extraTeams = [...(options.extraTeams || [])];
  const teamSlots = numberedParams(params, "team", true)
    .map((entry) => entry.value || extraTeams.shift() || "");
  teamSlots.push(...extraTeams);
  const teamCount = teamSlots.length;
  const teams = teamSlots.filter((team) => team !== "");

  const warnings = [];
  if (teams.length < teamCount) {
    warnings.push(`${teamCount - teams.length} of ${teamCount} team slots are empty and were skipped`);
  }
  if (teamCount === 0) {
    warnings.push("no team slots, so the last bg range and the round count can't use the team count");
  }
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
    : useMatchGroupIds ? lastMatchGroupRound
    : teamCount > 0 ? defaultRoundCount(teamCount, parseInt(params.rounds, 10))
    : parseInt(params.rounds, 10) || 0;
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
  out.push(`|bg=${buildBg(params, teamCount, warnings)}`);
  out.push(`|points=${POINTS}`);
  // No teams to list -> let the template pull them from the matches.
  if (teams.length === 0) out.push("|importopponents=true");

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
    extraTeams: document.getElementById("extraTeams").value
      .split("\n")
      .map((team) => team.trim())
      .filter((team) => team !== ""),
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
