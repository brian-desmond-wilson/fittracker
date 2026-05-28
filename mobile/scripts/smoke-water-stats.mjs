// Smoke test for water-tracking insights.
// Pulls the real user's profile + water_logs via the service-role key,
// runs the stats functions, and prints + hand-verifies the results.
// Run from /mobile: node scripts/smoke-water-stats.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(join(__dirname, "..", ".env"), "utf-8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf("=");
      return [line.slice(0, idx), line.slice(idx + 1)];
    }),
);

const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SERVICE_ROLE;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing EXPO_PUBLIC_SUPABASE_URL or SERVICE_ROLE in .env");
  process.exit(1);
}

const USER_ID = "bd91dc7e-7eb8-4655-b05a-c9f72db39e9e"; // brian

// --- Inline copies of the stat functions (mirror src/lib/waterStats.ts) ---
function getLocalDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d, days) {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function computeCurrentStreak(totalsByDate, goalOz) {
  if (goalOz <= 0) return 0;
  const today = new Date();
  const todayKey = getLocalDate(today);
  const todayHit = (totalsByDate[todayKey] || 0) >= goalOz;
  let streak = 0;
  let cursor = todayHit ? 0 : 1;
  while (true) {
    const key = getLocalDate(addDays(today, -cursor));
    if ((totalsByDate[key] || 0) >= goalOz) {
      streak++;
      cursor++;
    } else {
      break;
    }
  }
  return streak;
}

function computeBestStreak(totalsByDate, goalOz) {
  if (goalOz <= 0) return 0;
  const dates = Object.keys(totalsByDate);
  if (dates.length === 0) return 0;
  dates.sort();
  const earliest = new Date(dates[0]);
  const today = new Date();
  let best = 0, running = 0;
  for (let d = new Date(earliest); d <= today; d = addDays(d, 1)) {
    const key = getLocalDate(d);
    if ((totalsByDate[key] || 0) >= goalOz) {
      running++;
      if (running > best) best = running;
    } else {
      running = 0;
    }
  }
  return best;
}

function computeRollingStats(totalsByDate, goalOz) {
  const days = 7;
  const today = new Date();
  let sum = 0, daysHit = 0;
  for (let i = 0; i < days; i++) {
    const key = getLocalDate(addDays(today, -i));
    const t = totalsByDate[key] || 0;
    sum += t;
    if (goalOz > 0 && t >= goalOz) daysHit++;
  }
  return { avgOzPerDay: sum / days, daysHit, daysInWindow: days };
}

function buildDailySeries(totalsByDate, days) {
  const today = new Date();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = getLocalDate(addDays(today, -i));
    out.push({ date: key, total: totalsByDate[key] || 0 });
  }
  return out;
}

// --- Pull real data ---
async function fetchJson(path) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

const profile = await fetchJson(
  `/rest/v1/profiles?id=eq.${USER_ID}&select=target_water_oz,quick_add_oz`,
);
const goalOz = profile[0]?.target_water_oz ?? 64;
const quickAdd = profile[0]?.quick_add_oz ?? [8, 12, 16, 20];

const logs = await fetchJson(
  `/rest/v1/water_logs?user_id=eq.${USER_ID}&order=date.desc&limit=10000`,
);

const totalsByDate = {};
for (const l of logs) {
  totalsByDate[l.date] = (totalsByDate[l.date] || 0) + parseFloat(l.amount_oz);
}

console.log("=".repeat(64));
console.log("SMOKE TEST — water insights against real DB");
console.log("=".repeat(64));
console.log(`Today (local): ${getLocalDate()}`);
console.log(`Goal: ${goalOz} oz · Quick-add: [${quickAdd.join(", ")}]`);
console.log(`Total logs: ${logs.length}`);
console.log(`Days with any logs: ${Object.keys(totalsByDate).length}`);
console.log();

console.log("--- Per-day totals (last 30 days where data exists) ---");
const sortedDates = Object.keys(totalsByDate).sort().reverse().slice(0, 30);
for (const d of sortedDates) {
  const total = totalsByDate[d];
  const hit = total >= goalOz ? "✓" : " ";
  console.log(`  ${d}  ${hit}  ${total.toFixed(1)} oz`);
}
if (sortedDates.length === 0) console.log("  (no logs found)");
console.log();

const currentStreak = computeCurrentStreak(totalsByDate, goalOz);
const bestStreak = computeBestStreak(totalsByDate, goalOz);
const rolling = computeRollingStats(totalsByDate, goalOz);
const series14 = buildDailySeries(totalsByDate, 14);

console.log("--- Stats ---");
console.log(`Current streak:  ${currentStreak}`);
console.log(`Best streak:     ${bestStreak}`);
console.log(`Avg oz/day (7d): ${rolling.avgOzPerDay.toFixed(1)}`);
console.log(`Goal hit (7d):   ${rolling.daysHit}/${rolling.daysInWindow}`);
console.log();

console.log("--- Chart series (last 14 days) ---");
for (const { date, total } of series14) {
  const ratio = goalOz > 0 ? total / goalOz : 0;
  const bar = "█".repeat(Math.round(Math.min(ratio, 1.2) * 20));
  const flag = total >= goalOz ? " ✓" : "";
  console.log(`  ${date}  ${total.toFixed(1).padStart(6)} oz  ${bar}${flag}`);
}
console.log();

// --- Sanity assertions ---
let failures = 0;
function assert(label, cond) {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    console.log(`  FAIL  ${label}`);
    failures++;
  }
}

console.log("--- Invariants ---");
assert("current streak is non-negative", currentStreak >= 0);
assert("best streak is non-negative", bestStreak >= 0);
assert("best streak >= current streak", bestStreak >= currentStreak);
assert("avg is non-negative", rolling.avgOzPerDay >= 0);
assert(
  "days hit in window is 0..7",
  rolling.daysHit >= 0 && rolling.daysHit <= rolling.daysInWindow,
);
assert("chart series has 14 entries", series14.length === 14);
assert(
  "chart series is ordered oldest -> newest",
  series14[0].date <= series14[13].date,
);
assert(
  "chart series last entry is today",
  series14[13].date === getLocalDate(),
);

// Recompute current streak manually for cross-check
{
  const today = getLocalDate();
  let manual = 0;
  const todayHit = (totalsByDate[today] || 0) >= goalOz;
  let cursor = todayHit ? 0 : 1;
  const t = new Date();
  while (true) {
    const k = getLocalDate(addDays(t, -cursor));
    if ((totalsByDate[k] || 0) >= goalOz) {
      manual++;
      cursor++;
    } else break;
  }
  assert(`current streak matches manual recomputation (${manual})`, manual === currentStreak);
}

// Sum of chart series totals = sum of 14-day totals
{
  const today = new Date();
  let manualSum = 0;
  for (let i = 0; i < 14; i++) {
    manualSum += totalsByDate[getLocalDate(addDays(today, -i))] || 0;
  }
  const seriesSum = series14.reduce((s, x) => s + x.total, 0);
  assert(
    `chart-series sum (${seriesSum.toFixed(1)}) === manual sum (${manualSum.toFixed(1)})`,
    Math.abs(seriesSum - manualSum) < 0.001,
  );
}

console.log();
console.log(
  failures === 0
    ? "✓ All invariants passed"
    : `✗ ${failures} invariant(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
