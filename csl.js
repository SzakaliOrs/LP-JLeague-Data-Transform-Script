if (typeof require !== "undefined") {
  Object.assign(global, require("./common.js"));
}

// Chinese Super League short-name (as it appears in the schedule export) ->
// full name used by {{TeamOpponent|...}}, keyed by season since rosters
// change every year via promotion/relegation. Only seasons listed here are
// selectable — add a new season's block once its team/stadium lists exist.
// TODO: replace the "TBD" placeholders with the real full names.
const CSL_TEAM_NAMES = {
  2025: {
    "上海海港": "Shanghai Port FC", // Shanghai Port
    "上海申花": "Shanghai Shenhua FC", // Shanghai Shenhua
    "云南玉昆": "Yunnan Yukun FC", // Yunnan Yukun
    "北京国安": "Beijing Guoan", // Beijing Guoan
    "大连英博": "Dalian Yingbo FC", // Dalian Yingbo
    "天津津门虎": "Tianjin Jinmen Tiger FC", // Tianjin Jinmen Tiger
    "山东泰山": "Shandong Taishan", // Shandong Taishan
    "成都蓉城": "Chengdu Rongcheng FC", // Chengdu Rongcheng
    "梅州客家": "Meizhou Hakka FC", // Meizhou Hakka
    "武汉三镇": "Wuhan Three Towns FC", // Wuhan Three Towns
    "河南": "Henan FC", // Henan
    "浙江": "Zhejiang FC", // Zhejiang
    "深圳新鹏城": "Shenzhen Peng City FC", // Shenzhen Peng City
    "长春亚泰": "Changchun Yatai FC", // Changchun Yatai
    "青岛海牛": "Qingdao Hainiu FC", // Qingdao Hainiu
    "青岛西海岸": "Qingdao West Coast FC", // Qingdao West Coast
  },
};

// Venue name (as it appears in the schedule export's 场地长名称 column) ->
// full stadium name, used in each match's |comment= field (CSL only),
// keyed by season just like CSL_TEAM_NAMES. Keyed by venue rather than by
// team since a team can play home matches at more than one stadium in a
// season (e.g. a one-off relocated fixture) — the export already tells us
// exactly which venue was used per match, so there's no need to guess.
// TODO: add entries for any venue missing here (an unmapped venue's
// |comment= is left blank and flagged after conversion).
const CSL_STADIUMS = {
  2025: {
    "上汽浦东足球场": "Pudong Football Stadium, Shanghai, China", // Shanghai Port
    "上海体育场": "Shanghai Stadium, Shanghai, China", // Shanghai Shenhua
    "玉溪高原体育运动中心体育场": "Yuxi Plateau Sports Center Stadium, Yuxi, China", // Yunnan Yukun
    "工人体育场": "Workers' Stadium, Beijing, China", // Beijing Guoan
    "大连梭鱼湾足球场": "Dalian Suoyuwan Football Stadium, Dalian, China", // Dalian Yingbo
    "泰达足球场": "TEDA Soccer Stadium, Tianjin, China", // Tianjin Jinmen Tiger
    "济南奥体中心体育场": "Jinan Olympic Sports Center Stadium, Jinan, China", // Shandong Taishan
    "五粮液文化体育中心专业足球场": "Wuliangye Sports Center Stadium, Chengdu, China", // Chengdu Rongcheng
    "五华奥体中心惠堂体育场": "Huitang Stadium, Wuhua, China", // Meizhou Hakka
    "武汉体育中心体育场": "Wuhan Sports Center, Wuhan, China", // Wuhan Three Towns
    "郑州航海体育场": "Hanghai Stadium, Zhengzhou, China", // Henan
    "黄龙体育中心体育场": "Huanglong Sports Center Stadium, Hangzhou, China", // Zhejiang
    "深圳市体育场": "Shenzhen Sports Center Stadium, Shenzhen, China", // Shenzhen Peng City (primary)
    "长春体育中心体育场": "Changchun Stadium, Changchun, China", // Changchun Yatai
    "青岛青春足球场": "Qingdao Youth Football Stadium, Qingdao, China", // Qingdao Hainiu
    "青岛西海岸大学城体育场": "Qingdao West Coast University City Sports Center, Qingdao, China", // Qingdao West Coast
    "肇庆新区体育中心体育场": "Zhaoqing New District Sports Center Stadium, Zhaoqing, China", // Zhaoqing New District Sports Center Stadium — Shenzhen Peng City's round-30 away-from-home fixture
    "天津奥体中心体育场": "Tianjin Olympic Centre Stadium, Tianjin, China", // Tianjin Olympic Sports Center Stadium
  },
};

// Only seasons with a team/stadium list above are selectable.
function buildCslSeasonOptions() {
  return Object.keys(CSL_TEAM_NAMES).sort();
}

// "2025-02-22 19:35:00" -> { date: "2025-02-22", kickoff: "19:35" }
function parseCslDateTime(raw) {
  const [date, time] = raw.trim().split(" ");
  return { date, kickoff: time ? time.slice(0, 5) : "" };
}

// Unlike J-League (where an unmapped team is used as-is), CSL leaves the
// entry blank and flags it — the schedule export uses Chinese short names
// that aren't meaningful to a reader on their own.
function resolveCslTeam(shortName, season, unmapped) {
  const teams = CSL_TEAM_NAMES[season] || {};
  if (Object.prototype.hasOwnProperty.call(teams, shortName)) {
    return teams[shortName];
  }
  unmapped.add(`team: ${shortName}`);
  return "";
}

function resolveCslVenue(venueName, season, unmapped) {
  const venues = CSL_STADIUMS[season] || {};
  if (Object.prototype.hasOwnProperty.call(venues, venueName)) {
    return venues[venueName];
  }
  if (venueName) unmapped.add(`venue: ${venueName}`);
  return "";
}

// Converts already-parsed schedule rows (array-of-arrays, header row
// included; columns: 赛季, 联赛名称, 轮次, 比赛时间, 主队, 主场得分, 客队,
// 客场得分, 比赛状态, 场地长名称) into Liquipedia wikitext — one
// {{Matchlist}} block per round found for the selected season.
function convertCslRows(rows, season) {
  const dataRows = rows.slice(1).filter((r) => String(r[0]).trim() === String(season));

  if (dataRows.length === 0) {
    return { output: "", unmapped: [], error: `No rows found for season ${season}.` };
  }

  const byRound = new Map();
  for (const row of dataRows) {
    const round = String(row[2]).trim();
    if (!byRound.has(round)) byRound.set(round, []);
    byRound.get(round).push(row);
  }

  const rounds = [...byRound.keys()].sort((a, b) => Number(a) - Number(b));
  const unmapped = new Set();
  const blocks = [];

  for (const round of rounds) {
    const matches = byRound.get(round);
    const matchlistId = `CSL${seasonCode(String(season))}R${String(round).padStart(2, "0")}`;
    const parsed = matches.map((row) => parseCslDateTime(String(row[3])));

    const out = [];
    out.push(`===Round ${round}===`);
    out.push(`===={{HiddenSort|Matchweek ${round}}}====`);
    out.push(`{{Matchlist|width=290px|id=${matchlistId}`);
    out.push(`|title=Matchweek ${round}`);
    out.push(`|matchsection=Matchweek ${round}`);

    let lastDate = null;
    for (let i = 0; i < matches.length; i++) {
      if (parsed[i].date !== lastDate) {
        const [y, m, d] = parsed[i].date.split("-").map(Number);
        out.push(`|M${i + 1}header=${formatLongDate(new Date(y, m - 1, d))}`);
        lastDate = parsed[i].date;
      }
    }

    for (let i = 0; i < matches.length; i++) {
      const row = matches[i];
      const home = resolveCslTeam(String(row[4]).trim(), season, unmapped);
      const away = resolveCslTeam(String(row[6]).trim(), season, unmapped);
      const comment = resolveCslVenue(String(row[9]).trim(), season, unmapped);

      const finished = String(row[8]).trim() === "比赛结束" ? "true" : "";
      const homeScoreStr = finished ? String(row[5]).trim() : "";
      const awayScoreStr = finished ? String(row[7]).trim() : "";
      const dateLine = parsed[i].kickoff ? `${parsed[i].date} - ${parsed[i].kickoff}{{Abbr/CST}}` : parsed[i].date;

      out.push(`|{{Match|finished=${finished}`);
      out.push(`    |date=${dateLine}`);
      out.push(`    |comment=${comment}`);
      out.push(`    |opponent1={{TeamOpponent|${home}|score=${homeScoreStr}}}`);
      out.push(`    |opponent2={{TeamOpponent|${away}|score=${awayScoreStr}}}`);
      out.push("    }}");
    }

    out.push("}}");
    blocks.push(out.join("\n"));
  }

  const output = [
    "{{box|start|padding=2em}}",
    blocks.join("\n{{box|break|padding=2em}}\n"),
    "{{box|end}}",
  ].join("\n");

  return { output, unmapped: [...unmapped].sort(), error: null };
}

// Reads the uploaded .xlsx and hands its first sheet to convertCslRows().
async function convertCsl(file, season) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  return convertCslRows(rows, season);
}

function populateSeasonSelect() {
  const seasonEl = document.getElementById("season");
  const options = buildCslSeasonOptions();

  for (const season of options) {
    const opt = document.createElement("option");
    opt.value = season;
    opt.textContent = season;
    seasonEl.appendChild(opt);
  }

  seasonEl.value = options[options.length - 1];
}

async function runConversion() {
  const fileInput = document.getElementById("fileInput");
  const outputEl = document.getElementById("output");
  const statusEl = document.getElementById("status");
  const seasonEl = document.getElementById("season");
  const file = fileInput.files[0];

  if (!file) {
    statusEl.textContent = "Choose a file first.";
    statusEl.classList.add("status--error");
    return;
  }

  const result = await convertCsl(file, seasonEl.value);

  if (result.error) {
    outputEl.value = "";
    statusEl.textContent = result.error;
    statusEl.classList.add("status--error");
    return;
  }

  outputEl.value = result.output;
  statusEl.classList.remove("status--error");

  if (result.unmapped.length > 0) {
    statusEl.textContent = `Unmapped (left blank — add to CSL_TEAM_NAMES/CSL_STADIUMS in csl.js): ${result.unmapped.join(", ")}`;
  } else {
    statusEl.textContent = "";
  }
}

if (typeof document !== "undefined") {
  const fileInput = document.getElementById("fileInput");
  const fileNameEl = document.getElementById("fileName");
  const dropZone = document.querySelector(".file-drop");

  fileInput.addEventListener("change", () => {
    fileNameEl.textContent = fileInput.files[0] ? fileInput.files[0].name : "No file selected";
  });

  ["dragenter", "dragover"].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    });
  });

  ["dragleave", "dragend"].forEach((evt) => {
    dropZone.addEventListener(evt, () => dropZone.classList.remove("drag-over"));
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");

    const file = e.dataTransfer.files[0];
    if (!file) return;

    fileInput.files = e.dataTransfer.files;
    fileNameEl.textContent = file.name;
  });

  populateSeasonSelect();
  document.getElementById("convertBtn").addEventListener("click", runConversion);
}

if (typeof module !== "undefined") {
  module.exports = { buildCslSeasonOptions, convertCslRows, parseCslDateTime };
}
