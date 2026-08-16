# Daily Training Phase 1 — Capture & Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paste an Instagram/TikTok link into FitTracker, have AI extract the exercises into the unified exercise library with source attribution, and browse them in a filterable Catalog tab under a new "Daily" training mode.

**Architecture:** New capture tables reference the existing unified `exercises` table (spec: `docs/superpowers/specs/2026-08-16-daily-training-design.md` §3–4). A `capture-post` edge function resolves post metadata (oEmbed / OpenGraph, thumbnail rehosted to app-owned storage — same doctrine as `dish-image-search`) and runs one constrained OpenAI extraction. All AI output is validated by pure client-side modules before anything is written; nothing saves without the user's accept tap. Catalog filtering is client-side over a joined query (catalog scale is tens–hundreds of rows).

**Tech Stack:** Expo/React Native (expo-router), Supabase (Postgres + RLS, Deno edge functions, Storage), OpenAI `gpt-5.6-terra`, Jest.

**Conventions that bind this plan (do not deviate):**
- The Supabase JS client is untyped — `tsc` proves nothing about table/column names. Every schema-touching task ends with a runtime verification step.
- Migrations are applied with `npx supabase db push --yes` from `mobile/` (see `mobile/CLAUDE.md`), never by pasting SQL into the dashboard.
- Bottom sheets, never inline pickers.
- The user approved this plan including its commit steps; commit exactly where the plan says, on the branch below, and never create a PR (solo repo — merge straight to `main` at the end, only when the user says to).
- The repo working tree has unrelated uncommitted changes (delivery/meal files). `git add` only the paths named in each commit step — never `git add -A`.

---

## File Structure

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260816100000_capture_catalog.sql` | Create: capture tables + RLS |
| `supabase/migrations/20260816100001_capture_thumbs_storage.sql` | Create: thumbnail bucket + policies |
| `supabase/functions/capture-post/index.ts` | Create: resolve (embed fetch + thumb rehost) and extract (OpenAI) actions |
| `mobile/src/types/capture.ts` | Create: all Phase-1 capture types |
| `mobile/src/lib/captureReview.ts` | Create: pure — sanitize/validate AI extraction, category mapping |
| `mobile/src/lib/catalogFilter.ts` | Create: pure — filter/search captured catalog rows |
| `mobile/src/lib/__tests__/captureReview.test.ts` | Test for captureReview |
| `mobile/src/lib/__tests__/catalogFilter.test.ts` | Test for catalogFilter |
| `mobile/src/lib/supabase/capture.ts` | Create: edge-function invocations + save/fetch queries |
| `mobile/src/components/training/daily/CaptureSheet.tsx` | Create: paste-URL bottom sheet (resolve → caption fallback → extract) |
| `mobile/src/components/training/daily/CaptureReviewSheet.tsx` | Create: confirm/edit card; the only write path |
| `mobile/src/components/training/daily/CatalogTab.tsx` | Create: filterable captured-exercise list + capture FAB |
| `mobile/src/components/training/daily/TodayTab.tsx` | Create: Phase-2 placeholder |
| `mobile/src/components/training/daily/GymsTab.tsx` | Create: Phase-2 placeholder |
| `mobile/app/(tabs)/training/index.tsx` | Modify: add third "daily" mode (icon, tabs, search placeholder, counts) |

Reused, not modified: `createExercise` + reference-table fetchers in `mobile/src/lib/supabase/crossfit.ts`; colors in `mobile/src/lib/colors.ts`.

---

### Task 0: Branch

- [ ] **Step 0.1: Create the working branch**

```bash
cd /Users/brianwilson/code/fittracker
git checkout -b daily-training
```

Expected: `Switched to a new branch 'daily-training'`. The unrelated modified files in the working tree come along; leave them untouched.

---

### Task 1: Capture schema migration

**Files:**
- Create: `supabase/migrations/20260816100000_capture_catalog.sql`
- Create: `supabase/migrations/20260816100001_capture_thumbs_storage.sql`

- [ ] **Step 1.1: Write the capture tables migration**

Create `supabase/migrations/20260816100000_capture_catalog.sql`:

```sql
-- Daily Training Phase 1: social-media capture catalog. 2026-08-16.
-- Spec: docs/superpowers/specs/2026-08-16-daily-training-design.md §3.
--
-- captured_sources is the provenance record: one row per shared post. The
-- exercises themselves live in the existing unified `exercises` table; the
-- source_exercises junction is what makes an exercise "captured". A post that
-- contains a full workout ADDITIONALLY gets a captured_workouts row preserving
-- the creator's programming, servable whole by the Phase-2 recommender.

CREATE TABLE IF NOT EXISTS public.captured_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'other')),
  -- The tap-back link. Unique per user so a re-shared post surfaces the
  -- existing capture instead of re-processing.
  source_url TEXT NOT NULL,
  poster_handle TEXT,
  caption_text TEXT,
  -- Rehosted into the capture-thumbs bucket, never hot-linked (the source
  -- CDN's URL is exactly the kind that vanishes).
  thumbnail_url TEXT,
  -- The AI's full output, for audit and for retry-after-failure.
  raw_extraction JSONB,
  extraction_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'reviewed', 'failed')),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS captured_sources_user_url_unique
  ON public.captured_sources (user_id, source_url);

CREATE TABLE IF NOT EXISTS public.source_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.captured_sources(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  -- TRUE when this capture created the exercise row; FALSE when the AI
  -- matched an existing library entry and we only linked it.
  was_created BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS source_exercises_exercise
  ON public.source_exercises (exercise_id);

CREATE TABLE IF NOT EXISTS public.captured_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.captured_sources(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.captured_workout_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_workout_id UUID NOT NULL REFERENCES public.captured_workouts(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  exercise_order INTEGER NOT NULL,
  target_sets INTEGER,
  -- TEXT, matching wod_movements: rep schemes like '21-15-9' or '8-12'.
  target_reps TEXT,
  rest_seconds INTEGER,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS captured_workout_exercises_workout
  ON public.captured_workout_exercises (captured_workout_id);

ALTER TABLE public.captured_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captured_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captured_workout_exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own captured sources" ON public.captured_sources;
CREATE POLICY "Users manage own captured sources"
  ON public.captured_sources FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- source_exercises has no user_id of its own; ownership flows through the
-- parent source row.
DROP POLICY IF EXISTS "Users manage own source links" ON public.source_exercises;
CREATE POLICY "Users manage own source links"
  ON public.source_exercises FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.captured_sources s
    WHERE s.id = source_id AND s.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.captured_sources s
    WHERE s.id = source_id AND s.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users manage own captured workouts" ON public.captured_workouts;
CREATE POLICY "Users manage own captured workouts"
  ON public.captured_workouts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own captured workout items" ON public.captured_workout_exercises;
CREATE POLICY "Users manage own captured workout items"
  ON public.captured_workout_exercises FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.captured_workouts w
    WHERE w.id = captured_workout_id AND w.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.captured_workouts w
    WHERE w.id = captured_workout_id AND w.user_id = auth.uid()
  ));

COMMENT ON TABLE public.captured_sources IS
  'One row per social post shared into the app. Exercises live in exercises; source_exercises links them.';
```

- [ ] **Step 1.2: Write the thumbnail bucket migration**

Create `supabase/migrations/20260816100001_capture_thumbs_storage.sql` (convention copied from `20251025000000_create_movement_images_storage.sql`):

```sql
-- Bucket for rehosted capture thumbnails. Path convention: {userId}/{ts}.{ext}
INSERT INTO storage.buckets (id, name, public)
VALUES ('capture-thumbs', 'capture-thumbs', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read capture thumbs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'capture-thumbs');

-- Writes happen only from the edge function via service role, which bypasses
-- RLS — no authenticated INSERT policy on purpose.

CREATE POLICY "Users delete own capture thumbs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'capture-thumbs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

- [ ] **Step 1.3: Apply and verify**

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx supabase db push --yes
npx supabase migration list | tail -5
```

Expected: both `20260816100000` and `20260816100001` listed as applied on remote. If push fails on a policy name collision, the policy already exists from a partial run — the `DROP POLICY IF EXISTS` lines make table policies rerunnable; for the storage policies add `DROP POLICY IF EXISTS "<name>" ON storage.objects;` above each and re-push.

- [ ] **Step 1.4: Commit**

```bash
cd /Users/brianwilson/code/fittracker
git add supabase/migrations/20260816100000_capture_catalog.sql supabase/migrations/20260816100001_capture_thumbs_storage.sql
git commit -m "feat(daily): capture catalog schema — sources, links, captured workouts, thumb bucket"
```

---

### Task 2: Capture types

**Files:**
- Create: `mobile/src/types/capture.ts`

- [ ] **Step 2.1: Write the types file**

```typescript
// Types for Daily Training Phase 1 — social capture.
// Spec: docs/superpowers/specs/2026-08-16-daily-training-design.md

export type CapturePlatform = "instagram" | "tiktok" | "other";

/** What the AI is allowed to call an exercise's role. Maps onto the existing
 *  goal_types / movement_categories reference tables in captureReview.ts. */
export type CaptureCategory =
  | "strength"
  | "conditioning"
  | "mobility"
  | "stretching"
  | "warmup"
  | "skill";

export type CaptureSkillLevel = "Beginner" | "Intermediate" | "Advanced";

/** capture-post { action: "resolve" } result. */
export interface ResolvedPost {
  platform: CapturePlatform;
  posterHandle: string | null;
  captionText: string | null;
  /** App-owned URL in the capture-thumbs bucket, already rehosted. */
  thumbnailUrl: string | null;
  /** True when the platform gave us nothing usable — the sheet must ask the
   *  user to paste the caption before extraction can run. */
  needsCaption: boolean;
}

/** One exercise as proposed by the AI, after sanitizing. */
export interface ExtractedExercise {
  name: string;
  description: string | null;
  category: CaptureCategory;
  skillLevel: CaptureSkillLevel;
  /** Names from the muscle_regions reference table, validated. */
  primaryMuscles: string[];
  secondaryMuscles: string[];
  /** Names from the equipment reference table, validated. */
  equipment: string[];
  /** Existing exercises.id when the AI matched a library entry, else null.
   *  Only ids present in the library index survive sanitizing. */
  libraryMatchId: string | null;
}

export interface ExtractedWorkoutItem {
  /** Index into ExtractedPost.exercises. */
  exerciseIndex: number;
  sets: number | null;
  reps: string | null;
  restSeconds: number | null;
  notes: string | null;
}

/** capture-post { action: "extract" } result, after sanitizing. */
export interface ExtractedPost {
  postType: "single_exercise" | "full_workout";
  exercises: ExtractedExercise[];
  workout: { name: string; items: ExtractedWorkoutItem[] } | null;
}

/** A row in the Catalog tab: an exercise plus its capture provenance. */
export interface CatalogEntry {
  exerciseId: string;
  name: string;
  skillLevel: CaptureSkillLevel | null;
  equipmentTypes: string[];
  /** [{ name, isPrimary }] from exercise_muscle_regions join. */
  muscles: { name: string; isPrimary: boolean }[];
  /** goal_types names from exercise_goal_types join. */
  goalTypes: string[];
  sources: {
    sourceId: string;
    platform: CapturePlatform;
    sourceUrl: string;
    posterHandle: string | null;
    thumbnailUrl: string | null;
    capturedAt: string;
  }[];
}

export interface CatalogFilters {
  muscle: string | null;
  equipment: string | null;
  category: string | null; // goal_types name
  handle: string | null;
  search: string;
}
```

- [ ] **Step 2.2: Typecheck and commit**

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx tsc --noEmit
cd /Users/brianwilson/code/fittracker
git add mobile/src/types/capture.ts
git commit -m "feat(daily): capture domain types"
```

Expected: tsc exits 0 (pre-existing unrelated errors, if any, must not grow — compare against `git stash; npx tsc --noEmit; git stash pop` only if in doubt).

---

### Task 3: Pure module — sanitize the AI extraction (TDD)

**Files:**
- Create: `mobile/src/lib/captureReview.ts`
- Test: `mobile/src/lib/__tests__/captureReview.test.ts`

- [ ] **Step 3.1: Write the failing tests**

Create `mobile/src/lib/__tests__/captureReview.test.ts`:

```typescript
import { sanitizeExtraction, mapCategory } from "../captureReview";

const VALID = {
  libraryIds: new Set(["ex-1", "ex-2"]),
  muscles: new Set(["Chest", "Triceps", "Glutes"]),
  equipment: new Set(["Barbell", "Kettlebell", "Bands"]),
};

const rawExercise = (overrides: Record<string, unknown> = {}) => ({
  name: "Kettlebell RDL",
  description: "Hinge with kettlebell",
  category: "strength",
  skill_level: "Intermediate",
  primary_muscles: ["Glutes"],
  secondary_muscles: ["Triceps"],
  equipment: ["Kettlebell"],
  library_match_id: null,
  ...overrides,
});

describe("sanitizeExtraction", () => {
  it("accepts a well-formed single exercise", () => {
    const out = sanitizeExtraction(
      { post_type: "single_exercise", exercises: [rawExercise()], workout: null },
      VALID,
    );
    expect(out).not.toBeNull();
    expect(out!.postType).toBe("single_exercise");
    expect(out!.exercises).toHaveLength(1);
    expect(out!.exercises[0].name).toBe("Kettlebell RDL");
    expect(out!.exercises[0].primaryMuscles).toEqual(["Glutes"]);
  });

  it("drops a library match id that is not in the library index", () => {
    const out = sanitizeExtraction(
      {
        post_type: "single_exercise",
        exercises: [rawExercise({ library_match_id: "ex-999" })],
        workout: null,
      },
      VALID,
    );
    expect(out!.exercises[0].libraryMatchId).toBeNull();
  });

  it("keeps a library match id that is in the index", () => {
    const out = sanitizeExtraction(
      {
        post_type: "single_exercise",
        exercises: [rawExercise({ library_match_id: "ex-2" })],
        workout: null,
      },
      VALID,
    );
    expect(out!.exercises[0].libraryMatchId).toBe("ex-2");
  });

  it("drops unknown muscle and equipment names, keeps known ones", () => {
    const out = sanitizeExtraction(
      {
        post_type: "single_exercise",
        exercises: [
          rawExercise({
            primary_muscles: ["Glutes", "Face"],
            equipment: ["Kettlebell", "Anvil"],
          }),
        ],
        workout: null,
      },
      VALID,
    );
    expect(out!.exercises[0].primaryMuscles).toEqual(["Glutes"]);
    expect(out!.exercises[0].equipment).toEqual(["Kettlebell"]);
  });

  it("defaults an unrecognized category to strength and unknown level to Beginner", () => {
    const out = sanitizeExtraction(
      {
        post_type: "single_exercise",
        exercises: [rawExercise({ category: "yoga-flow", skill_level: "elite" })],
        workout: null,
      },
      VALID,
    );
    expect(out!.exercises[0].category).toBe("strength");
    expect(out!.exercises[0].skillLevel).toBe("Beginner");
  });

  it("returns null when there are no usable exercises", () => {
    expect(
      sanitizeExtraction({ post_type: "single_exercise", exercises: [], workout: null }, VALID),
    ).toBeNull();
    expect(
      sanitizeExtraction(
        { post_type: "single_exercise", exercises: [rawExercise({ name: "  " })], workout: null },
        VALID,
      ),
    ).toBeNull();
  });

  it("keeps a full workout whose item indexes are valid, drops out-of-range items", () => {
    const out = sanitizeExtraction(
      {
        post_type: "full_workout",
        exercises: [rawExercise(), rawExercise({ name: "Goblet Squat" })],
        workout: {
          name: "Leg Day",
          items: [
            { exercise_index: 0, sets: 3, reps: "8-12", rest_seconds: 90, notes: null },
            { exercise_index: 5, sets: 3, reps: "10", rest_seconds: 60, notes: null },
          ],
        },
      },
      VALID,
    );
    expect(out!.postType).toBe("full_workout");
    expect(out!.workout!.items).toHaveLength(1);
    expect(out!.workout!.items[0].exerciseIndex).toBe(0);
  });

  it("demotes full_workout to single_exercise when the workout block is missing", () => {
    const out = sanitizeExtraction(
      { post_type: "full_workout", exercises: [rawExercise()], workout: null },
      VALID,
    );
    expect(out!.postType).toBe("single_exercise");
    expect(out!.workout).toBeNull();
  });
});

describe("mapCategory", () => {
  it("maps each capture category onto existing reference-table names", () => {
    expect(mapCategory("strength")).toEqual({ goalType: "Strength", movementCategory: "Weightlifting" });
    expect(mapCategory("conditioning")).toEqual({ goalType: "MetCon", movementCategory: "Monostructural" });
    expect(mapCategory("mobility")).toEqual({ goalType: "Mobility", movementCategory: "Recovery" });
    expect(mapCategory("stretching")).toEqual({ goalType: "Stretching", movementCategory: "Recovery" });
    expect(mapCategory("warmup")).toEqual({ goalType: "Mobility", movementCategory: "Recovery" });
    expect(mapCategory("skill")).toEqual({ goalType: "Skill", movementCategory: "Gymnastics" });
  });
});
```

- [ ] **Step 3.2: Run tests, verify they fail**

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx jest src/lib/__tests__/captureReview.test.ts
```

Expected: FAIL — `Cannot find module '../captureReview'`.

- [ ] **Step 3.3: Implement**

Create `mobile/src/lib/captureReview.ts`:

```typescript
// Pure validation of the capture-post AI extraction. Runs BEFORE anything is
// shown or written: the model's output is a proposal, and only names/ids that
// exist in this app survive. Mirrors the fuel-plan doctrine — the model may
// only speak in the vocabulary it was handed.
import type {
  CaptureCategory,
  CaptureSkillLevel,
  ExtractedExercise,
  ExtractedPost,
  ExtractedWorkoutItem,
} from "../types/capture";

const CATEGORIES: CaptureCategory[] = [
  "strength", "conditioning", "mobility", "stretching", "warmup", "skill",
];
const LEVELS: CaptureSkillLevel[] = ["Beginner", "Intermediate", "Advanced"];

export interface ValidVocabulary {
  /** exercises.id values the model was shown as its library index. */
  libraryIds: Set<string>;
  /** muscle_regions.name values. */
  muscles: Set<string>;
  /** equipment.name values. */
  equipment: Set<string>;
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

const names = (v: unknown, valid: Set<string>): string[] =>
  Array.isArray(v) ? v.filter((n): n is string => typeof n === "string" && valid.has(n)) : [];

function sanitizeExercise(raw: unknown, vocab: ValidVocabulary): ExtractedExercise | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name);
  if (!name) return null;

  const category = CATEGORIES.includes(r.category as CaptureCategory)
    ? (r.category as CaptureCategory)
    : "strength";
  // Unknown level defaults DOWN, not to the middle: 8 weeks detrained, the
  // conservative guess is the safe one.
  const skillLevel = LEVELS.includes(r.skill_level as CaptureSkillLevel)
    ? (r.skill_level as CaptureSkillLevel)
    : "Beginner";

  const matchId = str(r.library_match_id);
  return {
    name,
    description: str(r.description),
    category,
    skillLevel,
    primaryMuscles: names(r.primary_muscles, vocab.muscles),
    secondaryMuscles: names(r.secondary_muscles, vocab.muscles),
    equipment: names(r.equipment, vocab.equipment),
    libraryMatchId: matchId && vocab.libraryIds.has(matchId) ? matchId : null,
  };
}

/** Null means "nothing usable" — the sheet shows a retry/manual path. */
export function sanitizeExtraction(raw: unknown, vocab: ValidVocabulary): ExtractedPost | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const exercises = (Array.isArray(r.exercises) ? r.exercises : [])
    .map((e) => sanitizeExercise(e, vocab))
    .filter((e): e is ExtractedExercise => e !== null);
  if (exercises.length === 0) return null;

  let workout: ExtractedPost["workout"] = null;
  if (r.post_type === "full_workout" && typeof r.workout === "object" && r.workout !== null) {
    const w = r.workout as Record<string, unknown>;
    const items: ExtractedWorkoutItem[] = (Array.isArray(w.items) ? w.items : [])
      .map((item): ExtractedWorkoutItem | null => {
        if (typeof item !== "object" || item === null) return null;
        const i = item as Record<string, unknown>;
        const idx = typeof i.exercise_index === "number" ? i.exercise_index : -1;
        if (idx < 0 || idx >= exercises.length) return null;
        return {
          exerciseIndex: idx,
          sets: typeof i.sets === "number" ? i.sets : null,
          reps: str(i.reps),
          restSeconds: typeof i.rest_seconds === "number" ? i.rest_seconds : null,
          notes: str(i.notes),
        };
      })
      .filter((i): i is ExtractedWorkoutItem => i !== null);
    if (items.length > 0) {
      workout = { name: str(w.name) ?? "Captured workout", items };
    }
  }

  return {
    postType: workout ? "full_workout" : "single_exercise",
    exercises,
    workout,
  };
}

/** Where a capture category lands in the EXISTING reference tables.
 *  goal_types: MetCon, Strength, Skill, Mobility, Stretching, Recovery, Cool-Down.
 *  movement_categories: Weightlifting, Gymnastics, Monostructural, Recovery. */
export function mapCategory(category: CaptureCategory): {
  goalType: string;
  movementCategory: string;
} {
  switch (category) {
    case "strength":     return { goalType: "Strength",   movementCategory: "Weightlifting" };
    case "conditioning": return { goalType: "MetCon",     movementCategory: "Monostructural" };
    case "mobility":     return { goalType: "Mobility",   movementCategory: "Recovery" };
    case "stretching":   return { goalType: "Stretching", movementCategory: "Recovery" };
    case "warmup":       return { goalType: "Mobility",   movementCategory: "Recovery" };
    case "skill":        return { goalType: "Skill",      movementCategory: "Gymnastics" };
  }
}
```

- [ ] **Step 3.4: Run tests, verify they pass**

```bash
npx jest src/lib/__tests__/captureReview.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 3.5: Commit**

```bash
cd /Users/brianwilson/code/fittracker
git add mobile/src/lib/captureReview.ts mobile/src/lib/__tests__/captureReview.test.ts
git commit -m "feat(daily): sanitize AI extraction — only known ids and names survive"
```

---

### Task 4: Pure module — catalog filtering (TDD)

**Files:**
- Create: `mobile/src/lib/catalogFilter.ts`
- Test: `mobile/src/lib/__tests__/catalogFilter.test.ts`

- [ ] **Step 4.1: Write the failing tests**

Create `mobile/src/lib/__tests__/catalogFilter.test.ts`:

```typescript
import { filterCatalog } from "../catalogFilter";
import type { CatalogEntry } from "../../types/capture";

const entry = (overrides: Partial<CatalogEntry> = {}): CatalogEntry => ({
  exerciseId: "ex-1",
  name: "Kettlebell RDL",
  skillLevel: "Intermediate",
  equipmentTypes: ["Kettlebell"],
  muscles: [
    { name: "Glutes", isPrimary: true },
    { name: "Hamstrings", isPrimary: false },
  ],
  goalTypes: ["Strength"],
  sources: [
    {
      sourceId: "s-1",
      platform: "instagram",
      sourceUrl: "https://instagram.com/p/abc",
      posterHandle: "@kbcoach",
      thumbnailUrl: null,
      capturedAt: "2026-08-16T00:00:00Z",
    },
  ],
  ...overrides,
});

const none = { muscle: null, equipment: null, category: null, handle: null, search: "" };

describe("filterCatalog", () => {
  it("passes everything through with no filters", () => {
    expect(filterCatalog([entry()], none)).toHaveLength(1);
  });

  it("filters by muscle (primary or secondary)", () => {
    const list = [entry(), entry({ exerciseId: "ex-2", muscles: [{ name: "Chest", isPrimary: true }] })];
    expect(filterCatalog(list, { ...none, muscle: "Hamstrings" }).map((e) => e.exerciseId)).toEqual(["ex-1"]);
  });

  it("filters by equipment", () => {
    const list = [entry(), entry({ exerciseId: "ex-2", equipmentTypes: ["Barbell"] })];
    expect(filterCatalog(list, { ...none, equipment: "Barbell" }).map((e) => e.exerciseId)).toEqual(["ex-2"]);
  });

  it("filters by category (goal type)", () => {
    const list = [entry(), entry({ exerciseId: "ex-2", goalTypes: ["Mobility"] })];
    expect(filterCatalog(list, { ...none, category: "Mobility" }).map((e) => e.exerciseId)).toEqual(["ex-2"]);
  });

  it("filters by poster handle", () => {
    const other = entry({ exerciseId: "ex-2" });
    other.sources = [{ ...other.sources[0], sourceId: "s-2", posterHandle: "@glutegal" }];
    expect(filterCatalog([entry(), other], { ...none, handle: "@glutegal" }).map((e) => e.exerciseId)).toEqual(["ex-2"]);
  });

  it("searches name and handle, case-insensitive", () => {
    const list = [entry(), entry({ exerciseId: "ex-2", name: "Goblet Squat" })];
    expect(filterCatalog(list, { ...none, search: "goblet" }).map((e) => e.exerciseId)).toEqual(["ex-2"]);
    expect(filterCatalog(list, { ...none, search: "KBCOACH" })).toHaveLength(2);
  });

  it("combines filters with AND", () => {
    const list = [
      entry(),
      entry({ exerciseId: "ex-2", equipmentTypes: ["Barbell"] }),
    ];
    expect(filterCatalog(list, { ...none, muscle: "Glutes", equipment: "Kettlebell" }).map((e) => e.exerciseId)).toEqual(["ex-1"]);
  });
});
```

- [ ] **Step 4.2: Run tests, verify they fail**

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx jest src/lib/__tests__/catalogFilter.test.ts
```

Expected: FAIL — `Cannot find module '../catalogFilter'`.

- [ ] **Step 4.3: Implement**

Create `mobile/src/lib/catalogFilter.ts`:

```typescript
// Client-side catalog filtering. The whole captured catalog is one query's
// result (tens to hundreds of rows), so filters run here — instantly, offline,
// and testable — instead of as server round-trips per pill tap.
import type { CatalogEntry, CatalogFilters } from "../types/capture";

export function filterCatalog(entries: CatalogEntry[], f: CatalogFilters): CatalogEntry[] {
  const q = f.search.trim().toLowerCase();
  return entries.filter((e) => {
    if (f.muscle && !e.muscles.some((m) => m.name === f.muscle)) return false;
    if (f.equipment && !e.equipmentTypes.includes(f.equipment)) return false;
    if (f.category && !e.goalTypes.includes(f.category)) return false;
    if (f.handle && !e.sources.some((s) => s.posterHandle === f.handle)) return false;
    if (q) {
      const inName = e.name.toLowerCase().includes(q);
      const inHandle = e.sources.some((s) => s.posterHandle?.toLowerCase().includes(q));
      if (!inName && !inHandle) return false;
    }
    return true;
  });
}

/** Distinct handles present in the catalog, for the handle filter pills. */
export function catalogHandles(entries: CatalogEntry[]): string[] {
  const set = new Set<string>();
  for (const e of entries) {
    for (const s of e.sources) if (s.posterHandle) set.add(s.posterHandle);
  }
  return [...set].sort();
}
```

- [ ] **Step 4.4: Run tests, verify they pass**

```bash
npx jest src/lib/__tests__/catalogFilter.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 4.5: Commit**

```bash
cd /Users/brianwilson/code/fittracker
git add mobile/src/lib/catalogFilter.ts mobile/src/lib/__tests__/catalogFilter.test.ts
git commit -m "feat(daily): client-side catalog filtering"
```

---

### Task 5: Edge function `capture-post`

**Files:**
- Create: `supabase/functions/capture-post/index.ts`

- [ ] **Step 5.1: Write the function**

Create `supabase/functions/capture-post/index.ts`:

```typescript
// Resolve a shared social post, then extract its exercises. Two actions:
//
//   resolve { url }  → { platform, posterHandle, captionText, thumbnailUrl,
//                        needsCaption }
//       TikTok: public oEmbed. Instagram: fetch the page and read OpenGraph
//       tags (best effort — IG's oEmbed requires a Graph API token we don't
//       have). Either way the thumbnail is downloaded HERE and rehosted to
//       the capture-thumbs bucket: a platform CDN URL is exactly the kind
//       that vanishes (same doctrine as dish-image-search).
//       If nothing usable comes back, needsCaption:true — the sheet asks the
//       user to paste the caption, and the capture still works.
//
//   extract { caption, handle, platform, library, muscles, equipment }
//       → the model's structured read of the post. The model may only use
//       muscle/equipment names and library ids given in the request; the
//       client re-validates all of it again (captureReview.ts). SUGGEST ONLY:
//       this function writes no rows, ever.
//
// Model: gpt-5.6-terra — judgement/vision tier, same split as the rest of the app.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY');
const MODEL = 'gpt-5.6-terra';
const BUCKET = 'capture-thumbs';
const UA = 'Mozilla/5.0 (compatible; FitTracker/1.0)';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

type Platform = 'instagram' | 'tiktok' | 'other';

function detectPlatform(url: string): Platform {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host.endsWith('instagram.com')) return 'instagram';
    if (host.endsWith('tiktok.com')) return 'tiktok';
    return 'other';
  } catch {
    return 'other';
  }
}

/** Decode the handful of HTML entities OG tag content actually contains. */
const decodeEntities = (s: string): string =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

function ogTag(html: string, property: string): string | null {
  // content before property and property before content both occur in the wild.
  const a = html.match(
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i'),
  );
  const b = html.match(
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`, 'i'),
  );
  const raw = a?.[1] ?? b?.[1] ?? null;
  return raw ? decodeEntities(raw) : null;
}

/** Download an image and keep our own copy. Returns the copy's public URL,
 *  or null — a missing thumbnail never fails a capture. */
async function rehostThumb(imageUrl: string, userId: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;
    const buffer = new Uint8Array(await res.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > 8 * 1024 * 1024) return null;

    const ext = contentType.includes('png') ? 'png'
      : contentType.includes('webp') ? 'webp'
      : 'jpg';
    const filePath = `${userId}/${Date.now()}.${ext}`;
    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { error } = await service.storage
      .from(BUCKET)
      .upload(filePath, buffer, { contentType, upsert: false });
    if (error) return null;
    return service.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl;
  } catch {
    return null;
  }
}

async function resolveTikTok(url: string) {
  const res = await fetch(
    `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
    { headers: { 'User-Agent': UA } },
  );
  if (!res.ok) return null;
  const data = await res.json();
  const handle = typeof data.author_unique_id === 'string' && data.author_unique_id !== ''
    ? `@${data.author_unique_id}`
    : typeof data.author_name === 'string' && data.author_name !== ''
      ? data.author_name
      : null;
  return {
    posterHandle: handle,
    captionText: typeof data.title === 'string' && data.title.trim() !== '' ? data.title : null,
    thumbSource: typeof data.thumbnail_url === 'string' ? data.thumbnail_url : null,
  };
}

async function resolveInstagram(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const html = await res.text();
  const description = ogTag(html, 'og:description');
  const image = ogTag(html, 'og:image');
  // og:description looks like: `123 likes, 4 comments - handle on August 1,
  // 2026: "the caption"`. Both pieces are best-effort.
  let handle: string | null = null;
  let caption: string | null = null;
  if (description) {
    const m = description.match(/-\s*([A-Za-z0-9_.]+)\s+on\s+.*?:\s*"([\s\S]*)"?$/);
    if (m) {
      handle = `@${m[1]}`;
      caption = m[2]?.trim() || null;
    } else {
      caption = description;
    }
  }
  if (!caption && !image) return null;
  return { posterHandle: handle, captionText: caption, thumbSource: image };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('missing Authorization header');

    // Establish WHO is calling before any storage write — the thumb path is
    // scoped by the verified user id, never by anything the client claims.
    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { data: userData, error: userError } = await anon.auth.getUser(
      authHeader.replace(/^Bearer\s+/i, ''),
    );
    if (userError || !userData?.user) throw new Error('not authenticated');
    const userId = userData.user.id;

    const body = await req.json();

    if (body.action === 'resolve') {
      const url = String(body.url ?? '').trim();
      if (!/^https?:\/\//.test(url)) throw new Error('url must be an http(s) address');
      const platform = detectPlatform(url);

      const meta = platform === 'tiktok'
        ? await resolveTikTok(url)
        : platform === 'instagram'
          ? await resolveInstagram(url)
          : null;

      if (!meta || (!meta.captionText && !meta.posterHandle)) {
        return json({
          platform, posterHandle: meta?.posterHandle ?? null, captionText: null,
          thumbnailUrl: meta?.thumbSource ? await rehostThumb(meta.thumbSource, userId) : null,
          needsCaption: true,
        });
      }

      return json({
        platform,
        posterHandle: meta.posterHandle,
        captionText: meta.captionText,
        thumbnailUrl: meta.thumbSource ? await rehostThumb(meta.thumbSource, userId) : null,
        needsCaption: meta.captionText === null,
      });
    }

    if (body.action === 'extract') {
      if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY is not configured');
      const caption = String(body.caption ?? '').trim();
      if (!caption) throw new Error('caption is required');
      const handle = String(body.handle ?? '').trim() || 'unknown';
      const platform = String(body.platform ?? 'other');
      const library = (Array.isArray(body.library) ? body.library : []) as
        { id: string; name: string }[];
      const muscles = (Array.isArray(body.muscles) ? body.muscles : []) as string[];
      const equipment = (Array.isArray(body.equipment) ? body.equipment : []) as string[];

      const SYSTEM = `You index one social-media fitness post into a personal
exercise catalog. Read the caption and report what exercise(s) the post shows.

Rules:
- Muscle names: use ONLY names from the provided muscle list.
- Equipment: use ONLY names from the provided equipment list.
- If an exercise is the same movement as a library entry, set
  "library_match_id" to that entry's exact id; otherwise null. Same movement
  means same exercise — a variation (deficit, paused, banded) is NOT a match.
- "category": one of strength | conditioning | mobility | stretching | warmup | skill.
- "skill_level": Beginner | Intermediate | Advanced — how hard the movement is
  to perform correctly, not how hard the workout is.
- "post_type": "full_workout" only when the caption lays out multiple
  exercises with a prescription (sets/reps/rounds); then fill "workout" with
  one item per exercise, "exercise_index" pointing into your exercises array.
  Otherwise "single_exercise" and workout: null.
- Names in Title Case, the way a coach would say them. No hashtags.

Respond as JSON:
{"post_type": "single_exercise" | "full_workout",
 "exercises": [{"name": string, "description": string | null,
   "category": string, "skill_level": string,
   "primary_muscles": string[], "secondary_muscles": string[],
   "equipment": string[], "library_match_id": string | null}],
 "workout": {"name": string, "items": [{"exercise_index": number,
   "sets": number | null, "reps": string | null,
   "rest_seconds": number | null, "notes": string | null}]} | null}`;

      const user = [
        `Platform: ${platform}`,
        `Poster: ${handle}`,
        `Caption:\n${caption}`,
        ``,
        `Allowed muscles: ${muscles.join(', ')}`,
        `Allowed equipment: ${equipment.join(', ')}`,
        ``,
        `Library index (id · name):`,
        ...library.map((e) => `${e.id} · ${e.name}`),
      ].join('\n');

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`openai ${res.status}: ${detail.slice(0, 300)}`);
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('empty model response');
      // Parsed here only to fail fast on malformed JSON; the client
      // re-validates every field and id against its own vocabulary.
      return json({ extraction: JSON.parse(content) });
    }

    throw new Error(`unknown action: ${String(body.action)}`);
  } catch (e) {
    console.error('capture-post:', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
```

- [ ] **Step 5.2: Deploy**

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx supabase functions deploy capture-post
```

Expected: `Deployed Function capture-post`. (`OPENAI_API_KEY`, `SUPABASE_*` secrets already exist in the project — the nutrition functions use them.)

- [ ] **Step 5.3: Smoke-test resolve with a real public TikTok post**

Get the anon key and a user JWT the same way you'd debug any function — simplest is temporarily logging `session.access_token` in the app, or use the Supabase CLI:

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx supabase functions list | grep capture-post
```

Then from the app later (Task 8's on-device run covers this end-to-end). If you want a direct probe now and have a JWT:

```bash
curl -s -X POST "$(npx supabase status 2>/dev/null | grep -m1 'API URL' | awk '{print $NF}')/functions/v1/capture-post" \
  -H "Authorization: Bearer $USER_JWT" -H "Content-Type: application/json" \
  -d '{"action":"resolve","url":"https://www.tiktok.com/@thetraininghall/video/7286351109867638049"}'
```

Expected: JSON with `platform: "tiktok"`, a `posterHandle`, `captionText`, and a `thumbnailUrl` pointing at the project's storage domain (or `needsCaption: true` if that particular post is gone — any public TikTok video URL works for this probe). Skip this step if no JWT is at hand; the end-to-end check happens in Task 9.

- [ ] **Step 5.4: Commit**

```bash
cd /Users/brianwilson/code/fittracker
git add supabase/functions/capture-post/index.ts
git commit -m "feat(daily): capture-post edge function — resolve embed + constrained AI extraction"
```

---

### Task 6: Client library `capture.ts`

**Files:**
- Create: `mobile/src/lib/supabase/capture.ts`

- [ ] **Step 6.1: Write the client module**

Create `mobile/src/lib/supabase/capture.ts`:

```typescript
// Client half of capture-post, plus the writes the review sheet commits and
// the catalog read. Save is a SEQUENCE, not a DB transaction (the JS client
// cannot open one): the source row goes first as 'pending', children follow,
// and 'reviewed' is stamped last — so a failure partway leaves a retryable
// pending source, never a half-visible catalog entry.
import { supabase } from "../supabase";
import { createExercise, fetchGoalTypes, fetchMovementCategories } from "./crossfit";
import { mapCategory } from "../captureReview";
import type {
  CatalogEntry,
  ExtractedPost,
  ResolvedPost,
} from "../../types/capture";

export async function resolvePost(url: string): Promise<ResolvedPost | null> {
  try {
    const { data, error } = await supabase.functions.invoke("capture-post", {
      body: { action: "resolve", url },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data as ResolvedPost;
  } catch (e) {
    console.error("capture resolve failed:", e);
    return null;
  }
}

/** Raw extraction — sanitize with captureReview.sanitizeExtraction before use. */
export async function extractPost(input: {
  caption: string;
  handle: string | null;
  platform: string;
  library: { id: string; name: string }[];
  muscles: string[];
  equipment: string[];
}): Promise<unknown | null> {
  try {
    const { data, error } = await supabase.functions.invoke("capture-post", {
      body: {
        action: "extract",
        caption: input.caption,
        handle: input.handle ?? "",
        platform: input.platform,
        library: input.library,
        muscles: input.muscles,
        equipment: input.equipment,
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data?.extraction ?? null;
  } catch (e) {
    console.error("capture extract failed:", e);
    return null;
  }
}

/** A capture of this URL already reviewed by this user, if any. */
export async function findExistingCapture(
  userId: string,
  sourceUrl: string,
): Promise<{ id: string; extraction_status: string } | null> {
  const { data, error } = await supabase
    .from("captured_sources")
    .select("id, extraction_status")
    .eq("user_id", userId)
    .eq("source_url", sourceUrl)
    .maybeSingle();
  if (error) {
    console.error("existing capture lookup failed:", error);
    return null;
  }
  return data;
}

export interface SaveCaptureInput {
  userId: string;
  sourceUrl: string;
  platform: string;
  posterHandle: string | null;
  captionText: string | null;
  thumbnailUrl: string | null;
  rawExtraction: unknown;
  /** The reviewed (user-edited) extraction to persist. */
  post: ExtractedPost;
}

/** Commit an accepted review. Returns the source id, or null on failure. */
export async function saveCapture(input: SaveCaptureInput): Promise<string | null> {
  try {
    // Name→id maps for the reference tables createExercise needs.
    const [goalTypes, movementCategories] = await Promise.all([
      fetchGoalTypes(),
      fetchMovementCategories(),
    ]);
    const goalIdByName = new Map(goalTypes.map((g) => [g.name, g.id]));
    const mcIdByName = new Map(movementCategories.map((m) => [m.name, m.id]));

    // Muscle name→id map.
    const { data: muscleRows, error: muscleError } = await supabase
      .from("muscle_regions")
      .select("id, name");
    if (muscleError) throw muscleError;
    const muscleIdByName = new Map((muscleRows ?? []).map((m) => [m.name, m.id]));

    // 1. The source row, pending until everything under it lands.
    const { data: source, error: sourceError } = await supabase
      .from("captured_sources")
      .insert({
        user_id: input.userId,
        platform: input.platform,
        source_url: input.sourceUrl,
        poster_handle: input.posterHandle,
        caption_text: input.captionText,
        thumbnail_url: input.thumbnailUrl,
        raw_extraction: input.rawExtraction ?? null,
        extraction_status: "pending",
      })
      .select("id")
      .single();
    if (sourceError) throw sourceError;
    const sourceId = source.id as string;

    // 2. Each exercise: link the matched library entry, or create a new one
    //    through the SAME path the Add Exercise wizard uses.
    const exerciseIds: string[] = [];
    for (const ex of input.post.exercises) {
      let exerciseId = ex.libraryMatchId;
      if (!exerciseId) {
        const { goalType, movementCategory } = mapCategory(ex.category);
        const movementCategoryId = mcIdByName.get(movementCategory);
        if (!movementCategoryId) throw new Error(`unknown movement category: ${movementCategory}`);
        const goalTypeId = goalIdByName.get(goalType);
        const muscleIds = [...ex.primaryMuscles, ...ex.secondaryMuscles]
          .map((n) => muscleIdByName.get(n))
          .filter((id): id is string => !!id);
        const primaryIds = ex.primaryMuscles
          .map((n) => muscleIdByName.get(n))
          .filter((id): id is string => !!id);

        exerciseId = await createExercise({
          name: ex.name,
          description: ex.description ?? undefined,
          movement_category_id: movementCategoryId,
          goal_type_ids: goalTypeId ? [goalTypeId] : [],
          skill_level: ex.skillLevel,
          equipment_types: ex.equipment,
          muscle_region_ids: muscleIds,
          primary_muscle_region_ids: primaryIds,
          is_movement: false,
          is_official: false,
          created_by: input.userId,
        });
      }
      exerciseIds.push(exerciseId);

      const { error: linkError } = await supabase.from("source_exercises").insert({
        source_id: sourceId,
        exercise_id: exerciseId,
        was_created: !ex.libraryMatchId,
      });
      if (linkError) throw linkError;
    }

    // 3. Full workout: preserve the creator's programming.
    if (input.post.workout) {
      const { data: workout, error: workoutError } = await supabase
        .from("captured_workouts")
        .insert({
          source_id: sourceId,
          user_id: input.userId,
          name: input.post.workout.name,
        })
        .select("id")
        .single();
      if (workoutError) throw workoutError;

      const items = input.post.workout.items.map((item, i) => ({
        captured_workout_id: workout.id,
        exercise_id: exerciseIds[item.exerciseIndex],
        exercise_order: i,
        target_sets: item.sets,
        target_reps: item.reps,
        rest_seconds: item.restSeconds,
        notes: item.notes,
      }));
      const { error: itemsError } = await supabase
        .from("captured_workout_exercises")
        .insert(items);
      if (itemsError) throw itemsError;
    }

    // 4. Only now is the capture real.
    const { error: doneError } = await supabase
      .from("captured_sources")
      .update({ extraction_status: "reviewed" })
      .eq("id", sourceId);
    if (doneError) throw doneError;

    return sourceId;
  } catch (e) {
    console.error("saveCapture failed:", e);
    return null;
  }
}

/** Every captured exercise with taxonomy + provenance, newest capture first. */
export async function fetchCatalog(userId: string): Promise<CatalogEntry[]> {
  const { data, error } = await supabase
    .from("exercises")
    .select(`
      id, name, skill_level, equipment_types,
      muscle_regions:exercise_muscle_regions(is_primary, muscle_region:muscle_regions(name)),
      goal_types:exercise_goal_types(goal_type:goal_types(name)),
      sources:source_exercises!inner(
        source:captured_sources!inner(
          id, user_id, platform, source_url, poster_handle, thumbnail_url,
          captured_at, extraction_status
        )
      )
    `);
  if (error) {
    console.error("fetchCatalog failed:", error);
    return [];
  }

  const entries: CatalogEntry[] = (data ?? []).map((row: any) => ({
    exerciseId: row.id,
    name: row.name,
    skillLevel: row.skill_level ?? null,
    equipmentTypes: row.equipment_types ?? [],
    muscles: (row.muscle_regions ?? []).map((m: any) => ({
      name: m.muscle_region?.name ?? "",
      isPrimary: !!m.is_primary,
    })),
    goalTypes: (row.goal_types ?? []).map((g: any) => g.goal_type?.name ?? ""),
    sources: (row.sources ?? [])
      .map((s: any) => s.source)
      // RLS already scopes captured_sources to the caller; the filters here
      // drop other users' links to a shared library exercise and any capture
      // whose save never completed.
      .filter((s: any) => s && s.user_id === userId && s.extraction_status === "reviewed")
      .map((s: any) => ({
        sourceId: s.id,
        platform: s.platform,
        sourceUrl: s.source_url,
        posterHandle: s.poster_handle,
        thumbnailUrl: s.thumbnail_url,
        capturedAt: s.captured_at,
      })),
  }));

  return entries
    .filter((e) => e.sources.length > 0)
    .sort((a, b) => (a.sources[0].capturedAt < b.sources[0].capturedAt ? 1 : -1));
}
```

- [ ] **Step 6.2: Typecheck**

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx tsc --noEmit
```

Expected: exits with no NEW errors. (`createExercise`'s input type marks `is_official: false` and `created_by` required — they're provided.) Remember: tsc cannot vouch for the embedded select string; Task 9's device run is the real verification.

- [ ] **Step 6.3: Commit**

```bash
cd /Users/brianwilson/code/fittracker
git add mobile/src/lib/supabase/capture.ts
git commit -m "feat(daily): capture client — resolve/extract/save/catalog queries"
```

---

### Task 7: Capture + review sheets

**Files:**
- Create: `mobile/src/components/training/daily/CaptureSheet.tsx`
- Create: `mobile/src/components/training/daily/CaptureReviewSheet.tsx`

Both are bottom sheets (`Modal` + `animationType="slide"` + `presentationStyle="pageSheet"`), per the standing no-inline-pickers rule. Colors come from `@/src/lib/colors` (`colors.background`, `colors.foreground`, `colors.mutedForeground`, `colors.muted`, `colors.border`, `colors.input`, `colors.primary` — the same keys the Training screens use).

- [ ] **Step 7.1: Write CaptureSheet**

Create `mobile/src/components/training/daily/CaptureSheet.tsx`:

```tsx
import React, { useState } from "react";
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { X, Link as LinkIcon } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { resolvePost, extractPost, findExistingCapture } from "@/src/lib/supabase/capture";
import { sanitizeExtraction } from "@/src/lib/captureReview";
import { fetchAllExercises } from "@/src/lib/supabase/crossfit";
import type { ExtractedPost, ResolvedPost } from "@/src/types/capture";

interface CaptureSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Hands a sanitized extraction to the review sheet. rawExtraction is the
   *  unsanitized model output, persisted for audit. */
  onExtracted: (payload: {
    resolved: ResolvedPost;
    sourceUrl: string;
    post: ExtractedPost;
    rawExtraction: unknown;
  }) => void;
}

type Phase = "url" | "resolving" | "caption" | "extracting";

export function CaptureSheet({ visible, onClose, onExtracted }: CaptureSheetProps) {
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [phase, setPhase] = useState<Phase>("url");
  const [resolved, setResolved] = useState<ResolvedPost | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const reset = () => {
    setUrl(""); setCaption(""); setPhase("url"); setResolved(null); setErrorText(null);
  };
  const close = () => { reset(); onClose(); };

  const runExtract = async (r: ResolvedPost, captionText: string) => {
    setPhase("extracting");
    setErrorText(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not signed in");

      // The model's whole vocabulary: library index + reference-table names.
      const [library, muscleRows, equipmentRows] = await Promise.all([
        fetchAllExercises(),
        supabase.from("muscle_regions").select("name"),
        supabase.from("equipment").select("name"),
      ]);
      const muscles = (muscleRows.data ?? []).map((m) => m.name as string);
      const equipment = (equipmentRows.data ?? []).map((e) => e.name as string);
      const index = library.map((e) => ({ id: e.id, name: e.name }));

      const raw = await extractPost({
        caption: captionText,
        handle: r.posterHandle,
        platform: r.platform,
        library: index,
        muscles,
        equipment,
      });
      const post = sanitizeExtraction(raw, {
        libraryIds: new Set(index.map((e) => e.id)),
        muscles: new Set(muscles),
        equipment: new Set(equipment),
      });
      if (!post) {
        setErrorText("Couldn't read any exercises out of that caption. Add detail and try again.");
        setPhase("caption");
        setCaption(captionText);
        return;
      }
      const payload = { resolved: r, sourceUrl: url.trim(), post, rawExtraction: raw };
      reset();
      onExtracted(payload);
    } catch (e) {
      console.error("extract flow failed:", e);
      setErrorText("Extraction failed. Check your connection and try again.");
      setPhase(r.captionText ? "url" : "caption");
    }
  };

  const handleSubmitUrl = async () => {
    const trimmed = url.trim();
    if (!/^https?:\/\//.test(trimmed)) {
      setErrorText("Paste a full link, starting with https://");
      return;
    }
    setPhase("resolving");
    setErrorText(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const existing = await findExistingCapture(user.id, trimmed);
      if (existing?.extraction_status === "reviewed") {
        setErrorText("Already captured — it's in your catalog.");
        setPhase("url");
        return;
      }
    }

    const r = await resolvePost(trimmed);
    if (!r) {
      setErrorText("Couldn't reach that post. Check the link and try again.");
      setPhase("url");
      return;
    }
    setResolved(r);
    if (r.needsCaption || !r.captionText) {
      setPhase("caption");
    } else {
      await runExtract(r, r.captionText);
    }
  };

  const handleSubmitCaption = async () => {
    if (!resolved) return;
    if (caption.trim().length < 8) {
      setErrorText("Paste the post's caption (or describe the exercise) first.");
      return;
    }
    await runExtract({ ...resolved, captionText: caption.trim() }, caption.trim());
  };

  const busy = phase === "resolving" || phase === "extracting";

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Capture from social</Text>
          <TouchableOpacity onPress={close} disabled={busy}>
            <X size={24} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {phase !== "caption" ? (
          <>
            <Text style={styles.label}>Post link</Text>
            <View style={styles.inputRow}>
              <LinkIcon size={18} color={colors.mutedForeground} />
              <TextInput
                style={styles.input}
                placeholder="https://www.tiktok.com/@…"
                placeholderTextColor={colors.mutedForeground}
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={!busy}
              />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.label}>
              {resolved?.platform === "instagram"
                ? "Instagram didn't share the caption — paste it here"
                : "Paste the post's caption"}
            </Text>
            <TextInput
              style={[styles.input, styles.captionInput]}
              placeholder="Paste the caption, or describe the exercise(s)…"
              placeholderTextColor={colors.mutedForeground}
              value={caption}
              onChangeText={setCaption}
              multiline
              editable={!busy}
            />
          </>
        )}

        {errorText && <Text style={styles.error}>{errorText}</Text>}

        <TouchableOpacity
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={phase === "caption" ? handleSubmitCaption : handleSubmitUrl}
          disabled={busy}
          activeOpacity={0.8}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>
              {phase === "caption" ? "Extract exercises" : "Fetch post"}
            </Text>
          )}
        </TouchableOpacity>
        {phase === "extracting" && (
          <Text style={styles.hint}>Reading the post…</Text>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: 24,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.foreground },
  label: { fontSize: 14, color: colors.mutedForeground, marginBottom: 8 },
  inputRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.input, borderRadius: 8, paddingHorizontal: 12,
  },
  input: { flex: 1, fontSize: 16, color: colors.foreground, paddingVertical: 12 },
  captionInput: {
    backgroundColor: colors.input, borderRadius: 8, paddingHorizontal: 12,
    minHeight: 120, textAlignVertical: "top",
  },
  error: { color: "#F87171", fontSize: 14, marginTop: 12 },
  button: {
    backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14,
    alignItems: "center", marginTop: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  hint: { color: colors.mutedForeground, fontSize: 13, textAlign: "center", marginTop: 12 },
});
```

- [ ] **Step 7.2: Write CaptureReviewSheet**

Create `mobile/src/components/training/daily/CaptureReviewSheet.tsx`:

```tsx
import React, { useState } from "react";
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
} from "react-native";
import { X, Link2, Link2Off } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { saveCapture } from "@/src/lib/supabase/capture";
import type {
  CaptureCategory, CaptureSkillLevel, ExtractedPost, ResolvedPost,
} from "@/src/types/capture";

const CATEGORIES: CaptureCategory[] = [
  "strength", "conditioning", "mobility", "stretching", "warmup", "skill",
];
const LEVELS: CaptureSkillLevel[] = ["Beginner", "Intermediate", "Advanced"];

interface CaptureReviewSheetProps {
  visible: boolean;
  payload: {
    resolved: ResolvedPost;
    sourceUrl: string;
    post: ExtractedPost;
    rawExtraction: unknown;
  } | null;
  /** Name of the matched library exercise per index, for the link chip. */
  matchNames: Map<string, string>;
  onClose: () => void;
  onSaved: () => void;
}

export function CaptureReviewSheet({
  visible, payload, matchNames, onClose, onSaved,
}: CaptureReviewSheetProps) {
  // Editable copy of the extraction. Re-seeded each time a new payload opens.
  const [post, setPost] = useState<ExtractedPost | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  if (visible && payload && seededFor !== payload.sourceUrl) {
    setPost(JSON.parse(JSON.stringify(payload.post)));
    setSeededFor(payload.sourceUrl);
    setErrorText(null);
  }

  if (!payload || !post) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={styles.container} />
      </Modal>
    );
  }

  const patchExercise = (i: number, patch: Partial<ExtractedPost["exercises"][number]>) => {
    setPost((p) => {
      if (!p) return p;
      const next = { ...p, exercises: [...p.exercises] };
      next.exercises[i] = { ...next.exercises[i], ...patch };
      return next;
    });
  };

  const handleAccept = async () => {
    setSaving(true);
    setErrorText(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setErrorText("Not signed in.");
      setSaving(false);
      return;
    }
    const sourceId = await saveCapture({
      userId: user.id,
      sourceUrl: payload.sourceUrl,
      platform: payload.resolved.platform,
      posterHandle: payload.resolved.posterHandle,
      captionText: payload.resolved.captionText,
      thumbnailUrl: payload.resolved.thumbnailUrl,
      rawExtraction: payload.rawExtraction,
      post,
    });
    setSaving(false);
    if (!sourceId) {
      setErrorText("Save failed. Nothing was added — try again.");
      return;
    }
    setSeededFor(null);
    onSaved();
  };

  const close = () => { setSeededFor(null); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>
              {post.postType === "full_workout" ? "Workout found" : "Exercise found"}
            </Text>
            {payload.resolved.posterHandle && (
              <Text style={styles.subtitle}>from {payload.resolved.posterHandle}</Text>
            )}
          </View>
          <TouchableOpacity onPress={close} disabled={saving}>
            <X size={24} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 24 }}>
          {post.exercises.map((ex, i) => (
            <View key={i} style={styles.card}>
              <TextInput
                style={styles.nameInput}
                value={ex.name}
                onChangeText={(t) => patchExercise(i, { name: t })}
              />

              {ex.libraryMatchId ? (
                <TouchableOpacity
                  style={styles.matchChip}
                  onPress={() => patchExercise(i, { libraryMatchId: null })}
                  activeOpacity={0.7}
                >
                  <Link2 size={14} color={colors.primary} />
                  <Text style={styles.matchText}>
                    Matches “{matchNames.get(ex.libraryMatchId) ?? "library exercise"}” — tap to create new instead
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.newChip}>
                  <Link2Off size={14} color={colors.mutedForeground} />
                  <Text style={styles.newText}>New library entry</Text>
                </View>
              )}

              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.pillRow}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.pill, ex.category === c && styles.pillActive]}
                    onPress={() => patchExercise(i, { category: c })}
                  >
                    <Text style={[styles.pillText, ex.category === c && styles.pillTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Skill level</Text>
              <View style={styles.pillRow}>
                {LEVELS.map((l) => (
                  <TouchableOpacity
                    key={l}
                    style={[styles.pill, ex.skillLevel === l && styles.pillActive]}
                    onPress={() => patchExercise(i, { skillLevel: l })}
                  >
                    <Text style={[styles.pillText, ex.skillLevel === l && styles.pillTextActive]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {(ex.primaryMuscles.length > 0 || ex.secondaryMuscles.length > 0) && (
                <>
                  <Text style={styles.fieldLabel}>Muscles (tap to remove)</Text>
                  <View style={styles.pillRow}>
                    {ex.primaryMuscles.map((m) => (
                      <TouchableOpacity
                        key={`p-${m}`}
                        style={[styles.pill, styles.pillActive]}
                        onPress={() =>
                          patchExercise(i, { primaryMuscles: ex.primaryMuscles.filter((x) => x !== m) })
                        }
                      >
                        <Text style={styles.pillTextActive}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                    {ex.secondaryMuscles.map((m) => (
                      <TouchableOpacity
                        key={`s-${m}`}
                        style={styles.pill}
                        onPress={() =>
                          patchExercise(i, { secondaryMuscles: ex.secondaryMuscles.filter((x) => x !== m) })
                        }
                      >
                        <Text style={styles.pillText}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {ex.equipment.length > 0 && (
                <>
                  <Text style={styles.fieldLabel}>Equipment (tap to remove)</Text>
                  <View style={styles.pillRow}>
                    {ex.equipment.map((eq) => (
                      <TouchableOpacity
                        key={eq}
                        style={styles.pill}
                        onPress={() =>
                          patchExercise(i, { equipment: ex.equipment.filter((x) => x !== eq) })
                        }
                      >
                        <Text style={styles.pillText}>{eq}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </View>
          ))}

          {post.workout && (
            <View style={styles.card}>
              <Text style={styles.workoutTitle}>Saved as workout: {post.workout.name}</Text>
              {post.workout.items.map((item, i) => (
                <Text key={i} style={styles.workoutItem}>
                  {post.exercises[item.exerciseIndex]?.name}
                  {item.sets ? ` — ${item.sets}×${item.reps ?? "?"}` : ""}
                  {item.restSeconds ? `, rest ${item.restSeconds}s` : ""}
                </Text>
              ))}
            </View>
          )}
        </ScrollView>

        {errorText && <Text style={styles.error}>{errorText}</Text>}

        <TouchableOpacity
          style={[styles.button, saving && { opacity: 0.6 }]}
          onPress={handleAccept}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>
              Add to catalog{post.exercises.length > 1 ? ` (${post.exercises.length} exercises)` : ""}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.foreground },
  subtitle: { fontSize: 14, color: colors.mutedForeground, marginTop: 2 },
  scroll: { flex: 1 },
  card: {
    backgroundColor: colors.muted, borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  nameInput: {
    fontSize: 17, fontWeight: "600", color: colors.foreground,
    borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6,
    marginBottom: 10,
  },
  matchChip: {
    flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10,
  },
  matchText: { fontSize: 13, color: colors.primary, flexShrink: 1 },
  newChip: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  newText: { fontSize: 13, color: colors.mutedForeground },
  fieldLabel: { fontSize: 12, color: colors.mutedForeground, marginTop: 8, marginBottom: 6 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
    backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: 12, color: colors.mutedForeground },
  pillTextActive: { fontSize: 12, color: "#FFFFFF", fontWeight: "600" },
  workoutTitle: { fontSize: 15, fontWeight: "600", color: colors.foreground, marginBottom: 8 },
  workoutItem: { fontSize: 13, color: colors.mutedForeground, marginBottom: 4 },
  error: { color: "#F87171", fontSize: 14, marginBottom: 8 },
  button: {
    backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
});
```

- [ ] **Step 7.3: Typecheck and commit**

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx tsc --noEmit
cd /Users/brianwilson/code/fittracker
git add mobile/src/components/training/daily/CaptureSheet.tsx mobile/src/components/training/daily/CaptureReviewSheet.tsx
git commit -m "feat(daily): capture and review bottom sheets"
```

---

### Task 8: Catalog tab + placeholders

**Files:**
- Create: `mobile/src/components/training/daily/CatalogTab.tsx`
- Create: `mobile/src/components/training/daily/TodayTab.tsx`
- Create: `mobile/src/components/training/daily/GymsTab.tsx`

- [ ] **Step 8.1: Write CatalogTab**

Create `mobile/src/components/training/daily/CatalogTab.tsx`:

```tsx
import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Linking, Image,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Plus, ExternalLink } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { fetchCatalog } from "@/src/lib/supabase/capture";
import { fetchAllExercises } from "@/src/lib/supabase/crossfit";
import { filterCatalog, catalogHandles } from "@/src/lib/catalogFilter";
import { CaptureSheet } from "./CaptureSheet";
import { CaptureReviewSheet } from "./CaptureReviewSheet";
import type { CatalogEntry, CatalogFilters, ExtractedPost, ResolvedPost } from "@/src/types/capture";

// One pill rail per filter axis. Muscles/equipment/categories are derived
// from the loaded catalog so the rails only offer values that select something.
const axisValues = (entries: CatalogEntry[]) => ({
  muscles: [...new Set(entries.flatMap((e) => e.muscles.map((m) => m.name)))].sort(),
  equipment: [...new Set(entries.flatMap((e) => e.equipmentTypes))].sort(),
  categories: [...new Set(entries.flatMap((e) => e.goalTypes))].sort(),
  handles: catalogHandles(entries),
});

interface CatalogTabProps {
  searchQuery: string;
  onCountUpdate: (count: number) => void;
}

export default function CatalogTab({ searchQuery, onCountUpdate }: CatalogTabProps) {
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<Omit<CatalogFilters, "search">>({
    muscle: null, equipment: null, category: null, handle: null,
  });
  const [captureVisible, setCaptureVisible] = useState(false);
  const [reviewPayload, setReviewPayload] = useState<{
    resolved: ResolvedPost; sourceUrl: string; post: ExtractedPost; rawExtraction: unknown;
  } | null>(null);
  const [matchNames, setMatchNames] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const list = await fetchCatalog(user.id);
    setEntries(list);
    onCountUpdate(list.length);
    setLoading(false);
  }, [onCountUpdate]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleExtracted = async (payload: {
    resolved: ResolvedPost; sourceUrl: string; post: ExtractedPost; rawExtraction: unknown;
  }) => {
    // Names for the "matches X" chips in review.
    const library = await fetchAllExercises();
    setMatchNames(new Map(library.map((e) => [e.id, e.name])));
    setCaptureVisible(false);
    setReviewPayload(payload);
  };

  const axes = useMemo(() => axisValues(entries), [entries]);
  const filtered = useMemo(
    () => filterCatalog(entries, { ...filters, search: searchQuery }),
    [entries, filters, searchQuery],
  );

  const toggle = (axis: keyof typeof filters, value: string) =>
    setFilters((f) => ({ ...f, [axis]: f[axis] === value ? null : value }));

  const rail = (label: string, axis: keyof typeof filters, values: string[]) =>
    values.length > 0 && (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        <Text style={styles.railLabel}>{label}</Text>
        {values.map((v) => (
          <TouchableOpacity
            key={v}
            style={[styles.pill, filters[axis] === v && styles.pillActive]}
            onPress={() => toggle(axis, v)}
          >
            <Text style={[styles.pillText, filters[axis] === v && styles.pillTextActive]}>{v}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );

  return (
    <View style={styles.container}>
      <View style={styles.railBlock}>
        {rail("Muscle", "muscle", axes.muscles)}
        {rail("Equipment", "equipment", axes.equipment)}
        {rail("Type", "category", axes.categories)}
        {rail("From", "handle", axes.handles)}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.exerciseId}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
              tintColor={colors.primary} colors={[colors.primary]} />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              {item.sources[0]?.thumbnailUrl && (
                <Image source={{ uri: item.sources[0].thumbnailUrl }} style={styles.thumb} />
              )}
              <View style={styles.cardBody}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardMeta}>
                  {[
                    item.skillLevel,
                    item.muscles.filter((m) => m.isPrimary).map((m) => m.name).join(", ") || null,
                    item.equipmentTypes.join(", ") || "no equipment",
                  ].filter(Boolean).join(" · ")}
                </Text>
                {item.sources[0] && (
                  <TouchableOpacity
                    style={styles.sourceRow}
                    onPress={() => Linking.openURL(item.sources[0].sourceUrl)}
                    activeOpacity={0.7}
                  >
                    <ExternalLink size={13} color={colors.primary} />
                    <Text style={styles.sourceText}>
                      {item.sources[0].posterHandle ?? item.sources[0].platform}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {entries.length === 0 ? "Nothing captured yet" : "No matches"}
              </Text>
              <Text style={styles.emptyText}>
                {entries.length === 0
                  ? "See an exercise on Instagram or TikTok? Paste its link here with the + button."
                  : "Clear a filter or change the search."}
              </Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setCaptureVisible(true)} activeOpacity={0.8}>
        <Plus size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <CaptureSheet
        visible={captureVisible}
        onClose={() => setCaptureVisible(false)}
        onExtracted={handleExtracted}
      />
      <CaptureReviewSheet
        visible={reviewPayload !== null}
        payload={reviewPayload}
        matchNames={matchNames}
        onClose={() => setReviewPayload(null)}
        onSaved={() => { setReviewPayload(null); load(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  railBlock: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6 },
  rail: { paddingHorizontal: 16, gap: 6, alignItems: "center", paddingVertical: 4 },
  railLabel: { fontSize: 11, color: colors.mutedForeground, marginRight: 4, textTransform: "uppercase" },
  pill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: 13, color: colors.mutedForeground },
  pillTextActive: { color: "#FFFFFF", fontWeight: "600" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: { padding: 16, gap: 12 },
  card: {
    flexDirection: "row", backgroundColor: colors.muted, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: 12,
  },
  thumb: { width: 72, height: 72 },
  cardBody: { flex: 1, padding: 12 },
  cardName: { fontSize: 16, fontWeight: "600", color: colors.foreground },
  cardMeta: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  sourceText: { fontSize: 13, color: colors.primary },
  empty: { padding: 40, alignItems: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "bold", color: colors.foreground, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
  fab: {
    position: "absolute", right: 20, bottom: 20, width: 56, height: 56,
    borderRadius: 28, backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
});
```

- [ ] **Step 8.2: Write the two placeholders**

Create `mobile/src/components/training/daily/TodayTab.tsx`:

```tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/lib/colors";

export default function TodayTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Today's session</Text>
      <Text style={styles.text}>
        The daily recommender arrives in Phase 2. Start capturing exercises in
        the Catalog tab — everything you save becomes raw material for it.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "bold", color: colors.foreground, marginBottom: 8 },
  text: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
});
```

Create `mobile/src/components/training/daily/GymsTab.tsx`:

```tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/lib/colors";

export default function GymsTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Gyms</Text>
      <Text style={styles.text}>
        Gym equipment profiles arrive in Phase 2 — set what each gym has, and
        the recommender only programs what you can actually do there.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "bold", color: colors.foreground, marginBottom: 8 },
  text: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
});
```

- [ ] **Step 8.3: Typecheck and commit**

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx tsc --noEmit
cd /Users/brianwilson/code/fittracker
git add mobile/src/components/training/daily/
git commit -m "feat(daily): catalog tab with filter rails, today/gyms placeholders"
```

---

### Task 9: Wire the Daily mode into the Training screen

**Files:**
- Modify: `mobile/app/(tabs)/training/index.tsx`

- [ ] **Step 9.1: Add the third mode**

Apply these edits to `mobile/app/(tabs)/training/index.tsx` (line numbers per current file):

1. Imports (line 4 area) — add `Flame` to the lucide import and import the new tabs:

```tsx
import { Dumbbell, Flame, Search, X } from "lucide-react-native";
import CatalogTab from "@/src/components/training/daily/CatalogTab";
import TodayTab from "@/src/components/training/daily/TodayTab";
import GymsTab from "@/src/components/training/daily/GymsTab";
```

2. Types (lines 16–18) — extend:

```tsx
type WorkoutMode = "crossfit" | "strength" | "daily";
type CrossFitTab = "classes" | "wods" | "movements";
type StrengthTab = "programs" | "workouts" | "exercises";
type DailyTab = "today" | "catalog" | "gyms";
```

3. State (after line 23):

```tsx
const [dailyTab, setDailyTab] = useState<DailyTab>("catalog");
const [catalogCount, setCatalogCount] = useState(0);
```

4. Tab definitions (after the `strengthTabs` array, line 88):

```tsx
const dailyTabs: { key: DailyTab; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "catalog", label: "Catalog" },
  { key: "gyms", label: "Gyms" },
];
```

5. Mode handlers (after line 96):

```tsx
const handleDailyPress = () => {
  setWorkoutMode("daily");
};
```

6. `renderTabContent` — make the top-level branch three-way. Replace the `if (workoutMode === "crossfit") { … } else { … }` structure so the strength branch becomes `else if (workoutMode === "strength")`, and append:

```tsx
} else {
  switch (dailyTab) {
    case "today":
      return <TodayTab />;
    case "catalog":
      return <CatalogTab searchQuery={searchQuery} onCountUpdate={setCatalogCount} />;
    case "gyms":
      return <GymsTab />;
    default:
      return null;
  }
}
```

7. `getSearchPlaceholder` — same three-way restructure; the daily branch:

```tsx
} else {
  return dailyTab === "catalog" ? "Search catalog..." : "Search...";
}
```

8. Header buttons (after the strength `TouchableOpacity`, line 179):

```tsx
<TouchableOpacity onPress={handleDailyPress} activeOpacity={0.7} style={styles.iconButton}>
  <Flame size={24} color={colors.primary} strokeWidth={2} />
</TouchableOpacity>
```

9. Tab bar — the JSX currently ternaries `workoutMode === "crossfit" ? crossfitTabs.map(…) : strengthTabs.map(…)`. Extend to:

```tsx
{workoutMode === "crossfit" ? (
  /* existing crossfitTabs.map block, unchanged */
) : workoutMode === "strength" ? (
  /* existing strengthTabs.map block, unchanged */
) : (
  dailyTabs.map((tab) => {
    const count = tab.key === "catalog" ? catalogCount : 0;
    return (
      <TouchableOpacity
        key={tab.key}
        style={[styles.tab, dailyTab === tab.key && styles.tabActive]}
        onPress={() => setDailyTab(tab.key)}
      >
        <View style={styles.tabContent}>
          <Text style={[styles.tabText, dailyTab === tab.key && styles.tabTextActive]}>
            {tab.label}
          </Text>
          {tab.key === "catalog" && (
            <View style={[styles.countChip, dailyTab === tab.key && styles.countChipActive]}>
              <Text style={[styles.countText, dailyTab === tab.key && styles.countTextActive]}>
                {count}
              </Text>
            </View>
          )}
        </View>
        {dailyTab === tab.key && <View style={styles.tabIndicator} />}
      </TouchableOpacity>
    );
  })
)}
```

- [ ] **Step 9.2: Typecheck, lint, full test run**

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx tsc --noEmit
npm run lint
npm test
```

Expected: no new tsc errors, lint clean on the new files, all Jest suites pass (including the two new ones).

- [ ] **Step 9.3: Commit**

```bash
cd /Users/brianwilson/code/fittracker
git add "mobile/app/(tabs)/training/index.tsx"
git commit -m "feat(daily): third training mode — Today / Catalog / Gyms"
```

---

### Task 10: End-to-end on-device verification

No new files. This is the step that actually validates the untyped Supabase queries and the edge function together.

- [ ] **Step 10.1: Launch on a dedicated simulator**

Per the standing simulator-isolation rule: boot a NEW simulator instance and a unique Metro port so the user's own Expo sessions aren't disturbed. Use the iOS Simulator MCP tools (`attach` first, then build/launch), with Metro on a non-default port, e.g.:

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx expo start --dev-client --port 8090
```

- [ ] **Step 10.2: Walk the capture loop**

1. Training tab → flame icon → Daily mode shows Today / Catalog / Gyms; Catalog is active with the empty state.
2. Tap the + FAB → paste a real public TikTok fitness post URL → Fetch post.
3. Expect the review sheet with at least one exercise, tags populated. Edit the name; toggle a pill.
4. Tap "Add to catalog" → sheet closes → the entry appears in the list with thumbnail, meta line, and source link.
5. Tap the source link → the post opens in the browser/app.
6. Filter rails: tap the muscle pill for the captured exercise → the list narrows; tap again → clears. Repeat for equipment and From (handle).
7. Search box: type part of the exercise name → narrows; type the handle → matches too.
8. Paste the SAME URL again in a new capture → expect "Already captured — it's in your catalog."
9. Paste an Instagram post URL → if IG blocks metadata, expect the caption fallback screen; paste a caption → extraction proceeds.
10. Kill network (simulator airplane mode), attempt a capture → expect the clean error, no crash, nothing written.
11. Strength → Exercises tab: the captured exercise ALSO appears in the unified library list (merge-into-library requirement).

- [ ] **Step 10.3: Verify the rows**

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx supabase db dump --data-only --schema public 2>/dev/null | grep -A2 "COPY public.captured_sources" | head -10
```

Or query via the app's logs. Expected: one `captured_sources` row per accepted capture with `extraction_status = 'reviewed'`, junction rows in `source_exercises`, and — for a workout post — `captured_workouts` + items.

- [ ] **Step 10.4: Report**

Do NOT merge to main. Stop and show the user: what was captured, screenshots of the Catalog tab, and the test/typecheck output. The user decides when to merge (solo repo — straight merge, no PR).

---

## Self-Review Notes (already applied)

- Spec §3.1 tables all covered in Task 1; `gym_profiles`, `daily_checkins`, `generated_sessions`, `exercise_skill_state`, and the `workout_instances` relaxation are **Phase 2 — deliberately absent here** (spec §7).
- `sanitizeExtraction` is the single gate between model output and UI; `saveCapture` is the single write path; both constrained-output rules from spec §2 hold.
- Type names are consistent across tasks (`ExtractedPost`, `CatalogEntry`, `ResolvedPost` defined in Task 2, used in Tasks 3–8).
- `createExercise` input in Task 6 matches `CreateMovementInput` (verified against `mobile/src/types/crossfit.ts:661` — `movement_category_id` required, `is_official: false` literal, `created_by` required).
- The embedded-select relation names in `fetchCatalog` (`exercise_muscle_regions`, `exercise_goal_types`, `source_exercises`, `captured_sources`) follow the same aliasing style as `fetchMovementWithAttributes` in `crossfit.ts:1023`; Task 10 is their runtime proof.
