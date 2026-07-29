# Nutrition Preference & Constraint Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Nutrition OS Phase 1 — food-concept preferences with EoE qualifiers, global eating constraints, vendor vocabulary, and a lean-bulk calorie ramp with suggest-confirm advancement, plus one Profile-menu screen.

**Architecture:** Five new user-scoped Postgres tables (schema + seed + backfill migrations); a pure trend-math lib (`rampProgress.ts`, Jest-tested); a supabase query module; a full-screen Profile modal following the house `activeModal` pattern. `profiles.target_*` stays canonical — the ramp writes onto it only on confirmed level change.

**Tech Stack:** Expo SDK 54 / React Native 0.81 / TypeScript strict, supabase-js, Jest + ts-jest (new, pure libs only), lucide-react-native icons, `colors.ts` palette.

**Spec:** `docs/superpowers/specs/2026-07-28-nutrition-preference-model-design.md`
**Branch:** `nutrition-os/preference-model` (exists)

---

## ⚠️ Execution amendments (what actually shipped)

Every task below was implemented, then put through a spec-compliance review and a code-quality review. Several reviews found real defects, and the fixes deviate from the task text. **Where this section and a task body disagree, this section is authoritative.**

**Task 2 — `rampProgress.ts`** (also noted inline): options-object API; gains normalized by `spanWeeks` via an ISO-week *Thursday anchor* (a dropped/thin week previously made a 2-week delta read as a 1-week rate and suppressed legitimate "advance" suggestions); honest copy on weight loss. 11 tests, not 7.

**Task 4 — schema migration:**
- RLS uses **20 per-operation policies** (4 per table), not 5 blanket `for all` policies — zero `FOR ALL` precedent exists in this repo. All scoped `to authenticated`.
- Every `create policy` / `create trigger` is preceded by a `drop ... if exists` guard, so a mid-failure re-run completes cleanly. This matters: prod has no staging and cannot be rebuilt from the repo.
- Added 4 `updated_at` triggers reusing the shared `update_updated_at_column()` helper (the client no longer sends `updated_at`).
- Added 4 indexes for the real query patterns: `food_concepts (user_id, name)`, `nutrition_vendors (user_id, display_order)`, and partial indexes on each `food_concept_links` FK for reverse lookups.
- All identifiers `public.`-qualified.

**Task 5 — seed migration:** wrapped in a `do $$ ... $$` block that resolves the owner once and **raises** if `auth.users` is empty (a silent zero-row seed would have surfaced much later as an empty screen), plus closing row-count notices. Seed data itself unchanged.

**Task 6 — link backfill: the plan's SQL is superseded entirely.** Bidirectional substring containment mis-linked real products (`Butter Lettuce` → `Butter`; `Pasta Sauce` → `Pasta`). Replaced with three precise clauses: exact match; exact modulo a trailing plural (so `Banana` still matches `Bananas`); and **product name ends with the concept as its trailing head noun** (`Kerrygold Butter` ✓, `Butter Lettuce` ✗). No `LIKE` anywhere, which also removes the unescaped `%`/`_` hazard (`2% Milk`). Adds per-pair `raise notice` logging and a documented undo line. Known accepted residuals are documented in the file header.

**New migration (not in the original plan) — `20260728100300_set_active_ramp_level_rpc.sql`:** `changeRampLevel` originally did two client writes plus a `profiles` write. A failure after the level swap left the active level and the owner's real daily targets **silently disagreeing**. Replaced with an atomic `set_active_ramp_level(uuid, date)` plpgsql function (`security invoker`, `search_path = ''`, revoke-then-grant), which also asserts the `profiles` row exists via `get diagnostics`.

**Task 8 — query module:** `changeRampLevel(targetLevelId, todayLocalDate)` now delegates to that RPC; no client `updated_at`; `slugify` empty-result guard in create *and* update; slug recomputed on rename; extra parallel-fetch errors logged before throwing the first; `WeighIn` imported rather than re-declared.

**Task 9 — sections:** added an explicit top-of-ramp banner — at Level 4 with a plateau the advance banner previously vanished silently. Inline styles moved into `styles.ts`.

**Task 10 — `ConceptRow`:** added an unmount/collapse flush for the form note (the modal *unmounts* its children, so `onEndEditing` may never fire and typed text was silently lost) plus dirty-checks so no-op taps don't trigger a full refetch. Deliberately **no** `formNote` resync effect — writes are partial patches and rows are keyed by stable id, so a resync would only introduce a transient revert mid-typing.

**Task 11 — container:** adapts to the RPC signature and the options-object `assessRampProgress`; `useCallback`-stabilized callbacks and `renderItem` so `ConceptRow`'s `React.memo` is actually effective; glyph legend in the Food Ratings header; header renders unconditionally with a **Retry** affordance (a load failure previously left an inescapable spinner on a full-screen modal with no iOS swipe-to-dismiss); silent resync after write failures to avoid stacked alerts; parallelized weigh-ins fetch; typed text preserved when an add fails. Optimistic local patching was explicitly rejected — server-as-truth is the invariant.

**Deviations from spec (agreed rationale):**
- Concept deletion is a destructive button inside the expanded row editor rather than swipe-to-delete (avoids nesting gesture handlers inside the screen's FlatList; same capability).
- The concept list IS the screen's FlatList (ramp/constraints/vendors render via `ListHeaderComponent`) — nesting a FlatList inside a ScrollView is an RN anti-pattern.

---

### Task 1: Wire Jest for pure math libs

**Files:**
- Modify: `mobile/package.json`
- Create: `mobile/jest.config.js`

- [ ] **Step 1: Install dev dependencies**

Run (in `mobile/`): `npm install --save-dev jest@^29 ts-jest@^29 @types/jest@^29`
Expected: packages added to `devDependencies`, no peer errors.

- [ ] **Step 2: Create `mobile/jest.config.js`**

```js
/** Jest is scoped to pure TypeScript libs only (no React Native imports). */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
};
```

- [ ] **Step 3: Add the npm script**

In `mobile/package.json` `"scripts"`, add:

```json
"test": "jest"
```

- [ ] **Step 4: Verify Jest runs (no tests yet)**

Run: `npm test -- --passWithNoTests`
Expected: `No tests found, exiting with code 0`.

- [ ] **Step 5: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/jest.config.js
git commit -m "chore(mobile): wire Jest for pure math libs (R2 groundwork)"
```

---

### Task 2: `rampProgress.ts` — trend math (TDD)

> **AMENDED during execution (commit `96b0ab6`), after code review.** The code below is the original draft; the shipped implementation differs in three accepted ways:
> 1. **Options-object API** — `assessRampProgress(opts: AssessRampProgressOpts)` with `{weighIns, levelStartedAt, today}`, matching the house convention (`ComputeMealPaceOpts`). Positional string params were trivially swappable.
> 2. **Gains normalized by weeks spanned** — `isoWeekKey` became `isoWeekAnchor()` returning the ISO week's Thursday as `YYYY-MM-DD`; gains divide by `spanWeeks = daysBetween(prevAnchor, currAnchor) / 7`. Without this, a dropped/thin week made a 2-week delta read as a 1-week rate and suppressed legitimate "advance" suggestions — a real bug for sparse weigh-in logging.
> 3. **Honest copy on weight loss** — a negative latest gain no longer claims "Gained under…".
>
> Test count is 11, not 7. **Downstream tasks must call the options-object form.**

**Files:**
- Create: `mobile/src/lib/__tests__/rampProgress.test.ts`
- Create: `mobile/src/lib/rampProgress.ts`

- [ ] **Step 1: Write the failing tests**

Create `mobile/src/lib/__tests__/rampProgress.test.ts`:

```ts
import { assessRampProgress, WeighIn } from "../rampProgress";

// Helper: n weigh-ins spread across a week starting at `monday` (YYYY-MM-DD),
// each at `weight` lbs.
function week(monday: string, weight: number, count = 4): WeighIn[] {
  const [y, m, d] = monday.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    return {
      date: dt.toISOString().slice(0, 10),
      weight_lbs: weight,
    };
  });
}

describe("assessRampProgress", () => {
  const today = "2026-07-27"; // a Monday

  it("returns insufficient_data with no weigh-ins", () => {
    const r = assessRampProgress([], null, today);
    expect(r.recommendation).toBe("insufficient_data");
    expect(r.weeklyGainLbs).toBeNull();
  });

  it("returns insufficient_data when weeks have fewer than 3 weigh-ins", () => {
    const logs = [...week("2026-07-06", 163, 2), ...week("2026-07-13", 163.6, 2)];
    const r = assessRampProgress(logs, null, today);
    expect(r.recommendation).toBe("insufficient_data");
  });

  it("recommends hold when gaining within the 0.5-0.75 lb/wk target band", () => {
    const logs = [
      ...week("2026-07-06", 163),
      ...week("2026-07-13", 163.6),
      ...week("2026-07-20", 164.2),
    ];
    const r = assessRampProgress(logs, null, today);
    expect(r.recommendation).toBe("hold");
    expect(r.weeklyGainLbs).toBeCloseTo(0.6, 5);
  });

  it("recommends advance after 2 consecutive plateau weeks (<0.25 lb/wk)", () => {
    const logs = [
      ...week("2026-07-06", 164),
      ...week("2026-07-13", 164.1),
      ...week("2026-07-20", 164.15),
    ];
    const r = assessRampProgress(logs, null, today);
    expect(r.recommendation).toBe("advance");
  });

  it("holds during the first week at a level even if plateaued", () => {
    const logs = [
      ...week("2026-07-06", 164),
      ...week("2026-07-13", 164.1),
      ...week("2026-07-20", 164.15),
    ];
    const r = assessRampProgress(logs, "2026-07-24", today); // 3 days ago
    expect(r.recommendation).toBe("hold");
    expect(r.reason).toMatch(/week at/i);
  });

  it("waives the level-time gate when started_at is null (seeded state)", () => {
    const logs = [
      ...week("2026-07-06", 164),
      ...week("2026-07-13", 164.1),
      ...week("2026-07-20", 164.15),
    ];
    const r = assessRampProgress(logs, null, today);
    expect(r.recommendation).toBe("advance");
  });

  it("only one plateau week is not enough to advance", () => {
    const logs = [
      ...week("2026-07-06", 163),
      ...week("2026-07-13", 163.6), // +0.6 (in band)
      ...week("2026-07-20", 163.7), // +0.1 (plateau, but just one)
    ];
    const r = assessRampProgress(logs, null, today);
    expect(r.recommendation).toBe("hold");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- rampProgress`
Expected: FAIL — `Cannot find module '../rampProgress'`.

- [ ] **Step 3: Implement `mobile/src/lib/rampProgress.ts`**

```ts
// Lean-bulk ramp progression: weekly weight-trend assessment producing a
// suggest-confirm recommendation. Pure math, no I/O — Jest-tested.
// Policy constants are deliberately code, not schema (see Phase 1 spec §6).

export interface WeighIn {
  date: string; // local YYYY-MM-DD (house convention)
  weight_lbs: number;
}

export type RampRecommendation = "advance" | "hold" | "insufficient_data";

export interface RampAssessment {
  recommendation: RampRecommendation;
  reason: string;
  weeklyGainLbs: number | null; // most recent week-over-week gain
}

export const TARGET_WEEKLY_GAIN_MIN_LBS = 0.5;
export const TARGET_WEEKLY_GAIN_MAX_LBS = 0.75;
export const PLATEAU_GAIN_THRESHOLD_LBS = 0.25;
export const PLATEAU_WEEKS_TO_ADVANCE = 2;
export const MIN_WEIGHINS_PER_WEEK = 3;
const MIN_DAYS_AT_LEVEL = 7;

/** ISO-week key ("2026-W30") for a local-date string, computed in UTC to
 * avoid device-timezone drift on date-only values. */
function isoWeekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // ISO week: Thursday of the current week determines the year/week.
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function daysBetween(fromStr: string, toStr: string): number {
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000
  );
}

export function assessRampProgress(
  weighIns: WeighIn[],
  levelStartedAt: string | null,
  today: string
): RampAssessment {
  // Weekly averages for weeks with enough samples, in chronological order.
  const byWeek = new Map<string, number[]>();
  for (const w of weighIns) {
    const key = isoWeekKey(w.date);
    const arr = byWeek.get(key) ?? [];
    arr.push(w.weight_lbs);
    byWeek.set(key, arr);
  }
  const weeks = [...byWeek.entries()]
    .filter(([, values]) => values.length >= MIN_WEIGHINS_PER_WEEK)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, values]) => values.reduce((s, v) => s + v, 0) / values.length);

  // Need PLATEAU_WEEKS_TO_ADVANCE gains => that many + 1 qualifying weeks.
  if (weeks.length < PLATEAU_WEEKS_TO_ADVANCE + 1) {
    return {
      recommendation: "insufficient_data",
      reason: `Need ${PLATEAU_WEEKS_TO_ADVANCE + 1} weeks with at least ${MIN_WEIGHINS_PER_WEEK} weigh-ins each.`,
      weeklyGainLbs: null,
    };
  }

  const gains: number[] = [];
  for (let i = 1; i < weeks.length; i++) gains.push(weeks[i] - weeks[i - 1]);
  const latestGain = gains[gains.length - 1];

  // Level-time gate; a null started_at (seeded state) waives it.
  if (
    levelStartedAt !== null &&
    daysBetween(levelStartedAt, today) < MIN_DAYS_AT_LEVEL
  ) {
    return {
      recommendation: "hold",
      reason: "Less than a week at the current level.",
      weeklyGainLbs: latestGain,
    };
  }

  const recentGains = gains.slice(-PLATEAU_WEEKS_TO_ADVANCE);
  const plateaued =
    recentGains.length >= PLATEAU_WEEKS_TO_ADVANCE &&
    recentGains.every((g) => g < PLATEAU_GAIN_THRESHOLD_LBS);

  if (plateaued) {
    return {
      recommendation: "advance",
      reason: `Gained under ${PLATEAU_GAIN_THRESHOLD_LBS} lb/wk for ${PLATEAU_WEEKS_TO_ADVANCE} weeks — time to raise calories.`,
      weeklyGainLbs: latestGain,
    };
  }

  const flavor =
    latestGain > TARGET_WEEKLY_GAIN_MAX_LBS
      ? "gaining faster than the target band"
      : latestGain >= TARGET_WEEKLY_GAIN_MIN_LBS
        ? "gaining within the target band"
        : "gaining slowly — watch for a plateau";
  return {
    recommendation: "hold",
    reason: `Currently ${flavor} (${latestGain.toFixed(2)} lb/wk).`,
    weeklyGainLbs: latestGain,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- rampProgress`
Expected: PASS, 7 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/lib/rampProgress.ts mobile/src/lib/__tests__/rampProgress.test.ts
git commit -m "feat(nutrition-os): ramp progression trend math with Jest coverage"
```

---

### Task 3: TypeScript domain types

**Files:**
- Create: `mobile/src/types/nutrition-preferences.ts`

- [ ] **Step 1: Create the types file**

```ts
// Nutrition OS Phase 1 domain types. Unions mirror the DB CHECK constraints
// (the practical contract, per house convention — see track.ts, crossfit.ts).

export type ConceptRating = "love" | "like" | "neutral" | "dislike" | "never";

export const CONCEPT_RATINGS: ConceptRating[] = [
  "never",
  "dislike",
  "neutral",
  "like",
  "love",
];

export interface FoodConcept {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  rating: ConceptRating;
  requires_small_pieces: boolean;
  prep_intensive: boolean;
  form_note: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ConceptMatchSource = "seed" | "auto_name_match" | "user";

export interface FoodConceptLink {
  id: string;
  user_id: string;
  concept_id: string;
  saved_food_id: string | null;
  food_inventory_id: string | null;
  matched_by: ConceptMatchSource;
  created_at: string;
}

export interface NutritionVendor {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  app_url: string | null;
  display_order: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type SpiceTolerance = "none" | "mild" | "medium" | "hot";

export interface NutritionConstraints {
  id: string;
  user_id: string;
  has_eoe: boolean;
  avoids_eating_with_hands: boolean;
  prefers_bowls: boolean;
  spice_tolerance: SpiceTolerance;
  max_prep_minutes: number;
  prefers_small_frequent_meals: boolean;
  max_leftover_hours: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalorieRampLevel {
  id: string;
  user_id: string;
  level: number;
  name: string;
  target_calories: number;
  target_protein_g: number;
  target_carbs_g: number | null;
  target_fats_g: number | null;
  is_active: boolean;
  started_at: string | null; // local YYYY-MM-DD
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/types/nutrition-preferences.ts
git commit -m "feat(nutrition-os): preference domain types"
```

---

### Task 4: Schema migration

**Files:**
- Create: `supabase/migrations/20260728100000_nutrition_preference_schema.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Nutrition OS Phase 1: preference & constraint model schema.
-- Spec: docs/superpowers/specs/2026-07-28-nutrition-preference-model-design.md

create table if not exists food_concepts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  rating text not null check (rating in ('love','like','neutral','dislike','never')),
  requires_small_pieces boolean not null default false,
  prep_intensive boolean not null default false,
  form_note text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create table if not exists food_concept_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_id uuid not null references food_concepts(id) on delete cascade,
  saved_food_id uuid references saved_foods(id) on delete cascade,
  food_inventory_id uuid references food_inventory(id) on delete cascade,
  matched_by text not null check (matched_by in ('seed','auto_name_match','user')),
  created_at timestamptz not null default now(),
  check (num_nonnulls(saved_food_id, food_inventory_id) = 1),
  unique (concept_id, saved_food_id),
  unique (concept_id, food_inventory_id)
);

create table if not exists nutrition_vendors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  app_url text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create table if not exists nutrition_constraints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  has_eoe boolean not null default false,
  avoids_eating_with_hands boolean not null default false,
  prefers_bowls boolean not null default false,
  spice_tolerance text not null default 'medium'
    check (spice_tolerance in ('none','mild','medium','hot')),
  max_prep_minutes integer not null default 5,
  prefers_small_frequent_meals boolean not null default true,
  max_leftover_hours integer not null default 24,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists calorie_ramp_levels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  level integer not null,
  name text not null,
  target_calories integer not null,
  target_protein_g integer not null,
  target_carbs_g integer,
  target_fats_g integer,
  is_active boolean not null default false,
  started_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, level)
);

create unique index if not exists calorie_ramp_levels_one_active
  on calorie_ramp_levels (user_id) where is_active;

create index if not exists food_concept_links_concept_idx
  on food_concept_links (concept_id);

-- RLS: owner-only, matching the house blanket policy pattern.
alter table food_concepts enable row level security;
alter table food_concept_links enable row level security;
alter table nutrition_vendors enable row level security;
alter table nutrition_constraints enable row level security;
alter table calorie_ramp_levels enable row level security;

create policy "own food_concepts" on food_concepts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own food_concept_links" on food_concept_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own nutrition_vendors" on nutrition_vendors
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own nutrition_constraints" on nutrition_constraints
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own calorie_ramp_levels" on calorie_ramp_levels
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260728100000_nutrition_preference_schema.sql
git commit -m "feat(nutrition-os): preference model schema migration"
```

---

### Task 5: Seed migration (discovery data)

**Files:**
- Create: `supabase/migrations/20260728100100_nutrition_preference_seed.sql`

- [ ] **Step 1: Write the seed migration**

Single-user seeding resolves the owner via `auth.users` (established trick). Idempotent via `on conflict do nothing`.

```sql
-- Seed Nutrition OS Phase 1 from the July 2026 discovery conversation.
-- Idempotent: unique keys + on conflict do nothing.

with owner as (select id from auth.users limit 1)

insert into food_concepts
  (user_id, name, slug, rating, requires_small_pieces, prep_intensive, form_note)
select o.id, v.name, v.slug, v.rating, v.small_pieces, v.prep_heavy, v.form_note
from owner o cross join (values
  -- Protein
  ('Chicken Breast','chicken-breast','like',true,false,'Must be cut/diced into small pieces (EoE)'),
  ('Rotisserie Chicken','rotisserie-chicken','like',true,false,'Sliced/diced; no bones; not eaten by hand'),
  ('Steak','steak','like',true,false,'Thin-sliced or diced; well-cooked (EoE)'),
  ('Ground Beef','ground-beef','love',false,false,null),
  ('Turkey','turkey','like',false,false,null),
  ('Salmon','salmon','love',false,true,'Time-consuming to prepare solo'),
  ('Tuna','tuna','like',false,false,null),
  ('Shrimp','shrimp','like',false,false,null),
  ('Eggs','eggs','like',false,true,'Time-consuming to prepare solo'),
  ('Egg Whites','egg-whites','dislike',false,false,null),
  ('Bacon','bacon','love',false,true,'Time-consuming to prepare solo'),
  ('Sausage','sausage','love',false,true,'Time-consuming to prepare solo'),
  ('Greek Yogurt','greek-yogurt','like',false,false,null),
  ('Cottage Cheese','cottage-cheese','dislike',false,false,null),
  ('Cheese','cheese','love',false,false,null),
  ('Protein Bars','protein-bars','like',false,false,null),
  ('Protein Shakes','protein-shakes','like',false,false,null),
  -- Carbs
  ('Rice','rice','love',false,false,null),
  ('Microwave Rice','microwave-rice','love',false,false,null),
  ('Potatoes','potatoes','like',false,false,null),
  ('Sweet Potatoes','sweet-potatoes','neutral',false,false,null),
  ('Pasta','pasta','love',false,false,null),
  ('Bread','bread','love',false,false,null),
  ('Hawaiian Buns','hawaiian-buns','love',false,false,null),
  ('Bagels','bagels','like',false,false,null),
  ('English Muffins','english-muffins','like',false,false,null),
  ('Tortillas','tortillas','like',false,false,null),
  ('Oatmeal','oatmeal','like',false,false,null),
  ('Pancakes','pancakes','love',false,false,null),
  ('Waffles','waffles','like',false,false,null),
  ('Protein Waffles','protein-waffles','like',false,false,null),
  ('Cereal','cereal','like',false,false,null),
  ('Granola','granola','love',false,false,null),
  -- Fats
  ('Peanut Butter','peanut-butter','love',false,false,null),
  ('Almond Butter','almond-butter','love',false,false,null),
  ('Cashews','cashews','love',false,false,null),
  ('Mixed Nuts','mixed-nuts','like',false,false,null),
  ('Avocados','avocados','love',false,false,null),
  ('Olive Oil','olive-oil','love',false,false,null),
  ('Butter','butter','love',false,false,null),
  -- Fruits
  ('Bananas','bananas','love',false,false,null),
  ('Blueberries','blueberries','love',false,false,null),
  ('Strawberries','strawberries','love',false,false,null),
  ('Grapes','grapes','love',false,false,null),
  ('Apples','apples','like',false,false,null),
  ('Pineapple','pineapple','like',false,false,null),
  -- Drinks
  ('Whole Milk','whole-milk','love',false,false,null),
  ('Chocolate Milk','chocolate-milk','like',false,false,null),
  ('Fairlife Milk','fairlife-milk','neutral',false,false,null),
  ('Boost High Protein','boost-high-protein','love',false,false,null),
  ('Coffee','coffee','dislike',false,false,null),
  ('Juice','juice','like',false,false,null),
  ('Sparkling Water','sparkling-water','neutral',false,false,null),
  -- Convenience
  ('Frozen Burritos','frozen-burritos','like',false,false,null),
  ('Frozen Grilled Chicken','frozen-grilled-chicken','like',false,false,null),
  ('Trail Mix','trail-mix','like',false,false,null),
  ('Frozen Meatballs','frozen-meatballs','like',false,false,null),
  ('String Cheese','string-cheese','dislike',false,false,null),
  ('Beef Jerky','beef-jerky','dislike',false,false,null),
  -- Never list
  ('Tofu','tofu','never',false,false,null),
  ('Radish','radish','never',false,false,null),
  ('Hot Dogs','hot-dogs','never',false,false,null),
  ('Mushrooms','mushrooms','never',false,false,null),
  ('Mayonnaise','mayonnaise','never',false,false,null),
  ('Pickles','pickles','never',false,false,null)
) as v(name, slug, rating, small_pieces, prep_heavy, form_note)
on conflict (user_id, slug) do nothing;

insert into nutrition_constraints
  (user_id, has_eoe, avoids_eating_with_hands, prefers_bowls, spice_tolerance,
   max_prep_minutes, prefers_small_frequent_meals, max_leftover_hours, notes)
select id, true, true, true, 'medium', 5, true, 24,
  'Germaphobe; prefers fresh over reheated; sandwiches wrapped in foil'
from auth.users limit 1
on conflict (user_id) do nothing;

insert into nutrition_vendors (user_id, name, slug, app_url, display_order)
select o.id, v.name, v.slug, v.app_url, v.ord
from (select id from auth.users limit 1) o cross join (values
  ('Amazon Fresh','amazon-fresh','https://www.amazon.com/fmc', 1),
  ('Costco (Instacart)','costco-instacart','https://www.instacart.com/store/costco/storefront', 2),
  ('Gus''s Community Market','guss-community-market', null, 3),
  ('Thistle','thistle','https://www.thistle.co', 4)
) as v(name, slug, app_url, ord)
on conflict (user_id, slug) do nothing;

-- Level 1 seeded active with started_at NULL; profiles targets are NOT
-- written here — first write happens on the first confirmed change in-app.
insert into calorie_ramp_levels
  (user_id, level, name, target_calories, target_protein_g, is_active)
select o.id, v.lvl, v.name, v.cal, v.protein, v.active
from (select id from auth.users limit 1) o cross join (values
  (1,'Foundation',2300,160,true),
  (2,'Momentum',2500,165,false),
  (3,'Growth',2700,170,false),
  (4,'Peak',2900,175,false)
) as v(lvl, name, cal, protein, active)
on conflict (user_id, level) do nothing;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260728100100_nutrition_preference_seed.sql
git commit -m "feat(nutrition-os): seed preference data from discovery conversation"
```

---

### Task 6: Link-backfill migration

**Files:**
- Create: `supabase/migrations/20260728100200_nutrition_concept_link_backfill.sql`

- [ ] **Step 1: Write the backfill**

Conservative matching only: case-insensitive exact name, or product name containing the concept name when the concept name is ≥5 characters (avoids "Rice" → "Rice Krispies"-class false positives on short tokens is accepted for ≥5 chars as substring matches are reviewable and additive).

```sql
-- Backfill concept links to existing products. Conservative name matching;
-- ambiguous rows stay unlinked. Idempotent via on conflict do nothing.

insert into food_concept_links (user_id, concept_id, saved_food_id, matched_by)
select c.user_id, c.id, f.id, 'auto_name_match'
from food_concepts c
join saved_foods f on f.user_id = c.user_id
 and (
   lower(trim(f.name)) = lower(c.name)
   or (length(c.name) >= 5 and f.name ilike '%' || c.name || '%')
 )
on conflict (concept_id, saved_food_id) do nothing;

insert into food_concept_links (user_id, concept_id, food_inventory_id, matched_by)
select c.user_id, c.id, i.id, 'auto_name_match'
from food_concepts c
join food_inventory i on i.user_id = c.user_id
 and (
   lower(trim(i.name)) = lower(c.name)
   or (length(c.name) >= 5 and i.name ilike '%' || c.name || '%')
 )
on conflict (concept_id, food_inventory_id) do nothing;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260728100200_nutrition_concept_link_backfill.sql
git commit -m "feat(nutrition-os): conservative concept-to-product link backfill"
```

---

### Task 7: Apply migrations to prod — ⛔ OWNER GATE

**⛔ STOP: prod is the owner's real data with no staging. Do NOT run this step without the owner's explicit go-ahead in the session.**

- [ ] **Step 1: Dry-run listing**

Run (repo root): `supabase migration list`
Expected: the three new migrations show as pending locally, remote ledger in sync otherwise.

- [ ] **Step 2: WAIT for owner confirmation, then push**

Run: `supabase db push`
Expected: three migrations applied cleanly.

- [ ] **Step 3: Verify seeded data**

Run: `supabase db execute --sql "select count(*) from food_concepts; select count(*) from calorie_ramp_levels where is_active; select count(*) from nutrition_constraints;"`
(If `db execute` is unavailable in the CLI version, use `psql` with the project connection string.)
Expected: 65 / 1 / 1.

---

### Task 8: Query module

**Files:**
- Create: `mobile/src/lib/supabase/nutritionPreferences.ts`

- [ ] **Step 1: Write the module**

```ts
// Data access for Nutrition OS Phase 1 (house pattern: domain query module).
import { supabase } from "../supabase";
import type {
  CalorieRampLevel,
  ConceptRating,
  FoodConcept,
  NutritionConstraints,
  NutritionVendor,
} from "@/src/types/nutrition-preferences";

export interface NutritionPreferencesData {
  concepts: FoodConcept[];
  constraints: NutritionConstraints | null;
  vendors: NutritionVendor[];
  rampLevels: CalorieRampLevel[];
}

export async function fetchNutritionPreferences(): Promise<NutritionPreferencesData> {
  const [concepts, constraints, vendors, rampLevels] = await Promise.all([
    supabase.from("food_concepts").select("*").order("name"),
    supabase.from("nutrition_constraints").select("*").maybeSingle(),
    supabase.from("nutrition_vendors").select("*").order("display_order"),
    supabase.from("calorie_ramp_levels").select("*").order("level"),
  ]);
  const firstError =
    concepts.error ?? constraints.error ?? vendors.error ?? rampLevels.error;
  if (firstError) throw firstError;
  return {
    concepts: (concepts.data ?? []) as FoodConcept[],
    constraints: (constraints.data ?? null) as NutritionConstraints | null,
    vendors: (vendors.data ?? []) as NutritionVendor[],
    rampLevels: (rampLevels.data ?? []) as CalorieRampLevel[],
  };
}

export type ConceptPatch = Partial<
  Pick<
    FoodConcept,
    "rating" | "requires_small_pieces" | "prep_intensive" | "form_note" | "notes" | "name"
  >
>;

export async function updateConcept(id: string, patch: ConceptPatch): Promise<void> {
  const { error } = await supabase
    .from("food_concepts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function createConcept(
  userId: string,
  name: string,
  rating: ConceptRating
): Promise<void> {
  const { error } = await supabase
    .from("food_concepts")
    .insert({ user_id: userId, name: name.trim(), slug: slugify(name), rating });
  if (error) throw error;
}

export async function deleteConcept(id: string): Promise<void> {
  const { error } = await supabase.from("food_concepts").delete().eq("id", id);
  if (error) throw error;
}

export type ConstraintsPatch = Partial<
  Omit<NutritionConstraints, "id" | "user_id" | "created_at" | "updated_at">
>;

export async function updateConstraints(
  id: string,
  patch: ConstraintsPatch
): Promise<void> {
  const { error } = await supabase
    .from("nutrition_constraints")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function updateVendor(
  id: string,
  patch: Partial<Pick<NutritionVendor, "name" | "app_url" | "is_active">>
): Promise<void> {
  const { error } = await supabase
    .from("nutrition_vendors")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Level-change semantics (spec §5.5): deactivate current -> activate target
 * with today's local date -> write targets onto canonical profiles row.
 * Sequential writes; on any failure the caller must refetch and re-render
 * from DB state (no trusted local state).
 */
export async function changeRampLevel(
  userId: string,
  currentLevel: CalorieRampLevel | null,
  targetLevel: CalorieRampLevel,
  todayLocalDate: string
): Promise<void> {
  if (currentLevel) {
    const { error } = await supabase
      .from("calorie_ramp_levels")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", currentLevel.id);
    if (error) throw error;
  }
  const { error: activateError } = await supabase
    .from("calorie_ramp_levels")
    .update({
      is_active: true,
      started_at: todayLocalDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", targetLevel.id);
  if (activateError) throw activateError;

  const profilePatch: Record<string, number> = {
    target_calories: targetLevel.target_calories,
    target_protein_g: targetLevel.target_protein_g,
  };
  if (targetLevel.target_carbs_g !== null)
    profilePatch.target_carbs_g = targetLevel.target_carbs_g;
  if (targetLevel.target_fats_g !== null)
    profilePatch.target_fats_g = targetLevel.target_fats_g;
  const { error: profileError } = await supabase
    .from("profiles")
    .update(profilePatch)
    .eq("id", userId);
  if (profileError) throw profileError;
}

export async function fetchRecentWeighIns(
  sinceLocalDate: string
): Promise<{ date: string; weight_lbs: number }[]> {
  const { data, error } = await supabase
    .from("weight_logs")
    .select("date, weight_lbs")
    .gte("date", sinceLocalDate)
    .order("date");
  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/lib/supabase/nutritionPreferences.ts
git commit -m "feat(nutrition-os): preference data-access module"
```

---

### Task 9: UI — shared styles, RampCard, ConstraintsSection, VendorsSection

**Files:**
- Create: `mobile/src/components/profile/nutrition/styles.ts`
- Create: `mobile/src/components/profile/nutrition/RampCard.tsx`
- Create: `mobile/src/components/profile/nutrition/ConstraintsSection.tsx`
- Create: `mobile/src/components/profile/nutrition/VendorsSection.tsx`

- [ ] **Step 1: Create `styles.ts`**

```ts
import { StyleSheet } from "react-native";
import { colors } from "@/src/lib/colors";

export const nutritionStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: { color: colors.foreground, fontSize: 20, fontWeight: "700" },
  headerAction: { color: colors.primary, fontSize: 16, fontWeight: "600" },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  rowLabel: { color: colors.foreground, fontSize: 15, flexShrink: 1 },
  rowValue: { color: colors.mutedForeground, fontSize: 15 },
  banner: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: 12,
    marginTop: 12,
  },
  bannerText: { color: colors.foreground, fontSize: 14, marginBottom: 8 },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  primaryButtonText: {
    color: colors.primaryForeground,
    fontSize: 15,
    fontWeight: "700",
  },
  mutedText: { color: colors.mutedForeground, fontSize: 13 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.mutedForeground, fontSize: 13 },
  chipTextActive: { color: colors.primaryForeground, fontWeight: "700" },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.foreground,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  destructiveButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.destructive,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 12,
  },
  destructiveButtonText: { color: "#F87171", fontSize: 15, fontWeight: "600" },
});
```

- [ ] **Step 2: Create `RampCard.tsx`**

```tsx
import React from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";
import type { CalorieRampLevel } from "@/src/types/nutrition-preferences";
import type { RampAssessment } from "@/src/lib/rampProgress";
import { nutritionStyles as s } from "./styles";

interface RampCardProps {
  levels: CalorieRampLevel[];
  assessment: RampAssessment | null;
  onChangeLevel: (target: CalorieRampLevel) => void;
}

export function RampCard({ levels, assessment, onChangeLevel }: RampCardProps) {
  const active = levels.find((l) => l.is_active) ?? null;
  const next = active
    ? levels.find((l) => l.level === active.level + 1) ?? null
    : levels[0] ?? null;

  const confirmChange = (target: CalorieRampLevel) => {
    Alert.alert(
      "Change ramp level",
      `Set Level ${target.level} · ${target.name}?\nThis updates your daily targets to ${target.target_calories} cal / ${target.target_protein_g} g protein.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: () => onChangeLevel(target) },
      ]
    );
  };

  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>Lean Bulk Ramp</Text>
      {active ? (
        <View style={s.row}>
          <Text style={s.rowLabel}>
            Level {active.level} · {active.name}
          </Text>
          <Text style={s.rowValue}>
            {active.target_calories} cal / {active.target_protein_g} g
          </Text>
        </View>
      ) : (
        <Text style={s.mutedText}>No active level.</Text>
      )}
      {assessment && (
        <Text style={s.mutedText}>
          {assessment.weeklyGainLbs !== null
            ? `Trend: ${assessment.weeklyGainLbs >= 0 ? "+" : ""}${assessment.weeklyGainLbs.toFixed(2)} lb/wk. `
            : ""}
          {assessment.reason}
        </Text>
      )}
      {assessment?.recommendation === "advance" && next && (
        <View style={s.banner}>
          <Text style={s.bannerText}>
            Time to advance to Level {next.level} · {next.name} (
            {next.target_calories} cal)?
          </Text>
          <TouchableOpacity
            style={s.primaryButton}
            onPress={() => confirmChange(next)}
          >
            <Text style={s.primaryButtonText}>Advance to {next.name}</Text>
          </TouchableOpacity>
        </View>
      )}
      <Text style={[s.mutedText, { marginTop: 12 }]}>Change level manually:</Text>
      <View style={s.chipRow}>
        {levels.map((l) => {
          const isActive = l.id === active?.id;
          return (
            <TouchableOpacity
              key={l.id}
              style={[s.chip, isActive && s.chipActive]}
              disabled={isActive}
              onPress={() => confirmChange(l)}
            >
              <Text style={[s.chipText, isActive && s.chipTextActive]}>
                L{l.level} {l.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
```

- [ ] **Step 3: Create `ConstraintsSection.tsx`**

```tsx
import React from "react";
import { Switch, Text, TouchableOpacity, View } from "react-native";
import type {
  NutritionConstraints,
  SpiceTolerance,
} from "@/src/types/nutrition-preferences";
import type { ConstraintsPatch } from "@/src/lib/supabase/nutritionPreferences";
import { colors } from "@/src/lib/colors";
import { nutritionStyles as s } from "./styles";

const SPICE_LEVELS: SpiceTolerance[] = ["none", "mild", "medium", "hot"];
const PREP_CHOICES = [5, 10, 15, 20];
const LEFTOVER_CHOICES = [12, 24, 48];

interface ConstraintsSectionProps {
  constraints: NutritionConstraints;
  onPatch: (patch: ConstraintsPatch) => void;
}

function BoolRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.primary, false: colors.border }}
      />
    </View>
  );
}

function ChipPicker<T extends string | number>({
  label,
  choices,
  value,
  format,
  onChange,
}: {
  label: string;
  choices: T[];
  value: T;
  format: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ paddingVertical: 10 }}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={s.chipRow}>
        {choices.map((c) => {
          const active = c === value;
          return (
            <TouchableOpacity
              key={String(c)}
              style={[s.chip, active && s.chipActive]}
              onPress={() => onChange(c)}
            >
              <Text style={[s.chipText, active && s.chipTextActive]}>
                {format(c)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function ConstraintsSection({
  constraints,
  onPatch,
}: ConstraintsSectionProps) {
  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>Eating Constraints</Text>
      <BoolRow
        label="EoE (soft textures, small pieces)"
        value={constraints.has_eoe}
        onChange={(v) => onPatch({ has_eoe: v })}
      />
      <BoolRow
        label="Avoid eating with hands"
        value={constraints.avoids_eating_with_hands}
        onChange={(v) => onPatch({ avoids_eating_with_hands: v })}
      />
      <BoolRow
        label="Prefer bowls"
        value={constraints.prefers_bowls}
        onChange={(v) => onPatch({ prefers_bowls: v })}
      />
      <BoolRow
        label="Small frequent meals"
        value={constraints.prefers_small_frequent_meals}
        onChange={(v) => onPatch({ prefers_small_frequent_meals: v })}
      />
      <ChipPicker
        label="Spice tolerance"
        choices={SPICE_LEVELS}
        value={constraints.spice_tolerance}
        format={(v) => v}
        onChange={(v) => onPatch({ spice_tolerance: v })}
      />
      <ChipPicker
        label="Max prep time"
        choices={PREP_CHOICES}
        value={constraints.max_prep_minutes}
        format={(v) => `${v} min`}
        onChange={(v) => onPatch({ max_prep_minutes: v })}
      />
      <ChipPicker
        label="Leftovers OK for"
        choices={LEFTOVER_CHOICES}
        value={constraints.max_leftover_hours}
        format={(v) => `${v} h`}
        onChange={(v) => onPatch({ max_leftover_hours: v })}
      />
    </View>
  );
}
```

- [ ] **Step 4: Create `VendorsSection.tsx`**

```tsx
import React from "react";
import { Switch, Text, View } from "react-native";
import type { NutritionVendor } from "@/src/types/nutrition-preferences";
import { colors } from "@/src/lib/colors";
import { nutritionStyles as s } from "./styles";

interface VendorsSectionProps {
  vendors: NutritionVendor[];
  onToggleActive: (vendor: NutritionVendor, isActive: boolean) => void;
}

export function VendorsSection({ vendors, onToggleActive }: VendorsSectionProps) {
  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>Vendors</Text>
      {vendors.map((v) => (
        <View key={v.id} style={s.row}>
          <View style={{ flexShrink: 1 }}>
            <Text style={s.rowLabel}>{v.name}</Text>
            {v.app_url ? <Text style={s.mutedText}>{v.app_url}</Text> : null}
          </View>
          <Switch
            value={v.is_active}
            onValueChange={(val) => onToggleActive(v, val)}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
      ))}
    </View>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/components/profile/nutrition/
git commit -m "feat(nutrition-os): ramp, constraints, and vendors sections"
```

---

### Task 10: UI — ConceptRow (rating list item with inline editor)

**Files:**
- Create: `mobile/src/components/profile/nutrition/ConceptRow.tsx`

- [ ] **Step 1: Create `ConceptRow.tsx`**

```tsx
import React, { useState } from "react";
import {
  Alert,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type {
  ConceptRating,
  FoodConcept,
} from "@/src/types/nutrition-preferences";
import { CONCEPT_RATINGS } from "@/src/types/nutrition-preferences";
import type { ConceptPatch } from "@/src/lib/supabase/nutritionPreferences";
import { colors } from "@/src/lib/colors";
import { nutritionStyles as s } from "./styles";

export const RATING_LABELS: Record<ConceptRating, string> = {
  never: "Never",
  dislike: "Dislike",
  neutral: "Neutral",
  like: "Like",
  love: "Love",
};

const RATING_COLORS: Record<ConceptRating, string> = {
  never: "#F87171",
  dislike: "#FB923C",
  neutral: colors.mutedForeground,
  like: "#60A5FA",
  love: colors.primary,
};

interface ConceptRowProps {
  concept: FoodConcept;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  onPatch: (concept: FoodConcept, patch: ConceptPatch) => void;
  onDelete: (concept: FoodConcept) => void;
}

export const ConceptRow = React.memo(function ConceptRow({
  concept,
  expanded,
  onToggleExpand,
  onPatch,
  onDelete,
}: ConceptRowProps) {
  const [formNote, setFormNote] = useState(concept.form_note ?? "");

  const confirmDelete = () => {
    Alert.alert("Delete concept", `Remove "${concept.name}" and its links?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => onDelete(concept),
      },
    ]);
  };

  return (
    <View style={[s.card, { marginBottom: 8, paddingVertical: 10 }]}>
      <TouchableOpacity
        style={s.row}
        onPress={() => onToggleExpand(concept.id)}
      >
        <Text style={s.rowLabel}>{concept.name}</Text>
        <Text style={[s.rowValue, { color: RATING_COLORS[concept.rating] }]}>
          {RATING_LABELS[concept.rating]}
          {concept.requires_small_pieces ? " · ✂︎" : ""}
          {concept.prep_intensive ? " · ⏱" : ""}
        </Text>
      </TouchableOpacity>
      {expanded && (
        <View>
          <View style={s.chipRow}>
            {CONCEPT_RATINGS.map((r) => {
              const active = r === concept.rating;
              return (
                <TouchableOpacity
                  key={r}
                  style={[s.chip, active && s.chipActive]}
                  onPress={() => onPatch(concept, { rating: r })}
                >
                  <Text style={[s.chipText, active && s.chipTextActive]}>
                    {RATING_LABELS[r]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={s.row}>
            <Text style={s.rowLabel}>Requires small pieces (EoE)</Text>
            <Switch
              value={concept.requires_small_pieces}
              onValueChange={(v) => onPatch(concept, { requires_small_pieces: v })}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
          <View style={s.row}>
            <Text style={s.rowLabel}>Prep-intensive</Text>
            <Switch
              value={concept.prep_intensive}
              onValueChange={(v) => onPatch(concept, { prep_intensive: v })}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
          <TextInput
            style={s.input}
            placeholder="Form note (e.g. must be diced; no bones)"
            placeholderTextColor={colors.mutedForeground}
            value={formNote}
            onChangeText={setFormNote}
            onEndEditing={() =>
              onPatch(concept, { form_note: formNote.trim() || null })
            }
          />
          <TouchableOpacity style={s.destructiveButton} onPress={confirmDelete}>
            <Text style={s.destructiveButtonText}>Delete concept</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/profile/nutrition/ConceptRow.tsx
git commit -m "feat(nutrition-os): concept rating row with inline editor"
```

---

### Task 11: UI — screen container + Profile wiring

**Files:**
- Create: `mobile/src/components/profile/nutrition/NutritionPreferencesScreen.tsx`
- Modify: `mobile/src/components/profile/ProfileMenu.tsx` (add menu entry + prop)
- Modify: `mobile/app/(tabs)/profile.tsx` (add modal state + Modal block)

- [ ] **Step 1: Create `NutritionPreferencesScreen.tsx`**

The concept list is the screen's FlatList; ramp/constraints/vendors render in `ListHeaderComponent`. All writes: optimistic-free — mutate, then refetch section on success; named alert on failure (house idiom).

```tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type {
  CalorieRampLevel,
  FoodConcept,
  NutritionVendor,
} from "@/src/types/nutrition-preferences";
import {
  changeRampLevel,
  createConcept,
  deleteConcept,
  fetchNutritionPreferences,
  fetchRecentWeighIns,
  NutritionPreferencesData,
  updateConcept,
  updateConstraints,
  updateVendor,
  type ConceptPatch,
  type ConstraintsPatch,
} from "@/src/lib/supabase/nutritionPreferences";
import { assessRampProgress, RampAssessment } from "@/src/lib/rampProgress";
import { getLocalDateString } from "@/src/components/track/meals/mealsHelpers";
import { colors } from "@/src/lib/colors";
import { RampCard } from "./RampCard";
import { ConstraintsSection } from "./ConstraintsSection";
import { VendorsSection } from "./VendorsSection";
import { ConceptRow } from "./ConceptRow";
import { nutritionStyles as s } from "./styles";

const TREND_WINDOW_DAYS = 42; // 6 weeks of weigh-ins for the ramp assessment

interface NutritionPreferencesScreenProps {
  userId: string;
  onClose: () => void;
}

export function NutritionPreferencesScreen({
  userId,
  onClose,
}: NutritionPreferencesScreenProps) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<NutritionPreferencesData | null>(null);
  const [assessment, setAssessment] = useState<RampAssessment | null>(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newConceptName, setNewConceptName] = useState("");

  const load = useCallback(async () => {
    try {
      const prefs = await fetchNutritionPreferences();
      setData(prefs);
      const active = prefs.rampLevels.find((l) => l.is_active) ?? null;
      const today = getLocalDateString();
      const since = new Date();
      since.setDate(since.getDate() - TREND_WINDOW_DAYS);
      const weighIns = await fetchRecentWeighIns(getLocalDateString(since));
      setAssessment(
        assessRampProgress(weighIns, active?.started_at ?? null, today)
      );
    } catch (e) {
      Alert.alert(
        "Failed to load preferences",
        e instanceof Error ? e.message : "Unknown error"
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = useCallback(
    async (title: string, fn: () => Promise<void>) => {
      try {
        await fn();
        await load();
      } catch (e) {
        Alert.alert(title, e instanceof Error ? e.message : "Unknown error");
        await load(); // re-sync from DB state on failure
      }
    },
    [load]
  );

  const handleChangeLevel = (target: CalorieRampLevel) => {
    const current = data?.rampLevels.find((l) => l.is_active) ?? null;
    run("Failed to change level", () =>
      changeRampLevel(userId, current, target, getLocalDateString())
    );
  };

  const handleConstraintsPatch = (patch: ConstraintsPatch) => {
    if (!data?.constraints) return;
    run("Failed to save constraints", () =>
      updateConstraints(data.constraints!.id, patch)
    );
  };

  const handleVendorToggle = (vendor: NutritionVendor, isActive: boolean) => {
    run("Failed to save vendor", () => updateVendor(vendor.id, { is_active: isActive }));
  };

  const handleConceptPatch = (concept: FoodConcept, patch: ConceptPatch) => {
    run("Failed to save food", () => updateConcept(concept.id, patch));
  };

  const handleConceptDelete = (concept: FoodConcept) => {
    run("Failed to delete food", () => deleteConcept(concept.id));
  };

  const handleAddConcept = () => {
    const name = newConceptName.trim();
    if (!name) return;
    setNewConceptName("");
    run("Failed to add food", () => createConcept(userId, name, "neutral"));
  };

  const filteredConcepts = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const list = q
      ? data.concepts.filter((c) => c.name.toLowerCase().includes(q))
      : data.concepts;
    // Blockers first: never -> dislike -> neutral -> like -> love, then name.
    const order = { never: 0, dislike: 1, neutral: 2, like: 3, love: 4 };
    return [...list].sort(
      (a, b) => order[a.rating] - order[b.rating] || a.name.localeCompare(b.name)
    );
  }, [data, search]);

  if (!data) {
    return (
      <View
        style={[s.screen, { paddingTop: insets.top, justifyContent: "center" }]}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Nutrition Preferences</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={s.headerAction}>Done</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={filteredConcepts}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <View>
            <RampCard
              levels={data.rampLevels}
              assessment={assessment}
              onChangeLevel={handleChangeLevel}
            />
            {data.constraints && (
              <ConstraintsSection
                constraints={data.constraints}
                onPatch={handleConstraintsPatch}
              />
            )}
            <VendorsSection
              vendors={data.vendors}
              onToggleActive={handleVendorToggle}
            />
            <View style={s.card}>
              <Text style={s.sectionTitle}>Food Ratings</Text>
              <TextInput
                style={s.input}
                placeholder="Search foods..."
                placeholderTextColor={colors.mutedForeground}
                value={search}
                onChangeText={setSearch}
              />
              <View style={[s.row, { gap: 8 }]}>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="Add a food (e.g. Pickles)"
                  placeholderTextColor={colors.mutedForeground}
                  value={newConceptName}
                  onChangeText={setNewConceptName}
                  onSubmitEditing={handleAddConcept}
                />
                <TouchableOpacity
                  style={[s.primaryButton, { paddingHorizontal: 16 }]}
                  onPress={handleAddConcept}
                >
                  <Text style={s.primaryButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <ConceptRow
            concept={item}
            expanded={expandedId === item.id}
            onToggleExpand={(id) =>
              setExpandedId((prev) => (prev === id ? null : id))
            }
            onPatch={handleConceptPatch}
            onDelete={handleConceptDelete}
          />
        )}
      />
    </View>
  );
}
```

Note: `getLocalDateString` in `mealsHelpers.ts` accepts an optional `Date` argument (verified signature: `(date: Date = new Date()) => string`) — used here for both today and the window start.

- [ ] **Step 2: Add the menu entry to `ProfileMenu.tsx`**

Follow the existing structure exactly (interface prop + destructured arg + `items` entry). Add to `ProfileMenuProps`:

```ts
onNutritionPress: () => void;
```

Destructure `onNutritionPress` alongside the existing props, and add an item after the Goals entry, matching the neighboring items' shape (same fields the Goals item uses — icon from lucide-react-native, e.g. `Salad`):

```ts
{
  icon: Salad,
  label: "Nutrition Preferences",
  onPress: onNutritionPress,
},
```

(Import `Salad` where the other lucide icons are imported. If neighboring items carry extra fields — e.g. `id`, `color` — mirror them.)

- [ ] **Step 3: Wire the modal in `app/(tabs)/profile.tsx`**

Extend the `activeModal` state union with `"nutrition"`, pass `onNutritionPress={() => setActiveModal("nutrition")}` to `ProfileMenu`, and add a Modal block after the Goals modal, exactly following the established pattern:

```tsx
{/* Nutrition Preferences Modal */}
<Modal
  visible={activeModal === "nutrition"}
  animationType="slide"
  presentationStyle="fullScreen"
  statusBarTranslucent={false}
  onRequestClose={() => setActiveModal(null)}
>
  <NutritionPreferencesScreen
    userId={userId}
    onClose={() => setActiveModal(null)}
  />
</Modal>
```

Import: `import { NutritionPreferencesScreen } from "@/src/components/profile/nutrition/NutritionPreferencesScreen";`
(`userId` already exists in this file — it is passed to `GoalsScreen`.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/profile/nutrition/NutritionPreferencesScreen.tsx \
  mobile/src/components/profile/ProfileMenu.tsx "mobile/app/(tabs)/profile.tsx"
git commit -m "feat(nutrition-os): Nutrition Preferences screen wired into Profile"
```

---

### Task 12: Final verification

- [ ] **Step 1: Full test + typecheck sweep**

Run (in `mobile/`): `npm test && npx tsc --noEmit`
Expected: all Jest tests pass; 0 type errors.

- [ ] **Step 2: On-device verification (requires migrations applied — Task 7)**

House rules: dedicated simulator instance + unique Metro port (never 8081). Note: the dev client needs a rebuild (expo-image change) before it will launch.

Verify manually:
1. Profile → Nutrition Preferences opens full-screen.
2. Ramp card shows Level 1 · Foundation · 2300/160; trend line shows `insufficient_data` reason (or a real trend if ≥3 weeks of weigh-ins exist).
3. Toggle a constraint → survives close/reopen (persisted).
4. Search "pick" → Pickles (Never, listed first-group); change a rating → survives reopen.
5. Add concept "Test Food" → appears (Neutral); delete it via expanded editor.
6. Manual level change to Level 2 → confirm dialog → after confirm, Profile → Goals shows 2500 cal / 165 g protein.
7. Change back to Level 1 → Goals shows 2300/160.

- [ ] **Step 3: Update dev backlog (optional, owner's call)**

The in-app `dev_tasks` admin screen can track follow-ups (linking UI, Phase 2).

---

## Self-review notes

- **Spec coverage:** §5 tables → Task 4; §5.5 seed values → Task 5; §6 ramp math incl. null-`started_at` waiver → Task 2; §7 UI sections → Tasks 9–11; §8 seeding/backfill → Tasks 5–6; §9 types/tests/verification → Tasks 1, 3, 12. Swipe-to-delete and FlatList placement deviations are declared in the header.
- **Type consistency:** `ConceptPatch`/`ConstraintsPatch` exported from the query module and imported by components; `RampAssessment` shared from `rampProgress.ts`; `CONCEPT_RATINGS` ordering matches the UI's blockers-first sort.
- **Known adaptation points:** exact `ProfileMenu` item fields and the `activeModal` union shape are followed-by-pattern (Steps 2–3 of Task 11 say to mirror neighbors) since those files' full contents weren't reproduced here.
