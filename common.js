// Shared helpers used by every league's converter page.

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
  // "2026/27" -> "2627"; "2025-26" -> "2526"; "2024" -> "2024"
  // (all compact to 4 characters, for a stable 10-char id)
  const match = season.match(/^(\d{4})[/-](\d{2,4})$/);
  if (match) {
    const [, startYear, endYear] = match;
    return `${startYear.slice(-2)}${endYear.slice(-2).padStart(2, "0")}`;
  }
  return season;
}

// A plain run of calendar-year seasons, e.g. "2004".."2027".
function buildCalendarSeasonOptions(startYear, endYear) {
  const options = [];
  for (let year = startYear; year <= endYear; year++) {
    options.push(String(year));
  }
  return options;
}

// A run of split-year seasons (e.g. "2026/27" or, with separator "-",
// "2025-26"), starting at `startYear` and always extending one season past
// the current year so next year's season is selectable ahead of time.
function buildSplitYearSeasonOptions(startYear, separator) {
  const currentYear = new Date().getFullYear();
  const lastStart = Math.max(startYear, currentYear + 1);
  const options = [];
  for (let start = startYear; start <= lastStart; start++) {
    options.push(`${start}${separator}${String(start + 1).slice(-2)}`);
  }
  return options;
}

function tryParseScore(raw) {
  // Real scores look like "2-1", "2 - 1", "2:1"; unplayed matches show "vs".
  const match = raw.trim().match(/^(\d+)\s*[-–:]\s*(\d+)$/);
  if (!match) return null;
  return { home: parseInt(match[1], 10), away: parseInt(match[2], 10) };
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
  document.getElementById("copyBtn").addEventListener("click", copyOutput);
}

if (typeof module !== "undefined") {
  module.exports = {
    parseDate,
    dateKey,
    formatLongDate,
    seasonCode,
    buildCalendarSeasonOptions,
    buildSplitYearSeasonOptions,
    tryParseScore,
  };
}
