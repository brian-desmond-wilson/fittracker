# Rest Day & Tomorrow Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On Training > Today, an empty day can be declared a rest day (full rest or active recovery); declaring it immediately composes a read-only preview of tomorrow's session from assumed inputs, confirmed or recomposed by the normal morning check-in.

**Architecture:** Rest is a new terminal `rested` status on `generated_sessions`. Active recovery is a real session forced into recovery shape via a new `force_recovery` flag on the check-in. Tomorrow's draft is a normal `suggested` session for tomorrow's date, composed by the existing pipeline — which Task 6 extracts out of `useDailySession` into a date-parameterized `composeDay()` — with assumed inputs stored in `inputs_snapshot.assumed`. The morning check-in either matches the draft's compose signature (draft kept byte-for-byte) or recomposes.

**Tech Stack:** Expo React Native, Supabase (untyped JS client — a green typecheck proves nothing about schema), Jest + ts-jest for the pure libs, Supabase CLI for migrations and edge-function deploy.

**Spec:** `docs/superpowers/specs/2026-08-24-rest-day-design.md`

**Repo rules that bind every task:**
- Run all JS tooling from `mobile/` (`npm test -- <pattern>`, `npx tsc --noEmit`).
- DB changes go through `npx supabase db push --yes` from the repo root — never hand SQL to the user.
- Bottom sheets use `Modal` + `presentationStyle="pageSheet"` (see `SetupSheet.tsx`). Primary actions sit at the end of scrollable content, never pinned.
- Solo repo: work on a branch, merge straight to `main`, never a PR.
- Commit steps below assume the user has authorized committing at execution time (see handoff note); if not, stop at each commit step and ask.

## File Structure

| File | Role |
|---|---|
| `supabase/migrations/20260824100000_rest_days.sql` | Create: `rested` status, rested-per-day index, `daily_checkins.force_recovery` |
| `mobile/src/types/daily.ts` | Modify: `rested` in status union, `forceRecovery` on `DailyCheckin`, `AssumedInputs`, `assumedInputs` on `StoredSession` |
| `mobile/src/lib/dailyAdopt.ts` | Modify: `pickDaySession` surfaces `rested` |
| `mobile/src/lib/dailyBlockShortlist.ts` | Modify: `effectiveRecovery` honors `forceRecovery` |
| `mobile/src/lib/dailyRest.ts` | Create: assumed-input assembly, minutes median/snap, soreness decay, `wasRestDay` |
| `mobile/src/lib/composeDay.ts` | Create: the compose pipeline extracted from `useDailySession`, date-parameterized; plus `composeTomorrowDraft` |
| `mobile/src/hooks/useDailySession.ts` | Modify: delegates to `composeDay` |
| `mobile/src/lib/supabase/daily.ts` | Modify: `restToday`, `unrestToday`, `fetchRestedYesterday`, `fetchLatestCheckin`, `fetchRecentCheckinMinutes`, `force_recovery` plumbing, `assumedInputs` on fetch, `hasRested` in `fetchDayStatus`, adopt clears rest |
| `mobile/src/components/training/daily/RestSheet.tsx` | Create: the rest-day bottom sheet |
| `mobile/src/components/training/daily/TomorrowPreview.tsx` | Create: read-only preview card |
| `mobile/src/components/training/daily/TodayTab.tsx` | Modify: entry point, rest-day card, draft-confirm, preview wiring |
| `mobile/src/components/training/daily/SetupSheet.tsx` | Modify: carry `forceRecovery`, minutes constant moves to lib |
| `mobile/src/components/DailySessionHomeCard.tsx` | Modify: rested state |
| `mobile/src/components/track/gym-sessions/GymSessionsScreen.tsx` + `HistoryCalendar.tsx` | Modify: rest marks |
| `supabase/functions/compose-session/index.ts` | Modify: `yesterdayWasRest` prompt line |
| Tests | `mobile/src/lib/__tests__/dailyRest.test.ts` (new), `dailyAdopt.test.ts`, `dailyBlockShortlist.test.ts` (extend) |

---

### Task 1: Migration — `rested` status, rested-day index, `force_recovery`

**Files:**
- Create: `supabase/migrations/20260824100000_rest_days.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Rest days (spec 2026-08-24): a user-chosen terminal day state, and the flag
-- that lets an "active recovery" check-in force the recovery day shape.

-- 'rested' is TERMINAL: it lives outside generated_sessions_pending_day
-- (which covers only suggested/accepted), so un-resting and then composing a
-- real session never collides with it.
ALTER TABLE generated_sessions
  DROP CONSTRAINT generated_sessions_status_check;
ALTER TABLE generated_sessions
  ADD CONSTRAINT generated_sessions_status_check
  CHECK (status IN ('suggested', 'accepted', 'completed', 'skipped', 'rested'));

-- At most one rest record per day, same shape as the pending-day index.
CREATE UNIQUE INDEX IF NOT EXISTS generated_sessions_rested_day
  ON generated_sessions (user_id, session_date)
  WHERE status = 'rested';

-- Mirror of override_recovery, opposite direction: override cancels a
-- recovery call, force creates one. effectiveRecovery() reads both.
ALTER TABLE daily_checkins
  ADD COLUMN IF NOT EXISTS force_recovery BOOLEAN NOT NULL DEFAULT FALSE;
```

- [ ] **Step 2: Push and verify**

Run (repo root): `npx supabase db push --yes`
Expected: migration `20260824100000` applies cleanly.
Run: `npx supabase migration list`
Expected: `20260824100000` shows as applied on remote.

If the `DROP CONSTRAINT` fails with "does not exist", find the real name with `npx supabase db dump --schema public 2>&1 | grep -n "status.*CHECK" ` and fix the migration to match (the constraint was created inline in `20260817100000_daily_loop_schema.sql:57`, so the Postgres default name `generated_sessions_status_check` is expected).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260824100000_rest_days.sql
git commit -m "feat(daily): schema for rest days and forced recovery"
```

---

### Task 2: `pickDaySession` surfaces rested; status type

**Files:**
- Modify: `mobile/src/types/daily.ts:125`
- Modify: `mobile/src/lib/dailyAdopt.ts:58-72`
- Test: `mobile/src/lib/__tests__/dailyAdopt.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the `pickDaySession` describe block in `dailyAdopt.test.ts` (match the file's existing row-literal style):

```ts
it("surfaces a rested row when the day holds nothing else", () => {
  const rested = { id: "r1", status: "rested", createdAt: "2026-08-24T20:00:00Z" };
  expect(pickDaySession([rested])).toBe(rested);
});

it("a pending session beats a rested row", () => {
  const rested = { id: "r1", status: "rested", createdAt: "2026-08-24T08:00:00Z" };
  const pending = { id: "p1", status: "suggested", createdAt: "2026-08-24T09:00:00Z" };
  expect(pickDaySession([rested, pending])).toBe(pending);
});

it("a completed session beats a rested row", () => {
  const rested = { id: "r1", status: "rested", createdAt: "2026-08-24T08:00:00Z" };
  const done = { id: "c1", status: "completed", createdAt: "2026-08-24T10:00:00Z" };
  expect(pickDaySession([rested, done])).toBe(done);
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run (from `mobile/`): `npm test -- dailyAdopt`
Expected: the first new test FAILS (`pickDaySession` returns null for a rested-only day); the other two pass vacuously or fail — either is fine, the first must fail.

- [ ] **Step 3: Implement**

In `dailyAdopt.ts`, replace the final `return null;` of `pickDaySession` (and update its docblock's last sentence):

```ts
  // A deliberate rest day is the day's answer when nothing was trained —
  // skipped rows stay invisible, but rest is a decision the tab must show.
  const rested = rows.filter((r) => r.status === "rested");
  if (rested.length > 0) {
    return [...rested].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }
  return null;
```

In `types/daily.ts:125` change:

```ts
  status: "suggested" | "accepted" | "completed" | "skipped" | "rested";
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- dailyAdopt` → all pass.
Run: `npx tsc --noEmit` → no errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/dailyAdopt.ts mobile/src/types/daily.ts mobile/src/lib/__tests__/dailyAdopt.test.ts
git commit -m "feat(daily): rested is a day state the reader surfaces"
```

---

### Task 3: `force_recovery` end to end

**Files:**
- Modify: `mobile/src/lib/dailyBlockShortlist.ts:35-41`
- Modify: `mobile/src/types/daily.ts` (`DailyCheckin`)
- Modify: `mobile/src/lib/supabase/daily.ts` (`fetchTodayCheckin`, `SaveCheckinInput`, `saveCheckin`)
- Modify: `mobile/src/components/training/daily/SetupSheet.tsx:73-81`
- Test: `mobile/src/lib/__tests__/dailyBlockShortlist.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `dailyBlockShortlist.test.ts`:

```ts
describe("effectiveRecovery with force_recovery", () => {
  it("forceRecovery makes an unremarkable day a recovery day", () => {
    expect(effectiveRecovery({ energy: 7, soreness: {}, overrideRecovery: false, forceRecovery: true }))
      .toBe(true);
  });
  it("train-anyway still wins over a forced recovery", () => {
    expect(effectiveRecovery({ energy: 7, soreness: {}, overrideRecovery: true, forceRecovery: true }))
      .toBe(false);
  });
  it("absent force changes nothing", () => {
    expect(effectiveRecovery({ energy: 7, soreness: {}, overrideRecovery: false, forceRecovery: false }))
      .toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- dailyBlockShortlist`
Expected: FAIL — TypeScript rejects `forceRecovery` on the parameter type (compile error counts as the failing state here).

- [ ] **Step 3: Implement `effectiveRecovery`**

Replace `effectiveRecovery` in `dailyBlockShortlist.ts` (extend the docblock: forced recovery is the active-recovery tap; the same "train anyway" override is its escape hatch):

```ts
export function effectiveRecovery(checkin: {
  energy: number;
  soreness: Record<string, number>;
  overrideRecovery: boolean;
  forceRecovery: boolean;
}): boolean {
  return (isRecoveryDay(checkin) || checkin.forceRecovery) && !checkin.overrideRecovery;
}
```

- [ ] **Step 4: Thread the field through the data layer**

`types/daily.ts`, in `DailyCheckin` after `overrideRecovery`:

```ts
  /** "Active recovery": the user asked for a recovery-shaped day outright.
   *  overrideRecovery still cancels it — same escape hatch as a called one. */
  forceRecovery: boolean;
```

`lib/supabase/daily.ts` — three edits:

1. `fetchTodayCheckin` select string gains `force_recovery`, and the return gains:
```ts
    forceRecovery: !!(data as any).force_recovery,
```
2. `SaveCheckinInput` gains:
```ts
  /** Active recovery asked for this day's shape directly. Carried through
   *  re-saves the same way overrideRecovery is. */
  forceRecovery?: boolean;
```
3. `saveCheckin`'s upsert row gains:
```ts
          force_recovery: input.forceRecovery ?? false,
```

`SetupSheet.tsx` `handleSave`'s `saveCheckin` call gains, beside the `overrideRecovery` line:
```ts
      // Same carry rule as the override: editing minutes must not silently
      // undo an active-recovery day (train-anyway is the way out of one).
      forceRecovery: existing?.forceRecovery ?? false,
```

- [ ] **Step 5: Fix remaining compile errors**

`useDailySession.ts` and `TodayTab.tsx` construct/consume `DailyCheckin` — run `npx tsc --noEmit`; any object-literal `DailyCheckin` in tests or code needs `forceRecovery: false` added. Fix all reported sites.

- [ ] **Step 6: Run tests + typecheck**

Run: `npm test -- dailyBlockShortlist` → pass. Run: `npm test` → full suite green. Run: `npx tsc --noEmit` → clean.

- [ ] **Step 7: Commit**

```bash
git add -A mobile/src
git commit -m "feat(daily): a check-in can force the recovery day shape"
```

---

### Task 4: Compose signature drops the check-in id

**Files:**
- Modify: `mobile/src/hooks/useDailySession.ts:465-475`

The signature currently includes `todayCheckin.id`. The id is 1:1 with `(user, date)` and stable across same-day edits (the check-in is an upsert on that pair), so it adds nothing `today` doesn't already say — and it is the one component a draft composed before its check-in exists can never reproduce. Removing it is what lets an unchanged morning confirm keep the draft byte-for-byte.

- [ ] **Step 1: Edit the signature array**

In `useDailySession.ts`, change:

```ts
      const signature = [
        today, todayCheckin.id, todayCheckin.minutesAvailable,
```
to:
```ts
      // No checkin id: it is 1:1 with (user, date) and stable across edits,
      // so `today` already says it — and tomorrow's draft, composed before
      // its check-in exists, must be able to produce the same signature the
      // morning's real inputs will.
      const signature = [
        today, todayCheckin.minutesAvailable,
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → clean.

Note (expected, harmless): every stored suggested session recomposes once after this ships, because its stored signature no longer matches. One-time, self-healing.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/hooks/useDailySession.ts
git commit -m "refactor(daily): compose signature keys on the date, not the checkin id"
```

---

### Task 5: `dailyRest.ts` — assumed inputs and `wasRestDay`

**Files:**
- Create: `mobile/src/lib/dailyRest.ts`
- Modify: `mobile/src/types/daily.ts` (add `AssumedInputs`, extend `StoredSession`)
- Modify: `mobile/src/components/training/daily/SetupSheet.tsx` (import `MINUTES_OPTIONS`)
- Test: `mobile/src/lib/__tests__/dailyRest.test.ts`

- [ ] **Step 1: Add the types**

`types/daily.ts`, after `DailyCheckin`:

```ts
/** The guesses a tomorrow-draft was composed from — stored in the session's
 *  inputs_snapshot.assumed, and what the morning confirm turns into a real
 *  check-in. */
export interface AssumedInputs {
  energy: number;
  minutesAvailable: number;
  /** muscle_regions.name → severity 1-3 */
  soreness: Record<string, number>;
}
```

And in `StoredSession`, after `composeSignature`:

```ts
  /** Set when this session is a tomorrow-draft composed from guesses rather
   *  than a real check-in. NULL for every normally composed session. */
  assumedInputs: AssumedInputs | null;
```

(`fetchTodaySession` learns to populate it in Task 7 — until then every construction site must pass `assumedInputs: null`; `npx tsc --noEmit` will list them.)

- [ ] **Step 2: Write the failing tests**

Create `mobile/src/lib/__tests__/dailyRest.test.ts`:

```ts
import {
  assumedInputs, decayedSoreness, medianMinutes, snapToMinutesOption,
  wasRestDay, ASSUMED_ENERGY, MINUTES_OPTIONS,
} from "../dailyRest";

describe("medianMinutes", () => {
  it("odd count takes the middle", () => {
    expect(medianMinutes([30, 60, 90])).toBe(60);
  });
  it("even count averages the middle pair", () => {
    expect(medianMinutes([45, 60, 90, 120])).toBe(75);
  });
  it("empty history falls back to 60", () => {
    expect(medianMinutes([])).toBe(60);
  });
});

describe("snapToMinutesOption", () => {
  it("snaps to the nearest offered session length", () => {
    expect(snapToMinutesOption(75)).toBe(90); // 75 is equidistant; ties go up
    expect(snapToMinutesOption(50)).toBe(45);
    expect(snapToMinutesOption(200)).toBe(180);
  });
  it("an exact option stands", () => {
    for (const m of MINUTES_OPTIONS) expect(snapToMinutesOption(m)).toBe(m);
  });
});

describe("decayedSoreness", () => {
  it("each region steps down one and 1s drop out", () => {
    expect(decayedSoreness({ Quads: 3, Chest: 2, Calves: 1 }))
      .toEqual({ Quads: 2, Chest: 1 });
  });
  it("empty stays empty", () => {
    expect(decayedSoreness({})).toEqual({});
  });
});

describe("assumedInputs", () => {
  it("assembles neutral energy, snapped median minutes, decayed soreness", () => {
    const out = assumedInputs({ soreness: { Quads: 2 } }, [60, 60, 90]);
    expect(out).toEqual({
      energy: ASSUMED_ENERGY,
      minutesAvailable: 60,
      soreness: { Quads: 1 },
    });
  });
  it("no prior check-in means no soreness and the fallback hour", () => {
    expect(assumedInputs(null, [])).toEqual({
      energy: ASSUMED_ENERGY, minutesAvailable: 60, soreness: {},
    });
  });
});

describe("wasRestDay", () => {
  it("a rested row is a rest day", () => {
    expect(wasRestDay([{ status: "rested", blocks: [] }])).toBe(true);
  });
  it("a completed recovery-shaped day (blocks, no main, no warmup) counts", () => {
    expect(wasRestDay([
      { status: "completed", blocks: [{ block: "mobility" }, { block: "cooldown" }] },
    ])).toBe(true);
  });
  it("a completed trained day does not", () => {
    expect(wasRestDay([
      { status: "completed", blocks: [{ block: "warmup" }, { block: "main" }] },
    ])).toBe(false);
  });
  it("no rows is not a rest day — it is an unknown day", () => {
    expect(wasRestDay([])).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- dailyRest`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `dailyRest.ts`**

```ts
// What a tomorrow-draft assumes, and what counts as "yesterday was rest".
// Pure — the fetches live in supabase/daily.ts and composeDay.ts.
// Spec: docs/superpowers/specs/2026-08-24-rest-day-design.md.
import type { AssumedInputs } from "../types/daily";

/** The session lengths the setup sheet offers. Canonical home — the sheet
 *  imports these, and the assumed minutes snap to them so the morning
 *  prefill highlights a real pill. */
export const MINUTES_OPTIONS = [30, 45, 60, 90, 120, 150, 180];

/** Mid-scale, deliberately not the sheet's optimistic default of 7: a guess
 *  about tomorrow should claim less than the user claims about today. */
export const ASSUMED_ENERGY = 6;

/** An active-recovery day's time budget — mobility + cooldown fit in it. */
export const ACTIVE_RECOVERY_MINUTES = 15;

export function medianMinutes(recent: number[], fallback = 60): number {
  if (recent.length === 0) return fallback;
  const sorted = [...recent].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function snapToMinutesOption(minutes: number): number {
  let best = MINUTES_OPTIONS[0];
  for (const option of MINUTES_OPTIONS) {
    // <= so a tie snaps up: guessing slightly long costs a shorter compose,
    // guessing short would clip the main block.
    if (Math.abs(option - minutes) <= Math.abs(best - minutes)) best = option;
  }
  return best;
}

/** Overnight, everything heals one step; what reaches 0 leaves the map. */
export function decayedSoreness(
  soreness: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [region, severity] of Object.entries(soreness)) {
    if (severity - 1 >= 1) out[region] = severity - 1;
  }
  return out;
}

export function assumedInputs(
  lastCheckin: { soreness: Record<string, number> } | null,
  recentMinutes: number[],
): AssumedInputs {
  return {
    energy: ASSUMED_ENERGY,
    minutesAvailable: snapToMinutesOption(medianMinutes(recentMinutes)),
    soreness: decayedSoreness(lastCheckin?.soreness ?? {}),
  };
}

/** One day's generated_sessions rows, as rest-detection needs them. */
export interface DayRestRow {
  status: string;
  blocks: { block: string }[];
}

/**
 * Was this day deliberate rest? A rested row says so outright; a completed
 * recovery-shaped session (blocks, but no main and no warmup — the same
 * shape blockDayShape calls "recovery") says it too. No rows says nothing:
 * an empty day is unknown, not rest.
 */
export function wasRestDay(rows: DayRestRow[]): boolean {
  return rows.some((r) => {
    if (r.status === "rested") return true;
    if (r.status !== "completed" || r.blocks.length === 0) return false;
    const roles = new Set(r.blocks.map((b) => b.block));
    return !roles.has("main") && !roles.has("warmup");
  });
}
```

- [ ] **Step 5: Point `SetupSheet` at the moved constant**

In `SetupSheet.tsx`, delete the local `MINUTES_OPTIONS` array (line 20) and add to the imports:

```ts
import { MINUTES_OPTIONS } from "@/src/lib/dailyRest";
```

- [ ] **Step 6: Run tests + typecheck; fix `assumedInputs: null` sites**

Run: `npm test -- dailyRest` → pass. Run: `npx tsc --noEmit`; add `assumedInputs: null` where `StoredSession` literals are built (expect `fetchTodaySession` in `lib/supabase/daily.ts`; possibly test fixtures). Run: `npm test` → full suite green.

- [ ] **Step 7: Commit**

```bash
git add -A mobile/src
git commit -m "feat(daily): assumed-input assembly and rest-day detection"
```

---

### Task 6: Extract `composeDay` from `useDailySession`

**Files:**
- Create: `mobile/src/lib/composeDay.ts`
- Modify: `mobile/src/hooks/useDailySession.ts`

This is a mechanical extraction — no behavior change. The hook keeps: React state, auth, the run-id guard, the three initial fetches (`fetchGyms`, `fetchTodayCheckin`, `fetchTodaySession`), the no-checkin and already-decided gates, and the composeAnother/adjustFocus one-shots. Everything from the coverage-window fetch through `saveGeneratedSession` moves.

- [ ] **Step 1: Create `composeDay.ts` with the moved pipeline**

Create `mobile/src/lib/composeDay.ts`. Move, verbatim except for the substitutions below, from `useDailySession.ts`:

- The imports the moved code uses (everything except React and the four state-only imports).
- Module-scope pieces: `AI_RETRY_DELAY_MS`, `CachedAnswer`, `aiAnswerByAskKey`, `aiAskInFlight`, `COVERAGE_WINDOW_DAYS`, `CLASSIFY_ATTEMPTS_PER_DAY`, `CLASSIFY_POOL`, `CLASSIFY_PER_RUN`, `ClassifyState`, `classifyByWorkout`, `pooled`, `askComposeSession` (lines 61–155).
- The pipeline body: lines 249–671 of the current file — from `const activeGym = gymList.find(...)` down through the `saveGeneratedSession` call — INCLUDING the classification backfill (its `captured`/`muscleNames` fetches are in the Promise.all that moves) and the `fetchTaggedWorkouts` read.

Wrap it in:

```ts
export interface ComposeDayParams {
  userId: string;
  /** The calendar day being composed — today for the hook, tomorrow for a draft. */
  date: string;
  /** Real or assumed inputs. An assumed check-in has no row; see checkinId. */
  checkin: DailyCheckin;
  /** NULL for a draft: the check-in row doesn't exist yet. */
  checkinId: string | null;
  activeGymId: string | null;
  /** The day's session already on file (fetchTodaySession for `date`). */
  existing: StoredSession | null;
  appendToDay: boolean;
  adjustFocus: BlockRole | null;
  /** Extra keys merged into inputs_snapshot — the draft's `assumed` rides here. */
  snapshotExtras?: Record<string, unknown>;
  /** Checked at every point the hook's run-id guard sat; true aborts without
   *  writing. The final pre-save check is the one that matters. */
  isStale?: () => boolean;
}

/** The compose pipeline, exactly as the hook ran it, minus React. Throws the
 *  same catalog/ledger read errors the hook used to; the caller decides what
 *  the screen does with them. */
export async function composeDay(
  params: ComposeDayParams,
): Promise<{ sessionId: string | null }> {
  const { userId, date, checkin, existing, appendToDay, adjustFocus } = params;
  const stale = () => params.isStale?.() === true;
  // ... moved body ...
  return { sessionId };
}
```

Substitutions in the moved body — apply every one:

| Was (in the hook) | Becomes (in composeDay) |
|---|---|
| `today` | `date` |
| `todayCheckin` | `checkin` |
| `user.id` | `userId` |
| `const activeGym = gymList.find((g) => g.isActive) ?? null;` | delete (params carry the id) |
| `gymProfileId: activeGym?.id ?? null` | `gymProfileId: params.activeGymId` |
| `checkinId: todayCheckin.id` | `checkinId: params.checkinId` |
| `if (runId !== runIdRef.current) return;` (each of the 4 occurrences inside the moved region) | `if (stale()) return { sessionId: null };` |
| `setSession(existing); throw new Error("couldn't read your workout catalog");` | `throw new Error("couldn't read your workout catalog");` |
| `setSession(existing); throw new Error("couldn't read your training history");` | `throw new Error("couldn't read your training history");` |
| the early-return signature gate: `setSession(existing); setLoading(false); return;` | `return { sessionId: existing.id };` |
| `inputsSnapshot: { aiBody, shortlists }` | `inputsSnapshot: { aiBody, shortlists, ...(params.snapshotExtras ?? {}) }` |
| final `if (sessionId) { setSession(...) }` | delete — end with `return { sessionId };` |

- [ ] **Step 2: Gut the hook to delegate**

In `useDailySession.ts`, delete the moved module-scope pieces and imports they alone used. Replace lines 249–674 (from `const activeGym = ...` through the trailing `setSession(await fetchTodaySession(...))` block) with:

```ts
      const activeGym = gymList.find((g) => g.isActive) ?? null;
      let composed: { sessionId: string | null };
      try {
        composed = await composeDay({
          userId: user.id,
          date: today,
          checkin: todayCheckin,
          checkinId: todayCheckin.id,
          activeGymId: activeGym?.id ?? null,
          existing,
          appendToDay,
          adjustFocus,
          isStale: () => runId !== runIdRef.current,
        });
      } catch (e) {
        // The pipeline's read-failure aborts published the stored day before
        // throwing when it lived here; keep that contract.
        if (runId === runIdRef.current) setSession(existing);
        throw e;
      }
      if (runId !== runIdRef.current) return;
      if (composed.sessionId) {
        setSession(await fetchTodaySession(user.id, today));
      } else {
        setSession(existing);
      }
```

Add the import: `import { composeDay } from "../lib/composeDay";`

Note the one deliberate delta: when composeDay's signature gate answers early with the existing session's id, the hook now re-fetches it — one extra read, same rendered result. Everything else is identical.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` → clean.
Run: `npm test` → full suite green (the pure-lib tests are the pipeline's tests; the hook has none).
Read the new `composeDay.ts` top to bottom once against the substitution table — the untyped Supabase client will not catch a missed `today`/`date` swap, and a missed one composes the wrong day.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/lib/composeDay.ts mobile/src/hooks/useDailySession.ts
git commit -m "refactor(daily): extract the compose pipeline from the hook, date-parameterized"
```

---

### Task 7: Data layer — rest writes, draft reads, rested visibility

**Files:**
- Modify: `mobile/src/lib/supabase/daily.ts`

- [ ] **Step 1: `fetchTodaySession` carries the draft marker**

In the select string, after `compose_signature, day_reason, created_at,` add a computed field (PostgREST JSON arrow):

```
      assumed:inputs_snapshot->assumed,
```

And in the returned object, after `dayReason`:

```ts
    assumedInputs: ((data as any).assumed ?? null) as AssumedInputs | null,
```

Add `AssumedInputs` to the type imports from `../../types/daily`. Remove the temporary `assumedInputs: null` placed there in Task 5.

- [ ] **Step 2: New reads**

Add to `daily.ts` (imports: `getLocalDateString`, `addDays`, `parseLocalDate` from `../dates`; `wasRestDay` from `../dailyRest`):

```ts
/** The most recent check-in on or before `date` — soreness worth carrying
 *  into a guess. Null = the user has never checked in. */
export async function fetchLatestCheckin(
  userId: string,
  date: string,
): Promise<DailyCheckin | null> {
  const { data, error } = await supabase
    .from("daily_checkins")
    .select("id, checkin_date, energy, minutes_available, override_recovery, force_recovery, daily_checkin_soreness(severity, muscle_regions(name))")
    .eq("user_id", userId)
    .lte("checkin_date", date)
    .order("checkin_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("fetchLatestCheckin failed:", error);
    return null;
  }
  const soreness: Record<string, number> = {};
  for (const s of (data as any).daily_checkin_soreness ?? []) {
    const name = s.muscle_regions?.name;
    if (name) soreness[name] = s.severity;
  }
  return {
    id: data.id,
    checkinDate: data.checkin_date,
    energy: data.energy,
    minutesAvailable: data.minutes_available,
    overrideRecovery: !!(data as any).override_recovery,
    forceRecovery: !!(data as any).force_recovery,
    soreness,
  };
}

/** Session lengths from recent check-ins — the median becomes tomorrow's
 *  guess. Active-recovery check-ins are excluded: their 15 minutes describe
 *  a recovery day, not a typical session. */
export async function fetchRecentCheckinMinutes(
  userId: string,
  limit = 14,
): Promise<number[]> {
  const { data, error } = await supabase
    .from("daily_checkins")
    .select("minutes_available, force_recovery")
    .eq("user_id", userId)
    .order("checkin_date", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("fetchRecentCheckinMinutes failed:", error);
    return [];
  }
  return (data ?? [])
    .filter((r: any) => !r.force_recovery)
    .map((r: any) => r.minutes_available);
}

/** Was the day before `date` deliberate rest? Rested row, or a completed
 *  recovery-shaped session. Steers the compose prompt only. */
export async function fetchRestedYesterday(
  userId: string,
  date: string,
): Promise<boolean> {
  const yesterday = getLocalDateString(addDays(parseLocalDate(date), -1));
  const { data, error } = await supabase
    .from("generated_sessions")
    .select("status, blocks:generated_session_blocks(block)")
    .eq("user_id", userId)
    .eq("session_date", yesterday);
  if (error || !data) return false;
  return wasRestDay(data as any);
}

/** Every deliberately rested date — the calendar's rest marks. */
export async function fetchRestDates(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("generated_sessions")
    .select("session_date")
    .eq("user_id", userId)
    .eq("status", "rested");
  if (error) {
    console.error("fetchRestDates failed:", error);
    return new Set();
  }
  return new Set((data ?? []).map((r: any) => r.session_date));
}
```

- [ ] **Step 3: Rest writes**

Add:

```ts
/**
 * Declare `date` a full rest day. Inside the suggest-only boundary: runs from
 * the user's tap. Refuses when the day already holds an open session — the UI
 * only offers rest on an empty day, and a race must not double-book it.
 */
export async function restToday(userId: string, date: string): Promise<boolean> {
  try {
    const status = await fetchDayStatus(userId, date);
    if (status.hasPending || status.hasRested) return false;
    const { data: firstRow } = await supabase
      .from("generated_sessions")
      .select("session_date")
      .eq("user_id", userId)
      .order("session_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase.from("generated_sessions").insert({
      user_id: userId,
      session_date: date,
      gym_profile_id: null,
      checkin_id: null,
      split_day: null, // rest moves no rotation
      ramp_week: rampWeek(firstRow?.session_date ?? null, date),
      source: "user_pick",
      served_captured_workout_id: null,
      section_minutes: null,
      status: "rested",
      day_reason: "Rest day — your call.",
      inputs_snapshot: { restKind: "full" },
    });
    if (error) throw error;
    return true;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.error("restToday failed:", err?.code ?? "", err?.message ?? String(e));
    return false;
  }
}

/**
 * Undo a rest day: the rest record goes, and tomorrow's draft goes with it
 * when the draft is still an untouched guess (suggested + assumed). A draft
 * the user has already confirmed or started is theirs and stays.
 */
export async function unrestToday(userId: string, date: string): Promise<boolean> {
  const tomorrow = getLocalDateString(addDays(parseLocalDate(date), 1));
  const { error } = await supabase
    .from("generated_sessions")
    .delete()
    .eq("user_id", userId)
    .eq("session_date", date)
    .eq("status", "rested");
  if (error) {
    console.error("unrestToday failed:", error);
    return false;
  }
  const { error: draftError } = await supabase
    .from("generated_sessions")
    .delete()
    .eq("user_id", userId)
    .eq("session_date", tomorrow)
    .eq("status", "suggested")
    .not("inputs_snapshot->assumed", "is", null);
  // The rest record is gone either way — that is the undo. A surviving draft
  // is recomposed or replaced by tomorrow's normal flow, so log, don't fail.
  if (draftError) console.error("unrestToday draft delete failed:", draftError);
  return true;
}
```

- [ ] **Step 4: `fetchDayStatus` gains `hasRested`; adoption voids rest**

`fetchDayStatus`: change the return type to `{ hasPending: boolean; hasCompleted: boolean; inProgress: boolean; hasRested: boolean }`, add `hasRested: false` to the error return, and to the happy return:

```ts
    hasRested: rows.some((r) => r.status === "rested"),
```

`adoptCapturedWorkout`: immediately after the stand-down loop over `pending ?? []`, add:

```ts
    // Training voids a declared rest — the workout you are starting is the
    // truth about the day now. Tomorrow's draft stays; the morning signature
    // check recomposes it because today's usage changes coverage.
    const { error: unrestError } = await supabase
      .from("generated_sessions")
      .delete()
      .eq("user_id", input.userId)
      .eq("session_date", input.date)
      .eq("status", "rested");
    if (unrestError) throw unrestError;
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` → clean. Run: `npm test` → green. Grep for other `fetchDayStatus` callers (`grep -rn "fetchDayStatus" mobile/src mobile/app`) and confirm none destructure exhaustively in a way the new field breaks.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/lib/supabase/daily.ts
git commit -m "feat(daily): rest-day writes, draft marker, rested visibility"
```

---

### Task 8: `composeTomorrowDraft` + the recommender hears about rest

**Files:**
- Modify: `mobile/src/lib/composeDay.ts`
- Modify: `supabase/functions/compose-session/index.ts`

- [ ] **Step 1: Feed `yesterdayWasRest` into the compose**

In `composeDay.ts`, add `fetchRestedYesterday` to the imports from `./supabase/daily`. In the big `Promise.all` that fetches `captured, usage, ...`, append a ninth fetch:

```ts
          fetchRestedYesterday(userId, date),
```

destructured as `restedYesterday`. Add to `aiBody` after `overrodeRecovery`:

```ts
        // Deliberate rest is a green light, not neglect: yesterday's empty
        // usage already cleared the avoid-list, this tells the model why.
        yesterdayWasRest: restedYesterday,
```

Deliberately NOT in the compose signature: like soreness phrasing, it changes how the day is described, and its true inputs (yesterday's rows) are stable within a day.

- [ ] **Step 2: The edge function speaks it**

In `supabase/functions/compose-session/index.ts`, find the prompt-lines array around line 252 (`Most neglected muscles this week: ...` / `Hit yesterday: ...`). After the `Hit yesterday` line add:

```ts
    ...(body.yesterdayWasRest
      ? ["Yesterday was a deliberate rest day. Recovery is banked — full intensity is on the table today."]
      : []),
```

Match the array's actual construction style (if it is plain string members joined later, add a conditional member the same way the file already handles optional lines — read the surrounding 30 lines first).

- [ ] **Step 3: `composeTomorrowDraft`**

Append to `composeDay.ts`:

```ts
/**
 * Compose tomorrow's session tonight, from guesses (spec: preview draft).
 * The draft is an ordinary suggested session for tomorrow's date whose
 * inputs_snapshot carries `assumed`; the morning check-in either reproduces
 * its signature (draft kept) or recomposes it. Idempotent: an existing
 * matching draft short-circuits on the signature gate inside composeDay.
 */
export async function composeTomorrowDraft(userId: string): Promise<boolean> {
  try {
    const today = getLocalDateString(); // one clock sample
    const tomorrow = getLocalDateString(addDays(parseLocalDate(today), 1));
    const [gyms, lastCheckin, recentMinutes, existing] = await Promise.all([
      fetchGyms(userId),
      fetchLatestCheckin(userId, today),
      fetchRecentCheckinMinutes(userId),
      fetchTodaySession(userId, tomorrow),
    ]);
    // A draft the user already touched is theirs — never recompose it here.
    if (existing && (existing.status !== "suggested" || existing.source === "user_pick")) {
      return true;
    }
    const assumed = assumedInputs(lastCheckin, recentMinutes);
    const checkin: DailyCheckin = {
      id: "", // never written: checkinId below is null
      checkinDate: tomorrow,
      energy: assumed.energy,
      minutesAvailable: assumed.minutesAvailable,
      soreness: assumed.soreness,
      overrideRecovery: false,
      forceRecovery: false,
    };
    const { sessionId } = await composeDay({
      userId,
      date: tomorrow,
      checkin,
      checkinId: null,
      activeGymId: gyms.find((g) => g.isActive)?.id ?? null,
      existing,
      appendToDay: false,
      adjustFocus: null,
      snapshotExtras: { assumed },
    });
    return sessionId !== null;
  } catch (e) {
    // A failed draft is a missing preview, not a failed rest day.
    console.error("composeTomorrowDraft failed:", e);
    return false;
  }
}
```

Add the needed imports (`fetchGyms`, `fetchLatestCheckin`, `fetchRecentCheckinMinutes`, `fetchTodaySession` from `./supabase/daily`; `assumedInputs` from `./dailyRest`; `addDays`, `getLocalDateString`, `parseLocalDate` from `./dates` — some already present).

- [ ] **Step 4: Deploy the edge function and verify**

Run: `npx supabase functions deploy compose-session`
Expected: deploys clean.
Run: `npx tsc --noEmit` and `npm test` from `mobile/` → clean/green.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/composeDay.ts supabase/functions/compose-session/index.ts
git commit -m "feat(daily): tomorrow-draft compose, and the model hears about deliberate rest"
```

---

### Task 9: RestSheet + TomorrowPreview components

**Files:**
- Create: `mobile/src/components/training/daily/RestSheet.tsx`
- Create: `mobile/src/components/training/daily/TomorrowPreview.tsx`

- [ ] **Step 1: `RestSheet.tsx`**

```tsx
// The rest-day sheet: full rest, or a short active-recovery session.
// Choosing either decides the day and unlocks tomorrow's preview draft.
// Spec: docs/superpowers/specs/2026-08-24-rest-day-design.md.
import React, { useState } from "react";
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from "react-native";
import { BedDouble, StretchHorizontal, X } from "lucide-react-native";
import { colors, radii, spacing } from "@/src/theme/tokens";

interface RestSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The tab performs the writes; the sheet only reports the choice. */
  onChoose: (kind: "full" | "active") => Promise<void>;
}

export function RestSheet({ visible, onClose, onChoose }: RestSheetProps) {
  const [busy, setBusy] = useState<"full" | "active" | null>(null);

  const choose = async (kind: "full" | "active") => {
    if (busy) return;
    setBusy(kind);
    await onChoose(kind);
    setBusy(null);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Make today a rest day</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={24} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>
          Either way the day is decided, and tomorrow's plan gets built tonight.
        </Text>

        <TouchableOpacity
          style={styles.option}
          onPress={() => choose("full")}
          disabled={busy !== null}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Full rest — no training today"
          accessibilityState={{ disabled: busy !== null, busy: busy === "full" }}
        >
          {busy === "full"
            ? <ActivityIndicator size="small" color={colors.brand} />
            : <BedDouble size={20} color={colors.brand} />}
          <View style={styles.optionBody}>
            <Text style={styles.optionTitle}>Full rest</Text>
            <Text style={styles.optionText}>No training. The day is recorded as deliberate rest.</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.option}
          onPress={() => choose("active")}
          disabled={busy !== null}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Active recovery — a short mobility session"
          accessibilityState={{ disabled: busy !== null, busy: busy === "active" }}
        >
          {busy === "active"
            ? <ActivityIndicator size="small" color={colors.brand} />
            : <StretchHorizontal size={20} color={colors.brand} />}
          <View style={styles.optionBody}>
            <Text style={styles.optionTitle}>Active recovery</Text>
            <Text style={styles.optionText}>
              ~15 minutes of mobility and stretching, built like any other day.
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: spacing.lg },
  option: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.panel, padding: spacing.lg, marginBottom: spacing.md,
  },
  optionBody: { flex: 1 },
  optionTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  optionText: { fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
});
```

(If `StretchHorizontal` is not in this lucide version, use `Waves`; check with a typecheck.)

- [ ] **Step 2: `TomorrowPreview.tsx`**

```tsx
// Tomorrow's plan, shown tonight. Read-only on purpose: the preview is for
// going to bed knowing the plan; adjustments happen in the morning through
// the normal check-in. Spec: 2026-08-24-rest-day-design.md.
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Moon } from "lucide-react-native";
import { colors, radii, spacing, tint } from "@/src/theme/tokens";
import { blockDayShape } from "@/src/lib/dailyBlockCompose";
import type { StoredSession } from "@/src/types/daily";

export function TomorrowPreview({ session }: { session: StoredSession }) {
  const mainBlock = session.blocks.find((b) => b.block === "main") ?? null;
  const shape = blockDayShape(session.blocks);
  const title = mainBlock
    ? mainBlock.name
    : shape === "recovery" ? "Recovery day" : "Support work";
  return (
    <View style={styles.card} accessibilityLabel={`Tomorrow's preview: ${title}`}>
      <View style={styles.tagRow}>
        <Moon size={13} color={colors.brand} />
        <Text style={styles.tag}>Tomorrow · preview</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {session.dayReason && <Text style={styles.reason}>{session.dayReason}</Text>}
      {session.blocks.filter((b) => !b.dismissed).map((b) => (
        <View key={b.id} style={styles.blockRow}>
          <Text style={styles.blockName} numberOfLines={1}>{b.name}</Text>
          <Text style={styles.blockMinutes}>~{b.minutes} min</Text>
        </View>
      ))}
      <Text style={styles.caption}>
        Built from your usual settings — a quick morning check-in confirms or rebuilds it.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderWidth: 1,
    borderColor: tint(colors.brand, 0.35), borderRadius: radii.panel,
    padding: spacing.lg, marginTop: spacing.xl, gap: 6,
  },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  tag: {
    fontSize: 11, color: colors.brand, textTransform: "uppercase",
    letterSpacing: 1, fontWeight: "700",
  },
  title: { fontSize: 19, fontWeight: "800", color: colors.text },
  reason: { fontSize: 13, color: colors.brand, fontStyle: "italic", lineHeight: 19 },
  blockRow: {
    flexDirection: "row", justifyContent: "space-between", gap: 10,
    paddingVertical: 4,
  },
  blockName: { fontSize: 14, color: colors.text, flex: 1 },
  blockMinutes: { fontSize: 13, color: colors.textMuted },
  caption: { fontSize: 11.5, color: colors.textFaint, marginTop: 6 },
});
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` → clean (components not yet mounted; that's Task 10).

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/training/daily/RestSheet.tsx mobile/src/components/training/daily/TomorrowPreview.tsx
git commit -m "feat(today): rest sheet and tomorrow-preview components"
```

---

### Task 10: TodayTab wiring — entry point, rest card, draft confirm

**Files:**
- Modify: `mobile/src/components/training/daily/TodayTab.tsx`

- [ ] **Step 1: State, imports, and data**

Add imports:

```ts
import { RestSheet } from "./RestSheet";
import { TomorrowPreview } from "./TomorrowPreview";
import { composeTomorrowDraft } from "@/src/lib/composeDay";
import { restToday, unrestToday, saveCheckin, fetchTodaySession } from "@/src/lib/supabase/daily";
import { assumedInputs as assembleAssumed, ACTIVE_RECOVERY_MINUTES } from "@/src/lib/dailyRest";
import { fetchLatestCheckin } from "@/src/lib/supabase/daily";
import { addDays, getLocalDateString, parseLocalDate } from "@/src/lib/dates";
import { supabase } from "@/src/lib/supabase";
```

(Fold into the existing import statements from those modules where one already exists.)

Add state beside the other sheet flags:

```ts
  const [restSheetVisible, setRestSheetVisible] = useState(false);
  const [restBusy, setRestBusy] = useState(false);
  // Tomorrow's draft, when one exists — rendered under the rest card and
  // under a decided day. Null is "none", which is the common case.
  const [tomorrowDraft, setTomorrowDraft] = useState<StoredSession | null>(null);
```

Add `StoredSession` to the type imports from `@/src/types/daily`.

Fetch the draft whenever the day reloads — add an effect after the `served` effect:

```ts
  // The preview rides the same refresh cadence as the day itself. Only an
  // untouched assumed draft renders — once tomorrow arrives and the draft is
  // confirmed or replaced, this fetch naturally answers null.
  const sessionStatus = session?.status ?? null;
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const tomorrow = getLocalDateString(addDays(parseLocalDate(getLocalDateString()), 1));
      fetchTodaySession(user.id, tomorrow).then((s) => {
        if (!alive) return;
        setTomorrowDraft(
          s && s.status === "suggested" && s.assumedInputs !== null ? s : null,
        );
      });
    });
    return () => { alive = false; };
  }, [refreshKey, sessionStatus]);
```

- [ ] **Step 2: The rest choice handler**

Add beside `markDone`:

```ts
  // Both choices decide the day, then build tomorrow's preview. The preview
  // failing is not the decision failing — the day state is what refreshes.
  const chooseRest = async (kind: "full" | "active") => {
    if (restBusy) return;
    setRestBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setRestBusy(false); return; }
    const today = getLocalDateString();
    if (kind === "full") {
      await restToday(user.id, today);
    } else {
      // A real check-in, forced into recovery shape; the hook composes the
      // ~15-minute mobility day from it like any other day.
      const last = await fetchLatestCheckin(user.id, today);
      const assumed = assembleAssumed(last, []);
      await saveCheckin({
        userId: user.id,
        date: today,
        energy: assumed.energy,
        minutesAvailable: ACTIVE_RECOVERY_MINUTES,
        soreness: assumed.soreness,
        forceRecovery: true,
      });
    }
    await composeTomorrowDraft(user.id);
    setRestBusy(false);
    setRestSheetVisible(false);
    bump();
  };

  const undoRest = async () => {
    if (restBusy) return;
    setRestBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await unrestToday(user.id, getLocalDateString());
    setRestBusy(false);
    bump();
  };
```

- [ ] **Step 3: Empty-state entry point**

In the `!checkin` empty state (after the "Set up my day" button), add:

```tsx
              <TouchableOpacity
                style={styles.restLink}
                onPress={() => setRestSheetVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Make today a rest day"
              >
                <Text style={styles.restLinkText}>Make today a rest day</Text>
              </TouchableOpacity>
```

Styles:

```ts
  restLink: { marginTop: 14, padding: 6 },
  restLinkText: { fontSize: 14, color: colors.textMuted, textDecorationLine: "underline" },
```

- [ ] **Step 4: Rest-day card**

The session branch currently starts at `) : (` with the fragment for a real session. Insert a new branch BEFORE it, so a rested day never falls into the session renderer:

```tsx
        ) : session.status === "rested" ? (
          <>
            <View style={styles.center}>
              <Moon size={32} color={colors.brand} />
              <Text style={styles.emptyTitle}>Rest day — on purpose</Text>
              <Text style={styles.emptyText}>
                Recorded. Tomorrow's plan knows you rested, not skipped.
              </Text>
              <TouchableOpacity
                style={styles.restLink}
                onPress={undoRest}
                disabled={restBusy}
                accessibilityRole="button"
                accessibilityLabel="Undo the rest day"
              >
                <Text style={styles.restLinkText}>
                  {restBusy ? "Undoing…" : "Changed my mind — undo"}
                </Text>
              </TouchableOpacity>
            </View>
            {tomorrowDraft && <TomorrowPreview session={tomorrowDraft} />}
          </>
        ) : (
```

Add `Moon` to the lucide imports. Note the guard condition above this branch: the outer chain is `loading && !session ? ... : !session ? ... : ...` — the new branch slots into the final `:` position's front, i.e. `: session.status === "rested" ? (rest card) : (existing fragment)`.

- [ ] **Step 5: Draft-confirm banner (morning) + preview under a decided day**

Inside the existing session fragment (the `<>` that renders a real session), immediately after the `{error && ...}` banner, add:

```tsx
            {/* Morning face of the tomorrow-draft: the plan exists, the
                check-in doesn't. Confirming writes the guesses as the real
                check-in — the signature then matches and the draft is kept
                byte-for-byte; changing anything recomposes on save. */}
            {!checkin && session.status === "suggested" && session.assumedInputs && (
              <View style={styles.draftBanner}>
                <Text style={styles.draftBannerTitle}>Built last night from your usual settings</Text>
                <Text style={styles.draftBannerText}>
                  Confirm it or tell me what's different this morning.
                </Text>
                <View style={styles.draftActions}>
                  <TouchableOpacity
                    style={styles.draftConfirm}
                    onPress={confirmDraft}
                    disabled={restBusy}
                    accessibilityRole="button"
                    accessibilityLabel="Keep this plan as is"
                  >
                    <Text style={styles.buttonText}>Looks right</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.draftAdjust}
                    onPress={() => setSetupVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Something changed — open the check-in"
                  >
                    <Text style={styles.secondaryButtonText}>Anything change?</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
```

Handler beside `chooseRest`:

```ts
  // "Looks right": the guesses become the day's real check-in. The reload's
  // signature comes out identical (Task 4 removed the checkin id from it),
  // so the plan on screen survives untouched.
  const confirmDraft = async () => {
    if (!session?.assumedInputs || restBusy) return;
    setRestBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await saveCheckin({
        userId: user.id,
        date: getLocalDateString(),
        energy: session.assumedInputs.energy,
        minutesAvailable: session.assumedInputs.minutesAvailable,
        soreness: session.assumedInputs.soreness,
      });
    }
    setRestBusy(false);
    bump();
  };
```

Prefill the setup sheet from the draft when there is no check-in yet — change the `SetupSheet` mount's `existing` prop:

```tsx
      <SetupSheet visible={setupVisible} existing={checkin ?? draftPrefill} gyms={gyms}
```

with, near the other `useMemo`s:

```ts
  // The morning sheet opens showing the draft's guesses, so "save without
  // touching anything" reproduces the signature and keeps the plan.
  const draftPrefill = useMemo<DailyCheckin | null>(() => {
    if (checkin || !session?.assumedInputs) return null;
    return {
      id: "",
      checkinDate: getLocalDateString(),
      energy: session.assumedInputs.energy,
      minutesAvailable: session.assumedInputs.minutesAvailable,
      soreness: session.assumedInputs.soreness,
      overrideRecovery: false,
      forceRecovery: false,
    };
  }, [checkin, session]);
```

Add `DailyCheckin` to the type imports. Then, at the very end of the session fragment (after the completed-day block), render the preview for a decided day:

```tsx
            {/* A decided day (recovery session in hand, or finished) with a
                draft waiting shows tomorrow at the end of the scroll. */}
            {tomorrowDraft && (session.status === "completed" || dayShape === "recovery") && (
              <TomorrowPreview session={tomorrowDraft} />
            )}
```

Banner styles:

```ts
  draftBanner: {
    backgroundColor: colors.surface, borderWidth: 1,
    borderColor: tint(colors.brand, 0.4), borderRadius: radii.panel,
    padding: spacing.lg, marginBottom: 12, gap: 4,
  },
  draftBannerTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  draftBannerText: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  draftActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  draftConfirm: {
    flex: 1, backgroundColor: colors.brand, borderRadius: radii.control,
    paddingVertical: 11, alignItems: "center",
  },
  draftAdjust: {
    flex: 1, backgroundColor: colors.surface2, borderWidth: 1,
    borderColor: colors.border, borderRadius: radii.control,
    paddingVertical: 11, alignItems: "center",
  },
```

- [ ] **Step 6: Mount the RestSheet**

Beside the other sheets at the bottom:

```tsx
      <RestSheet
        visible={restSheetVisible}
        onClose={() => setRestSheetVisible(false)}
        onChoose={chooseRest}
      />
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit` → clean. Run: `npm test` → green.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/components/training/daily/TodayTab.tsx
git commit -m "feat(today): rest-day flow, tomorrow preview, morning draft confirm"
```

---

### Task 11: Home card knows a rest day

**Files:**
- Modify: `mobile/src/components/DailySessionHomeCard.tsx:47-68`

- [ ] **Step 1: Add the rested arm**

In the `title` chain, add a branch right after the `completed` arm:

```ts
      : session.status === "rested"
        ? "Rest day — on purpose 😌"
```

And make the subtitle honest for it — replace the `subtitle` expression with:

```ts
  const subtitle = !session
    ? "Soreness, energy, time — ten seconds"
    : session.status === "rested"
      ? "Recorded. Tomorrow's plan knows."
      : `${session.blocks.length > 0
          ? plural(session.blocks.length, "block")
          : plural(session.items.length, "movement")} · ${composedBy}`;
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add mobile/src/components/DailySessionHomeCard.tsx
git commit -m "feat(home): the daily card names a rest day"
```

---

### Task 12: Calendar rest marks

**Files:**
- Modify: `mobile/src/components/track/gym-sessions/GymSessionsScreen.tsx`
- Modify: `mobile/src/components/track/gym-sessions/HistoryCalendar.tsx`

- [ ] **Step 1: Fetch rest dates in the screen**

In `GymSessionsScreen.tsx`, alongside the `fetchGymSessions` load (line ~47), fetch and hold rest dates:

```ts
  const [restDates, setRestDates] = useState<Set<string>>(new Set());
```

and inside the same load function, after `setSessions(...)`:

```ts
    setRestDates(await fetchRestDates(user.id));
```

Import: `import { fetchRestDates } from "@/src/lib/supabase/daily";`. Pass it to the calendar: add `restDates={restDates}` to the `<HistoryCalendar ...>` props (line ~188).

- [ ] **Step 2: Render the mark**

In `HistoryCalendar.tsx`, extend the props:

```ts
  restDates,
}: {
  sessions: HistorySession[];
  today: string;
  selected: string | null;
  onSelect: (date: string) => void;
  /** Deliberate rest days — marked, still untappable (nothing to open). */
  restDates?: Set<string>;
}) {
```

In the day-cell render, derive `const isRest = count === 0 && (restDates?.has(date) ?? false);` and:

1. Accessibility label's empty arm becomes:
```ts
                  count === 0
                    ? `${day}, ${isRest ? "rest day" : "no training"}`
```
2. Day-number style: `count === 0 && !isRest && styles.dayTextEmpty,` (a rest day reads at full muted weight, not faded like an ignored one).
3. In the dots row, beside the existing group-dots expression, add:
```tsx
                  {isRest && <View style={styles.dotRest} />}
```
4. Style:
```ts
  dotRest: {
    width: 5, height: 5, borderRadius: 3,
    borderWidth: 1, borderColor: colors.mutedForeground, backgroundColor: "transparent",
  },
```

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add mobile/src/components/track/gym-sessions
git commit -m "feat(track): the calendar marks deliberate rest days"
```

---

### Task 13: Full verification

- [ ] **Step 1: Suite + typecheck**

From `mobile/`: `npm test` → all green. `npx tsc --noEmit` → clean (remember: the untyped client means green proves compile-level only).

- [ ] **Step 2: Migration state**

From repo root: `npx supabase migration list` → `20260824100000` applied; `npx supabase functions deploy compose-session` already deployed in Task 8.

- [ ] **Step 3: Simulator smoke (dedicated sim + unique Metro port, per house rule)**

Walk, in order, with screenshots at each state:
1. Fresh day, no check-in → empty state shows "Make today a rest day" under the primary button.
2. Full rest → rest card + undo + Tomorrow preview renders with real blocks.
3. Undo → back to the empty state; tomorrow's draft gone (re-enter rest to continue).
4. Full rest again → Home tab card says rest day; Track calendar shows the hollow dot on today.
5. Active recovery (undo first) → a ~15-minute mobility/cooldown day composes, "Train anyway" escape visible, preview below.
6. Morning flow — advance the simulator clock a day (Device > date, or temporarily hardcode `getLocalDateString`'s return in a scratch build): draft banner appears; "Looks right" keeps the identical plan (compare block names before/after); re-run with a changed check-in (different minutes) and confirm it recomposes.
7. Start a catalog workout on a rested day → rest record cleared (calendar dot gone).

- [ ] **Step 4: Report**

Report device-verification results honestly, including anything not exercised (step 6's clock advance is the flakiest — say so if skipped). Per repo memory, the user does final on-device verification.

---

## Self-review notes (done at plan time)

- Spec coverage: entry point (T10), full rest record (T1/T7), active recovery (T3/T10), tomorrow draft (T6/T8), morning confirm (T4/T10), undo (T7/T10), adopt-voids-rest (T7), recommender flag (T8), calendar (T12), Home card (T11), `hasRested` (T7). Spec's "assumed gym" is implemented as the active gym — the app's existing notion of "your gym"; noted as a deliberate reading, not a gap.
- The one risky task is T6 (extraction). Its verification is the substitution-table re-read plus the full suite; the simulator smoke in T13 is what actually proves it.
