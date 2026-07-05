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

function computeCurrentStreak(totalsByDate, goalForDate) {
  const today = new Date();
  const todayKey = getLocalDate(today);
  const todayGoal = goalForDate(todayKey);
  if (todayGoal <= 0) return 0;
  const todayHit = (totalsByDate[todayKey] || 0) >= todayGoal;
  let streak = 0;
  let cursor = todayHit ? 0 : 1;
  while (true) {
    const key = getLocalDate(addDays(today, -cursor));
    const dayGoal = goalForDate(key);
    if (dayGoal <= 0) break;
    if ((totalsByDate[key] || 0) >= dayGoal) {
      streak++;
      cursor++;
    } else {
      break;
    }
  }
  return streak;
}

function computeBestStreak(totalsByDate, goalForDate) {
  const dates = Object.keys(totalsByDate);
  if (dates.length === 0) return 0;
  dates.sort();
  const earliest = new Date(dates[0]);
  const today = new Date();
  let best = 0, running = 0;
  for (let d = new Date(earliest); d <= today; d = addDays(d, 1)) {
    const key = getLocalDate(d);
    const goal = goalForDate(key);
    if (goal > 0 && (totalsByDate[key] || 0) >= goal) {
      running++;
      if (running > best) best = running;
    } else {
      running = 0;
    }
  }
  return best;
}

function computeRollingStats(totalsByDate, goalForDate) {
  const days = 7;
  const today = new Date();
  let sum = 0, daysHit = 0;
  for (let i = 0; i < days; i++) {
    const key = getLocalDate(addDays(today, -i));
    const t = totalsByDate[key] || 0;
    const g = goalForDate(key);
    sum += t;
    if (g > 0 && t >= g) daysHit++;
  }
  return { avgOzPerDay: sum / days, daysHit, daysInWindow: days };
}

function buildDailySeries(totalsByDate, days, goalForDate) {
  const today = new Date();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = getLocalDate(addDays(today, -i));
    out.push({
      date: key,
      total: totalsByDate[key] || 0,
      goal: goalForDate(key),
    });
  }
  return out;
}

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  return h * 60 + (m || 0);
}
function formatHourLabel(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  if (m === 0) return `${display} ${ampm}`;
  return `${display}:${String(m).padStart(2, "0")} ${ampm}`;
}
function computePace({ currentOz, goalOz, windowStart, windowEnd, now }) {
  if (goalOz > 0 && currentOz >= goalOz) return { status: "goal_hit" };
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = timeToMinutes(windowStart);
  const endMin = timeToMinutes(windowEnd);
  if (nowMin < startMin) return { status: "before_window" };
  if (nowMin > endMin) return { status: "after_window" };
  if (endMin <= startMin || goalOz <= 0) return { status: "on_pace" };
  const windowLen = endMin - startMin;
  const elapsedRatio = (nowMin - startMin) / windowLen;
  const expectedOz = goalOz * elapsedRatio;
  const delta = currentOz - expectedOz;
  const tolerance = Math.max(goalOz * 0.05, 4);
  if (Math.abs(delta) <= tolerance) return { status: "on_pace" };
  if (delta > 0) return { status: "ahead", ozAhead: Math.round(delta) };
  const targetMin = Math.min(Math.ceil((nowMin + 30) / 60) * 60, endMin);
  const targetRatio = (targetMin - startMin) / windowLen;
  const expectedAtTarget = goalOz * targetRatio;
  const catchUpOz = Math.max(0, Math.round(expectedAtTarget - currentOz));
  return {
    status: "behind",
    ozBehind: Math.round(-delta),
    catchUpOz,
    catchUpTimeLabel: formatHourLabel(targetMin),
  };
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
  `/rest/v1/profiles?id=eq.${USER_ID}&select=target_water_oz,quick_add_oz,water_workout_bonus_oz`,
);
const goalOz = profile[0]?.target_water_oz ?? 64;
const bonusOz = profile[0]?.water_workout_bonus_oz ?? 0;
const quickAdd = profile[0]?.quick_add_oz ?? [8, 12, 16, 20];

const logs = await fetchJson(
  `/rest/v1/water_logs?user_id=eq.${USER_ID}&order=date.desc&limit=10000`,
);

const cutoffDate = new Date();
cutoffDate.setDate(cutoffDate.getDate() - 365);
const cutoffStr = getLocalDate(cutoffDate);
const workouts = await fetchJson(
  `/rest/v1/workout_instances?user_id=eq.${USER_ID}&status=in.(in_progress,completed)&scheduled_date=gte.${cutoffStr}&select=scheduled_date`,
);
const workoutDates = new Set(workouts.map((w) => w.scheduled_date));

const goalForDate = (key) =>
  goalOz + (workoutDates.has(key) ? bonusOz : 0);

const totalsByDate = {};
for (const l of logs) {
  totalsByDate[l.date] = (totalsByDate[l.date] || 0) + parseFloat(l.amount_oz);
}

console.log("=".repeat(64));
console.log("SMOKE TEST — water insights against real DB");
console.log("=".repeat(64));
console.log(`Today (local): ${getLocalDate()}`);
console.log(`Base goal: ${goalOz} oz · Workout bonus: +${bonusOz} oz`);
console.log(`Quick-add: [${quickAdd.join(", ")}]`);
console.log(`Total logs: ${logs.length}`);
console.log(`Days with any logs: ${Object.keys(totalsByDate).length}`);
console.log(`Workout days in last 365: ${workoutDates.size}`);
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

const currentStreak = computeCurrentStreak(totalsByDate, goalForDate);
const bestStreak = computeBestStreak(totalsByDate, goalForDate);
const rolling = computeRollingStats(totalsByDate, goalForDate);
const series14 = buildDailySeries(totalsByDate, 14, goalForDate);

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

// Recompute current streak manually for cross-check (per-day goal aware)
{
  let manual = 0;
  const t = new Date();
  const todayKey = getLocalDate(t);
  const todayGoal = goalForDate(todayKey);
  const todayHit = todayGoal > 0 && (totalsByDate[todayKey] || 0) >= todayGoal;
  let cursor = todayHit ? 0 : 1;
  while (true) {
    const k = getLocalDate(addDays(t, -cursor));
    const g = goalForDate(k);
    if (g > 0 && (totalsByDate[k] || 0) >= g) {
      manual++;
      cursor++;
    } else break;
  }
  assert(`current streak matches manual recomputation (${manual})`, manual === currentStreak);
}

// Per-day goal invariants
assert(
  "chart series entries all carry a goal field",
  series14.every((s) => typeof s.goal === "number" && s.goal > 0),
);
if (bonusOz > 0 && workoutDates.size > 0) {
  // Sanity: at least one chart entry on a workout day should have goal = base + bonus
  const workoutEntries = series14.filter((s) => workoutDates.has(s.date));
  if (workoutEntries.length > 0) {
    assert(
      `workout-day chart entries use effective goal (base ${goalOz} + bonus ${bonusOz} = ${goalOz + bonusOz})`,
      workoutEntries.every((s) => s.goal === goalOz + bonusOz),
    );
  }
  // And non-workout days use base goal
  const nonWorkoutEntries = series14.filter((s) => !workoutDates.has(s.date));
  if (nonWorkoutEntries.length > 0) {
    assert(
      `non-workout-day chart entries use base goal (${goalOz})`,
      nonWorkoutEntries.every((s) => s.goal === goalOz),
    );
  }
} else {
  assert(
    "no bonus configured: all chart goals equal base",
    series14.every((s) => s.goal === goalOz),
  );
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
console.log("--- computePace scenarios ---");
function mkDate(h, m = 0) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}
const paceCases = [
  {
    name: "goal hit (currentOz >= goalOz)",
    in: { currentOz: 70, goalOz: 64, windowStart: "08:00", windowEnd: "23:00", now: mkDate(15) },
    expectStatus: "goal_hit",
  },
  {
    name: "before window (7am)",
    in: { currentOz: 0, goalOz: 64, windowStart: "08:00", windowEnd: "23:00", now: mkDate(7) },
    expectStatus: "before_window",
  },
  {
    name: "after window (11:30pm)",
    in: { currentOz: 30, goalOz: 64, windowStart: "08:00", windowEnd: "23:00", now: mkDate(23, 30) },
    expectStatus: "after_window",
  },
  {
    name: "on pace at midday (50% time, ~50% water)",
    in: { currentOz: 32, goalOz: 64, windowStart: "08:00", windowEnd: "23:00", now: mkDate(15, 30) },
    expectStatus: "on_pace",
  },
  {
    name: "ahead at noon (50% time, 80% water)",
    in: { currentOz: 52, goalOz: 64, windowStart: "08:00", windowEnd: "23:00", now: mkDate(15, 30) },
    expectStatus: "ahead",
  },
  {
    name: "behind at 1pm (33% time, 10 oz)",
    in: { currentOz: 10, goalOz: 64, windowStart: "08:00", windowEnd: "23:00", now: mkDate(13) },
    expectStatus: "behind",
  },
  {
    name: "behind very late (10:45pm, 30 oz) - catch up clamped to window end",
    in: { currentOz: 30, goalOz: 64, windowStart: "08:00", windowEnd: "23:00", now: mkDate(22, 45) },
    expectStatus: "behind",
  },
];
let paceFailures = 0;
for (const c of paceCases) {
  const r = computePace(c.in);
  const ok = r.status === c.expectStatus;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${c.name}`);
  console.log(`        result: ${JSON.stringify(r)}`);
  if (!ok) paceFailures++;
}

// Additional checks on the "behind" case
{
  const r = computePace({
    currentOz: 10,
    goalOz: 64,
    windowStart: "08:00",
    windowEnd: "23:00",
    now: mkDate(13),
  });
  console.log(`  ${r.catchUpOz > 0 ? "PASS" : "FAIL"}  behind case yields catchUpOz > 0 (${r.catchUpOz})`);
  console.log(`  ${r.catchUpTimeLabel ? "PASS" : "FAIL"}  behind case yields catchUpTimeLabel (${r.catchUpTimeLabel})`);
  if (!(r.catchUpOz > 0)) paceFailures++;
  if (!r.catchUpTimeLabel) paceFailures++;
}

// Clamp check: catch-up time never past window end
{
  const r = computePace({
    currentOz: 30,
    goalOz: 64,
    windowStart: "08:00",
    windowEnd: "23:00",
    now: mkDate(22, 45),
  });
  if (r.status === "behind") {
    const ok = r.catchUpTimeLabel === "11 PM"; // window end
    console.log(`  ${ok ? "PASS" : "FAIL"}  late-evening catch-up clamps to window end (got ${r.catchUpTimeLabel})`);
    if (!ok) paceFailures++;
  }
}

failures += paceFailures;

// --- Synthetic per-day-goal scenarios (bonus path) ---
console.log();
console.log("--- per-day goal scenarios (synthetic) ---");
{
  // Build a 5-day window where the user hits 70 oz/day every day.
  // Base goal 64, workout bonus 16. Workout on day 2 (so effective goal=80).
  // Expected: streak = 1 (today, day 0) only.  Day 2 misses its 80oz target
  // even though it hit base.
  const today = new Date();
  const totals = {};
  const workouts = new Set();
  for (let i = 0; i < 5; i++) {
    const k = getLocalDate(addDays(today, -i));
    totals[k] = 70;
  }
  workouts.add(getLocalDate(addDays(today, -2)));
  const synGoalForDate = (k) => 64 + (workouts.has(k) ? 16 : 0);
  const synStreak = computeCurrentStreak(totals, synGoalForDate);
  const okSynStreak = synStreak === 2;
  console.log(`  ${okSynStreak ? "PASS" : "FAIL"}  workout-day breaks streak (got ${synStreak}, expected 2)`);
  if (!okSynStreak) failures++;

  // With NO workout days, all 5 days hit base goal -> streak = 5
  const noWorkoutGoal = () => 64;
  const synStreak2 = computeCurrentStreak(totals, noWorkoutGoal);
  const okSynStreak2 = synStreak2 === 5;
  console.log(`  ${okSynStreak2 ? "PASS" : "FAIL"}  no workouts: streak runs all 5 days (got ${synStreak2}, expected 5)`);
  if (!okSynStreak2) failures++;

  // buildDailySeries assigns the right per-day goal
  const series = buildDailySeries(totals, 5, synGoalForDate);
  const bonusDay = series.find((s) => workouts.has(s.date));
  const okBonus = bonusDay && bonusDay.goal === 80;
  console.log(`  ${okBonus ? "PASS" : "FAIL"}  workout-day series entry has goal=80`);
  if (!okBonus) failures++;

  // Rolling stats: 4/5 days hit when bonus active (workout day misses)
  const rolling = computeRollingStats(totals, synGoalForDate);
  // Window is 7 days; 5 days at 70oz with workout on day 2 of those 5.
  // Days 0,1,3,4 hit base (64) = 4 hits. Day 2 fails effective (80). Days 5-6 are 0.
  const okRolling = rolling.daysHit === 4;
  console.log(`  ${okRolling ? "PASS" : "FAIL"}  rolling daysHit accounts for bonus miss (got ${rolling.daysHit}, expected 4)`);
  if (!okRolling) failures++;
}

console.log();
console.log(
  failures === 0
    ? "✓ All invariants passed"
    : `✗ ${failures} invariant(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
