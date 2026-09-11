# Catalog Enrichment Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new catalog exercise gets its description, demo video and image without anyone doing anything after saving the wizard; the "Create new" path carries the capture extraction into the wizard; one idempotent fill-only edge function (`enrich-exercise`) replaces the two image generators, backfills the existing catalog once, and self-heals weekly — and a human's edit to any of the three fields is never overwritten.

**Architecture:** Provenance lives in a new `exercises.enrichment` jsonb column (Task 1). The decision logic is a pure Deno module `fill.ts` (Task 2) with no I/O. The image generator's prompt and Gemini call move into `_shared/exerciseImage.ts` (Task 3) so both the old function and the new one import it; `capture-post` gains a `describe` action (Task 4). `enrich-exercise` (Task 5) is the thin I/O wrapper: `enrich` for one row, `sweep` for many. On the phone, `extractionPrefill.ts` (Task 6) is the pure prefill, `enrich.ts` (Task 7) the client, `frontDoor.ts` (Task 8) writes `by: "user"`, the page menu (Task 9) calls the function, the Training tab (Task 10) runs the weekly sweep, the backfill script (Task 11) runs once, and Task 12 verifies on device and merges.

**Tech Stack:** Supabase (Postgres migration, Storage, Deno edge functions, supabase-js), OpenAI chat completions (the capture-post model), Gemini image generation, Expo / React Native, TypeScript, Jest (ts-jest, pure libs only), Deno test for the edge modules, AsyncStorage.

**Spec:** docs/superpowers/specs/2026-09-11-catalog-enrichment-pipeline-design.md

**Conventions for every task:**
- Work on branch `catalog-enrichment` (`git checkout -b catalog-enrichment` from `main` before Task 1). Never open a PR; Task 12 merges to `main`.
- Mobile: work from `mobile/`. Run tests with `npx jest <path>`; typecheck with `npx tsc --noEmit -p .` (must print nothing). Jest cannot import React Native: every tested file is a pure lib.
- Edge functions: Deno tests run from `supabase/functions` with `deno test <path>` (add `--allow-import` if Deno asks for it on the remote std/esm imports). Type-check a function from the repo root with `deno check supabase/functions/<name>/index.ts`. Deploy from the repo root with `npx supabase functions deploy <name>`. Push migrations from the repo root with `npx supabase db push --yes` (the CLI is linked at the root: `supabase/.temp/project-ref`).
- Credentials for scripts and curl smoke tests are in `mobile/.env` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `SERVICE_ROLE`). The repo-root `.env` is dead; never read it.
- The Supabase client is untyped: a green `tsc` proves nothing about column names. Check spellings against `supabase/migrations/20260824000000_live_baseline.sql` by eye.
- Commit after each task with the message given. End every commit message with a blank line and `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Never import `@/src/lib/colors` (the legacy shim) in a new file; use `@/src/theme/tokens`. Files that already import the shim keep it; do not migrate them here.
- Where this plan and the spec disagree, the spec wins.

---

## File map

**New (Supabase):**
- `supabase/migrations/20260918130000_exercise_enrichment.sql` — `exercises.enrichment jsonb`, seeded `by: "user"` for every filled field.
- `supabase/functions/_shared/exerciseImage.ts` (+ `exerciseImage.test.ts`) — the image prompt and the Gemini + Storage call, importable.
- `supabase/functions/enrich-exercise/fill.ts` (+ `fill.test.ts`) — pure fill decisions and description validation.
- `supabase/functions/enrich-exercise/index.ts` — actions `enrich` and `sweep`.
- `scripts/enrich-backfill.ts` — dry-run then real sweep, images off.

**New (mobile):**
- `mobile/src/lib/extractionPrefill.ts` (+ `__tests__/extractionPrefill.test.ts`) — raw extraction + reviewed name → wizard initial values.
- `mobile/src/lib/exerciseEnrichment.ts` (+ `__tests__/exerciseEnrichment.test.ts`) — the provenance shape and the pure "what the update path writes" rule.
- `mobile/src/lib/enrichSweepGate.ts` (+ `__tests__/enrichSweepGate.test.ts`) — the 7-day gate.
- `mobile/src/lib/supabase/enrich.ts` — `enrichExercise`, `enrichExerciseInBackground`, `runEnrichSweep`, `maybeRunWeeklySweep`.

**Changed:**
- `supabase/functions/generate-exercise-image/index.ts` — entry point calls the shared module.
- `supabase/functions/capture-post/index.ts` — `describe` action; the service role may call it.
- `mobile/src/components/training/crossfit/CatalogItemWizard.tsx` — `initialPrefill` prop; fires `enrichExerciseInBackground` after create.
- `mobile/src/components/training/daily/MatchReviewSheet.tsx` — "Create new" reads the source's raw extraction.
- `mobile/src/lib/supabase/capture.ts` — `fetchSourceRawExtraction`.
- `mobile/src/lib/supabase/frontDoor.ts` — update path writes provenance.
- `mobile/src/lib/supabase/exerciseImages.ts` — wrapper over `enrich` with `force_image`.
- `mobile/src/components/training/item-detail/TrainingItemDetailScreen.tsx` — "Enrich" and "Regenerate image"; client prompt builder deleted; `discipline` prop deleted.
- `mobile/app/(tabs)/training/movement/[id].tsx` — no more `discipline`.
- `mobile/app/(tabs)/training/index.tsx` — weekly sweep on open.

**Deleted:** `supabase/functions/generate-movement-image/` (and the deployed function). The `movement-images` bucket stays.

---

### Task 1: Migration — `exercises.enrichment` provenance

**Files:**
- Create: `supabase/migrations/20260918130000_exercise_enrichment.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Provenance for the three enrichable exercise fields, so the enrichment
-- pipeline can tell a human's text from its own and never overwrite the
-- former. Spec: docs/superpowers/specs/2026-09-11-catalog-enrichment-pipeline-design.md §5
--
-- Shape, keyed by column name:
--   {"description": {"by": "extraction" | "model" | "user", "at": "<iso>"},
--    "video_url":   {"by": "capture" | "user", "at": "<iso>"},
--    "image_url":   {"by": "model" | "user", "at": "<iso>"}}
-- A missing key means "nobody has filled this; the pipeline may".
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS enrichment jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.exercises.enrichment IS
  'Per-field provenance for description / video_url / image_url: {"<field>": {"by": "user"|"extraction"|"model"|"capture", "at": iso}}. A field with no key is fillable by enrich-exercise; by="user" is never overwritten.';

-- Seed: everything that exists today was put there by a person (or by a
-- generator a person tapped), so the backfill must not touch it. Only rows
-- with no provenance yet are stamped — re-running this file changes nothing.
UPDATE public.exercises
SET enrichment = enrichment
  || CASE WHEN nullif(btrim(description), '') IS NOT NULL
       THEN jsonb_build_object('description', jsonb_build_object('by', 'user', 'at', now()))
       ELSE '{}'::jsonb END
  || CASE WHEN nullif(btrim(video_url), '') IS NOT NULL
       THEN jsonb_build_object('video_url', jsonb_build_object('by', 'user', 'at', now()))
       ELSE '{}'::jsonb END
  || CASE WHEN nullif(btrim(image_url), '') IS NOT NULL
       THEN jsonb_build_object('image_url', jsonb_build_object('by', 'user', 'at', now()))
       ELSE '{}'::jsonb END
WHERE enrichment = '{}'::jsonb;

-- Assert: no filled field is left without provenance, and no empty field
-- carries one. Either would let the backfill overwrite or skip wrongly.
DO $$
DECLARE
  unstamped integer;
  ghost integer;
  n_desc integer;
  n_video integer;
  n_image integer;
BEGIN
  SELECT count(*) INTO unstamped FROM public.exercises
  WHERE (nullif(btrim(description), '') IS NOT NULL AND NOT (enrichment ? 'description'))
     OR (nullif(btrim(video_url), '') IS NOT NULL AND NOT (enrichment ? 'video_url'))
     OR (nullif(btrim(image_url), '') IS NOT NULL AND NOT (enrichment ? 'image_url'));
  IF unstamped > 0 THEN
    RAISE EXCEPTION 'exercise_enrichment: % rows have a filled field with no provenance', unstamped;
  END IF;

  SELECT count(*) INTO ghost FROM public.exercises
  WHERE (nullif(btrim(description), '') IS NULL AND enrichment ? 'description')
     OR (nullif(btrim(video_url), '') IS NULL AND enrichment ? 'video_url')
     OR (nullif(btrim(image_url), '') IS NULL AND enrichment ? 'image_url');
  IF ghost > 0 THEN
    RAISE EXCEPTION 'exercise_enrichment: % rows carry provenance for an empty field', ghost;
  END IF;

  SELECT count(*) FILTER (WHERE enrichment ? 'description'),
         count(*) FILTER (WHERE enrichment ? 'video_url'),
         count(*) FILTER (WHERE enrichment ? 'image_url')
    INTO n_desc, n_video, n_image
  FROM public.exercises;
  RAISE NOTICE 'exercise_enrichment seeded by=user: % descriptions, % videos, % images', n_desc, n_video, n_image;
END $$;
```

- [ ] **Step 2: Push it**

Run from the repo root: `npx supabase db push --yes`
Expected: `Applying migration 20260918130000_exercise_enrichment.sql...` then the NOTICE line with three counts (roughly 86 descriptions, 28 videos, 93 images per the spec's §1 numbers — record the actual three numbers here: `___ / ___ / ___`), then `Finished supabase db push.` No EXCEPTION.

- [ ] **Step 3: Verify the column from a terminal**

Run from `mobile/`:
```bash
set -a; . ./.env; set +a; curl -s "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/exercises?select=name,enrichment&enrichment=neq.{}&limit=2" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE"
```
Expected: two rows whose `enrichment` objects carry `"by":"user"` stamps for exactly the fields that are filled.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260918130000_exercise_enrichment.sql
git commit -m "feat(catalog): exercises.enrichment provenance column, seeded by=user for everything already filled

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `fill.ts` — pure fill decisions (Deno, TDD)

**Files:**
- Create: `supabase/functions/enrich-exercise/fill.test.ts`
- Create: `supabase/functions/enrich-exercise/fill.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/functions/enrich-exercise/fill.test.ts
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  planFill, validateDescription, isFillable, isPipelineVideoUrl,
  pickSingleExerciseSource, extractionDescriptionFor, normaliseName,
} from './fill.ts';
import type { EnrichRow, Candidate, RunFlags, SourceCandidate } from './fill.ts';

const AT = '2026-09-11T10:00:00.000Z';

const row = (o: Partial<EnrichRow> = {}): EnrichRow => ({
  id: 'e1', name: 'Kettlebell Swing', description: null, video_url: null, image_url: null,
  enrichment: {}, ...o,
});
const none: Candidate = { extractionDescription: null, singleExerciseSourceUrl: null };
const flags = (o: Partial<RunFlags> = {}): RunFlags => ({ images: false, forceImage: false, ...o });
const NAMES = ['Deadlift', 'Goblet Squat', 'KB Swing'];

Deno.test('isFillable: null or blank with no user provenance', () => {
  assertEquals(isFillable(row(), 'description'), true);
  assertEquals(isFillable(row({ description: '   ' }), 'description'), true);
  assertEquals(isFillable(row({ description: 'text' }), 'description'), false);
  assertEquals(isFillable(row({ enrichment: { description: { by: 'user', at: AT } } }), 'description'), false);
  // A model stamp on an empty field (image cleared by an identity edit) is fillable again.
  assertEquals(isFillable(row({ enrichment: { image_url: { by: 'model', at: AT } } }), 'image_url'), true);
});

Deno.test('planFill: a full row plans nothing (idempotent)', () => {
  const full = row({
    description: 'Hinge at the hips and swing the bell to chest height with a hard glute squeeze.',
    video_url: 'https://www.instagram.com/p/abc/', image_url: 'https://x/y.png',
    enrichment: {
      description: { by: 'model', at: AT }, video_url: { by: 'capture', at: AT }, image_url: { by: 'model', at: AT },
    },
  });
  assertEquals(planFill(full, none, flags({ images: true }), NAMES), {});
});

Deno.test('planFill: user provenance is never filled, even when blank', () => {
  const r = row({ enrichment: { description: { by: 'user', at: AT }, video_url: { by: 'user', at: AT } } });
  const c: Candidate = {
    extractionDescription: 'Hinge at the hips and swing the bell to chest height with a hard glute squeeze.',
    singleExerciseSourceUrl: 'https://www.instagram.com/p/abc/',
  };
  assertEquals(planFill(r, c, flags({ images: true }), NAMES), { image_url: { by: 'model' } });
});

Deno.test('planFill: extraction description before model', () => {
  const text = 'Hinge at the hips and swing the bell to chest height with a hard glute squeeze.';
  assertEquals(
    planFill(row(), { ...none, extractionDescription: text }, flags(), NAMES),
    { description: { by: 'extraction', text } },
  );
  assertEquals(planFill(row(), none, flags(), NAMES), { description: { by: 'model' } });
});

Deno.test('planFill: an extraction description that fails validation falls back to the model', () => {
  assertEquals(
    planFill(row(), { ...none, extractionDescription: 'Too short.' }, flags(), NAMES),
    { description: { by: 'model' } },
  );
});

Deno.test('planFill: video only from a single-exercise capture', () => {
  assertEquals(
    planFill(row({ description: 'x'.repeat(50), enrichment: { description: { by: 'user', at: AT } } }),
      { ...none, singleExerciseSourceUrl: 'https://www.tiktok.com/@a/video/1' }, flags(), NAMES),
    { video_url: { by: 'capture', url: 'https://www.tiktok.com/@a/video/1' } },
  );
  assertEquals(
    planFill(row({ description: 'x'.repeat(50), enrichment: { description: { by: 'user', at: AT } } }), none, flags(), NAMES),
    {},
  );
});

Deno.test('planFill: images only when the run enables them', () => {
  const r = row({ description: 'x'.repeat(50), enrichment: { description: { by: 'user', at: AT } } });
  assertEquals(planFill(r, none, flags(), NAMES), {});
  assertEquals(planFill(r, none, flags({ images: true }), NAMES), { image_url: { by: 'model' } });
});

Deno.test('planFill: forceImage overwrites an existing image, even a user one; nothing else', () => {
  const r = row({
    description: 'x'.repeat(50), image_url: 'https://x/y.png',
    enrichment: { description: { by: 'user', at: AT }, image_url: { by: 'user', at: AT } },
  });
  assertEquals(planFill(r, none, flags({ images: true, forceImage: true }), NAMES), { image_url: { by: 'model' } });
  // forceImage implies images.
  assertEquals(planFill(r, none, flags({ forceImage: true }), NAMES), { image_url: { by: 'model' } });
});

Deno.test('validateDescription: length, plain text, other names', () => {
  const ok = validateDescription(
    '  Hinge at the hips and swing the bell to chest height with a hard glute squeeze.  ', 'Kettlebell Swing', NAMES,
  );
  assertEquals(ok, { ok: true, text: 'Hinge at the hips and swing the bell to chest height with a hard glute squeeze.' });
  assertEquals(validateDescription('Swing it.', 'Kettlebell Swing', NAMES), { ok: false, reason: 'too short (9 < 40 chars)' });
  assertEquals(validateDescription('x'.repeat(601), 'Kettlebell Swing', NAMES), { ok: false, reason: 'too long (601 > 600 chars)' });
  assertEquals(
    validateDescription('<b>Hinge</b> at the hips and swing the bell to chest height with a squeeze.', 'Kettlebell Swing', NAMES),
    { ok: false, reason: 'not plain text' },
  );
  assertEquals(
    validateDescription('- Hinge at the hips and swing the bell to chest height with a squeeze.', 'Kettlebell Swing', NAMES),
    { ok: false, reason: 'not plain text' },
  );
  assertEquals(
    validateDescription('Deadlift the bell from the floor, then swing it to chest height with a squeeze.', 'Kettlebell Swing', NAMES),
    { ok: false, reason: 'starts with another catalog name: Deadlift' },
  );
  // Its own name is fine; a prefix that is only part of a word is not a name.
  assertEquals(
    validateDescription('Kettlebell Swing: hinge at the hips and drive the bell to chest height with the glutes.', 'Kettlebell Swing', NAMES).ok,
    true,
  );
  assertEquals(
    validateDescription('Deadlifting is not this. Hinge at the hips and swing the bell to chest height.', 'Kettlebell Swing', NAMES).ok,
    true,
  );
});

Deno.test('validateDescription: other-name match is case-insensitive', () => {
  assertEquals(
    validateDescription('kb swing the bell to chest height with a hard glute squeeze and neutral spine.', 'Kettlebell Swing', NAMES),
    { ok: false, reason: 'starts with another catalog name: KB Swing' },
  );
});

Deno.test('isPipelineVideoUrl: https instagram.com / tiktok.com only', () => {
  assertEquals(isPipelineVideoUrl('https://www.instagram.com/reel/abc/'), true);
  assertEquals(isPipelineVideoUrl('https://vm.tiktok.com/ZM1/'), true);
  assertEquals(isPipelineVideoUrl('http://www.instagram.com/reel/abc/'), false);
  assertEquals(isPipelineVideoUrl('https://youtube.com/watch?v=1'), false);
  assertEquals(isPipelineVideoUrl('https://notinstagram.com/x'), false);
  assertEquals(isPipelineVideoUrl(''), false);
});

const src = (o: Partial<SourceCandidate> = {}): SourceCandidate => ({
  sourceUrl: 'https://www.instagram.com/p/one/', platform: 'instagram', capturedAt: '2026-09-01T00:00:00Z',
  extractionStatus: 'reviewed', hasWorkout: false, rawExtraction: null, ...o,
});

Deno.test('pickSingleExerciseSource: most recent reviewed capture with no workout row', () => {
  const older = src({ sourceUrl: 'https://www.instagram.com/p/old/', capturedAt: '2026-08-01T00:00:00Z' });
  const newer = src({ sourceUrl: 'https://www.instagram.com/p/new/', capturedAt: '2026-09-05T00:00:00Z' });
  assertEquals(pickSingleExerciseSource([older, newer]), 'https://www.instagram.com/p/new/');
  assertEquals(pickSingleExerciseSource([newer, older]), 'https://www.instagram.com/p/new/');
});

Deno.test('pickSingleExerciseSource: skips workouts, pending captures, and non-platform URLs', () => {
  assertEquals(pickSingleExerciseSource([src({ hasWorkout: true })]), null);
  assertEquals(pickSingleExerciseSource([src({ extractionStatus: 'pending' })]), null);
  assertEquals(pickSingleExerciseSource([src({ sourceUrl: 'https://example.com/x' })]), null);
  assertEquals(pickSingleExerciseSource([src({ sourceUrl: '' })]), null);
  assertEquals(pickSingleExerciseSource([]), null);
});

Deno.test('normaliseName: case and spacing', () => {
  assertEquals(normaliseName('  Kettlebell   swing '), 'kettlebell swing');
  assertEquals(normaliseName('KETTLEBELL SWING'), 'kettlebell swing');
});

Deno.test('extractionDescriptionFor: matches the reviewed name across sources, newest first', () => {
  const raw = (name: string, description: string | null) => ({
    post_type: 'single_exercise',
    exercises: [{ name, description, category: 'strength', skill_level: 'Beginner',
      primary_muscles: [], secondary_muscles: [], equipment: [], library_match_id: null }],
    workout: null,
  });
  const a = src({ capturedAt: '2026-08-01T00:00:00Z', rawExtraction: raw('kettlebell  swing', 'Older text that is long enough to count as a description here.') });
  const b = src({ capturedAt: '2026-09-01T00:00:00Z', rawExtraction: raw('Kettlebell Swing', 'Newer text that is long enough to count as a description here.') });
  assertEquals(extractionDescriptionFor([a, b], 'Kettlebell Swing'), 'Newer text that is long enough to count as a description here.');
  assertEquals(extractionDescriptionFor([a], 'Goblet Squat'), null);
  assertEquals(extractionDescriptionFor([src({ rawExtraction: raw('Kettlebell Swing', null) })], 'Kettlebell Swing'), null);
  assertEquals(extractionDescriptionFor([src({ rawExtraction: 'garbage' })], 'Kettlebell Swing'), null);
  // A pending capture's extraction is not trusted.
  assertEquals(extractionDescriptionFor([src({ extractionStatus: 'pending', rawExtraction: raw('Kettlebell Swing', 'x'.repeat(50)) })], 'Kettlebell Swing'), null);
});
```

- [ ] **Step 2: Run it to see it fail**

Run from `supabase/functions`: `deno test enrich-exercise/fill.test.ts`
Expected: FAIL, module `./fill.ts` not found.

- [ ] **Step 3: Write the module**

```ts
// supabase/functions/enrich-exercise/fill.ts
// Pure decisions for the enrichment pipeline: given a row, its provenance,
// what its captures can offer and the run's flags, say which fields to fill
// and from where. No I/O, no Deno globals — index.ts does the reading and
// writing; this file is what the tests pin.
// Spec: docs/superpowers/specs/2026-09-11-catalog-enrichment-pipeline-design.md §5, §8

export type ProvenanceBy = 'user' | 'extraction' | 'model' | 'capture';
export interface ProvenanceStamp { by: ProvenanceBy; at: string }
export type EnrichableField = 'description' | 'video_url' | 'image_url';
/** exercises.enrichment, keyed by column. A missing key means fillable. */
export type Enrichment = Partial<Record<EnrichableField, ProvenanceStamp>>;

export interface EnrichRow {
  id: string;
  name: string;
  description: string | null;
  video_url: string | null;
  image_url: string | null;
  enrichment: Enrichment;
}

/** What this row's linked captures can offer, already narrowed by the rules below. */
export interface Candidate {
  extractionDescription: string | null;
  singleExerciseSourceUrl: string | null;
}

export interface RunFlags {
  /** Generate an image for an empty slot. */
  images: boolean;
  /** Generate an image even over an existing one — the only overwrite. Implies images. */
  forceImage: boolean;
}

export interface FillPlan {
  description?: { by: 'extraction' | 'model'; text?: string };
  video_url?: { by: 'capture'; url: string };
  image_url?: { by: 'model' };
}

/** One linked captured_sources row, flattened for the decision. */
export interface SourceCandidate {
  sourceUrl: string;
  platform: string;
  capturedAt: string;
  extractionStatus: string;
  /** True when the capture produced a captured_workouts row. */
  hasWorkout: boolean;
  rawExtraction: unknown;
}

export type DescriptionCheck = { ok: true; text: string } | { ok: false; reason: string };

const MIN_DESCRIPTION = 40;
const MAX_DESCRIPTION = 600;

const blank = (v: string | null): boolean => v === null || v.trim() === '';

/** Null or blank, and not a person's. */
export function isFillable(row: EnrichRow, field: EnrichableField): boolean {
  if (!blank(row[field])) return false;
  return row.enrichment[field]?.by !== 'user';
}

/** Lower-case, trimmed, inner whitespace collapsed. */
export function normaliseName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Plain prose: no markup, no markdown bullets or headings, no newlines. */
function isPlainText(text: string): boolean {
  if (/[<>]/.test(text)) return false;
  if (/^[-*#>•]/.test(text)) return false;
  if (/\n/.test(text)) return false;
  return true;
}

/**
 * The gate every description passes before it is written (§8): 40–600
 * characters after trimming, plain text, and not opening with the name of a
 * DIFFERENT catalog exercise — the model's favourite failure is describing
 * the wrong movement. The row's own name is allowed. A name only counts
 * when it is followed by a word boundary, so "Deadlifting…" is not "Deadlift".
 */
export function validateDescription(text: string, name: string, otherNames: string[]): DescriptionCheck {
  const trimmed = text.trim();
  if (trimmed.length < MIN_DESCRIPTION) return { ok: false, reason: `too short (${trimmed.length} < ${MIN_DESCRIPTION} chars)` };
  if (trimmed.length > MAX_DESCRIPTION) return { ok: false, reason: `too long (${trimmed.length} > ${MAX_DESCRIPTION} chars)` };
  if (!isPlainText(trimmed)) return { ok: false, reason: 'not plain text' };
  const own = normaliseName(name);
  const head = normaliseName(trimmed);
  for (const other of otherNames) {
    const n = normaliseName(other);
    if (n === '' || n === own) continue;
    if (head === n || (head.startsWith(n) && !/[a-z0-9]/.test(head.charAt(n.length)))) {
      return { ok: false, reason: `starts with another catalog name: ${other}` };
    }
  }
  return { ok: true, text: trimmed };
}

/** The pipeline only ever writes a stored post link from the two platforms
 *  captures come from, over https. The human field accepts anything. */
export function isPipelineVideoUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.replace(/^www\./, '');
    const isDomain = (h: string, d: string) => h === d || h.endsWith(`.${d}`);
    return isDomain(host, 'instagram.com') || isDomain(host, 'tiktok.com');
  } catch {
    return false;
  }
}

const byNewest = (a: SourceCandidate, b: SourceCandidate) => b.capturedAt.localeCompare(a.capturedAt);

/** Decision 2: the default demo video is the post, when it was captured as a
 *  single exercise. Most recent reviewed capture with no workout row. */
export function pickSingleExerciseSource(sources: SourceCandidate[]): string | null {
  const hit = [...sources]
    .sort(byNewest)
    .find((s) => s.extractionStatus === 'reviewed' && !s.hasWorkout && isPipelineVideoUrl(s.sourceUrl));
  return hit ? hit.sourceUrl : null;
}

/** The capture extraction's description for this name, from the newest
 *  reviewed source whose stored raw extraction lists the name. Mirrors the
 *  phone's extractionPrefill match (case and spacing insensitive). */
export function extractionDescriptionFor(sources: SourceCandidate[], name: string): string | null {
  const wanted = normaliseName(name);
  for (const s of [...sources].sort(byNewest)) {
    if (s.extractionStatus !== 'reviewed') continue;
    const raw = s.rawExtraction;
    if (typeof raw !== 'object' || raw === null) continue;
    const exercises = (raw as { exercises?: unknown }).exercises;
    if (!Array.isArray(exercises)) continue;
    for (const e of exercises) {
      if (typeof e !== 'object' || e === null) continue;
      const ex = e as { name?: unknown; description?: unknown };
      if (typeof ex.name !== 'string' || normaliseName(ex.name) !== wanted) continue;
      if (typeof ex.description === 'string' && ex.description.trim() !== '') return ex.description.trim();
    }
  }
  return null;
}

/**
 * The plan for one row. Empty object = nothing to do. `otherNames` is every
 * other catalog name and alias, for validating an extraction description up
 * front (a bad one falls through to the model, which index.ts validates the
 * same way after generating).
 */
export function planFill(row: EnrichRow, candidate: Candidate, flags: RunFlags, otherNames: string[]): FillPlan {
  const plan: FillPlan = {};
  if (isFillable(row, 'description')) {
    const fromExtraction = candidate.extractionDescription;
    const check = fromExtraction !== null ? validateDescription(fromExtraction, row.name, otherNames) : null;
    plan.description = check && check.ok ? { by: 'extraction', text: check.text } : { by: 'model' };
  }
  if (isFillable(row, 'video_url') && candidate.singleExerciseSourceUrl !== null) {
    plan.video_url = { by: 'capture', url: candidate.singleExerciseSourceUrl };
  }
  if (flags.forceImage || (flags.images && isFillable(row, 'image_url'))) {
    plan.image_url = { by: 'model' };
  }
  return plan;
}

/** True when a sweep should visit this row: any field the plan would fill. */
export function hasWork(plan: FillPlan): boolean {
  return plan.description !== undefined || plan.video_url !== undefined || plan.image_url !== undefined;
}
```

- [ ] **Step 4: Run the tests**

Run from `supabase/functions`: `deno test enrich-exercise/fill.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/enrich-exercise/fill.ts supabase/functions/enrich-exercise/fill.test.ts
git commit -m "feat(enrich): pure fill decisions and description validation, Deno-tested

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 3: One image generator — `_shared/exerciseImage.ts`

**Files:**
- Create: `supabase/functions/_shared/exerciseImage.ts`
- Create: `supabase/functions/_shared/exerciseImage.test.ts`
- Modify: `supabase/functions/generate-exercise-image/index.ts` (rewritten on the module; same request and response shape)

- [ ] **Step 1: Write the failing prompt test**

```ts
// supabase/functions/_shared/exerciseImage.test.ts
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { buildImagePrompt, equipmentListOf } from './exerciseImage.ts';
import type { ImageRow } from './exerciseImage.ts';

const row = (o: Partial<ImageRow> = {}): ImageRow => ({
  id: 'e1', name: 'Kettlebell Swing', description: null, core_default_equipment: null,
  exercise_equipment: [], ...o,
});

Deno.test('equipmentListOf: junction names first, then the core default, else bodyweight', () => {
  assertEquals(equipmentListOf(row({ exercise_equipment: [{ equipment: { name: 'Kettlebell' } }, { equipment: null }] })), 'Kettlebell');
  assertEquals(equipmentListOf(row({ core_default_equipment: 'Barbell, Rack' })), 'Barbell, Rack');
  assertEquals(equipmentListOf(row({ exercise_equipment: [{ equipment: { name: 'Box' } }], core_default_equipment: 'Barbell' })), 'Box');
  assertEquals(equipmentListOf(row()), 'bodyweight');
  assertEquals(equipmentListOf(row({ exercise_equipment: null })), 'bodyweight');
});

Deno.test('buildImagePrompt: name, equipment, optional movement line, optional discipline', () => {
  const p = buildImagePrompt(row({ description: 'Hinge and swing.', exercise_equipment: [{ equipment: { name: 'Kettlebell' } }] }), null);
  assertStringIncludes(p, 'demonstrating the "Kettlebell Swing" exercise');
  assertStringIncludes(p, '- Equipment: Kettlebell');
  assertStringIncludes(p, '- Movement: Hinge and swing.');
  assertStringIncludes(p, 'an athletic person');
  const bare = buildImagePrompt(row(), null);
  assertEquals(bare.includes('- Movement:'), false);
  const cf = buildImagePrompt(row(), 'CrossFit');
  assertStringIncludes(cf, 'an athletic CrossFit athlete');
  assertStringIncludes(cf, 'Modern CrossFit gym environment');
});
```

- [ ] **Step 2: Run it to see it fail**

Run from `supabase/functions`: `deno test _shared/exerciseImage.test.ts`
Expected: FAIL, module `./exerciseImage.ts` not found.

- [ ] **Step 3: Write the module**

The prompt below is `generate-exercise-image`'s current prompt verbatim, with two optional substitutions driven by `discipline` (null keeps the old wording exactly).

```ts
// supabase/functions/_shared/exerciseImage.ts
// The one exercise image generator. Prompt from the row (name, equipment,
// description, discipline), picture from Gemini, stored in the
// exercise-images bucket. Imported by generate-exercise-image (the legacy
// entry point) and enrich-exercise. Nothing here writes the exercises row —
// the caller decides what to record alongside the URL.
// Spec: docs/superpowers/specs/2026-09-11-catalog-enrichment-pipeline-design.md §5
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const IMAGE_BUCKET = 'exercise-images';
const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';

/** The row columns the prompt reads. */
export interface ImageRow {
  id: string;
  name: string;
  description: string | null;
  core_default_equipment: string | null;
  exercise_equipment: { equipment: { name: string } | null }[] | null;
}

export const IMAGE_ROW_SELECT = 'id, name, description, core_default_equipment, exercise_equipment(equipment(name))';

/** Junction names first, else the core's default list, else bodyweight. */
export function equipmentListOf(row: ImageRow): string {
  const junction = (row.exercise_equipment ?? [])
    .map((ee) => ee.equipment?.name)
    .filter((n): n is string => typeof n === 'string' && n !== '');
  const core = (row.core_default_equipment ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return (junction.length > 0 ? junction : core).join(', ') || 'bodyweight';
}

export function buildImagePrompt(row: ImageRow, discipline: string | null): string {
  const person = discipline ? `an athletic ${discipline} athlete` : 'an athletic person';
  const gym = discipline ? `Modern ${discipline} gym environment` : 'Modern gym environment';
  return `Professional fitness photography of ${person} demonstrating the "${row.name}" exercise.

Requirements:
- Photorealistic image, high quality sports photography style
- Fit, athletic model with proper form and technique
- ${gym} with professional lighting
- Equipment: ${equipmentListOf(row)}
- Dynamic pose showing the exercise movement
- Dramatic lighting, cinematic quality
- No text, watermarks, or labels
- Focus on muscle engagement and proper form
${row.description ? `- Movement: ${row.description}` : ''}

Style: Realistic fitness photography like Nike or Under Armour advertising campaigns.`;
}

export class ImageGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageGenerationError';
  }
}

/** One Gemini call. Throws ImageGenerationError on any failure. */
export async function generateImageBytes(
  geminiApiKey: string, prompt: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const res = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { response_modalities: ['IMAGE'], image_config: { aspect_ratio: '16:9' } },
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new ImageGenerationError(`Gemini API error: ${res.status} ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  if (candidates.length === 0) throw new ImageGenerationError('No images generated by Gemini');
  const parts = (candidates[0]?.content?.parts ?? []) as Record<string, unknown>[];
  const part = parts.find((p) => p.inlineData || p.inline_data);
  if (!part) throw new ImageGenerationError('No inline image data in Gemini response');
  const inline = (part.inlineData ?? part.inline_data) as { data?: string; mimeType?: string; mime_type?: string };
  if (typeof inline.data !== 'string') throw new ImageGenerationError('No inline image data found');
  return {
    bytes: Uint8Array.from(atob(inline.data), (c) => c.charCodeAt(0)),
    mimeType: inline.mimeType || inline.mime_type || 'image/png',
  };
}

/** Upload to the exercise-images bucket; returns the public URL. */
export async function storeImage(
  supabase: SupabaseClient, exerciseId: string, bytes: Uint8Array, mimeType: string,
): Promise<string> {
  const fileName = `exercises/${exerciseId}_${Date.now()}.png`;
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(fileName, bytes, {
    contentType: mimeType, upsert: true,
  });
  if (error) throw new ImageGenerationError(`Failed to upload image: ${error.message}`);
  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(fileName).data.publicUrl;
}

/**
 * Read the row, build the prompt, generate, store. Returns the public URL.
 * Does NOT update exercises.image_url — callers write it with whatever
 * provenance they own. Throws ImageGenerationError (or a plain Error when
 * the row is missing).
 */
export async function generateAndStoreImage(
  supabase: SupabaseClient, exerciseId: string, opts: { geminiApiKey: string; discipline: string | null },
): Promise<string> {
  const { data, error } = await supabase.from('exercises').select(IMAGE_ROW_SELECT).eq('id', exerciseId).single();
  if (error || !data) throw new Error('Exercise not found');
  const row = data as unknown as ImageRow;
  console.log(`Generating image for exercise: ${row.name}`);
  const prompt = buildImagePrompt(row, opts.discipline);
  const { bytes, mimeType } = await generateImageBytes(opts.geminiApiKey, prompt);
  const url = await storeImage(supabase, exerciseId, bytes, mimeType);
  console.log(`Image generated for exercise ${row.name}: ${url}`);
  return url;
}
```

- [ ] **Step 4: Run the tests**

Run from `supabase/functions`: `deno test _shared/exerciseImage.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Rewrite the legacy entry point on the module**

Replace the entire contents of `supabase/functions/generate-exercise-image/index.ts` with:

```ts
// Legacy entry point, kept so nothing breaks while callers move to
// enrich-exercise: same request ({ exerciseId, userId }) and response
// ({ success, imageUrl, exerciseId }) as before. The prompt and the Gemini
// call live in _shared/exerciseImage.ts now; this file only reads the
// request, runs the shared generator and records the URL with model
// provenance. The mobile wrapper stops calling this in Task 7 of the
// catalog-enrichment plan; it can be deleted once nothing else does.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateAndStoreImage, ImageGenerationError } from '../_shared/exerciseImage.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      console.error('GEMINI_API_KEY not configured');
      return json({ success: false, error: 'API key not configured' });
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase credentials not configured');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { exerciseId, userId } = await req.json();
    if (!exerciseId || !userId) {
      return json({ error: 'Missing required fields: exerciseId, userId' }, 400);
    }

    let publicUrl: string;
    try {
      publicUrl = await generateAndStoreImage(supabase, String(exerciseId), { geminiApiKey, discipline: null });
    } catch (e) {
      if (e instanceof Error && e.message === 'Exercise not found') return json({ error: 'Exercise not found' }, 404);
      if (e instanceof ImageGenerationError && e.message.startsWith('Gemini API error')) {
        console.error(e.message);
        return json({ success: false, error: e.message.split(' ').slice(0, 4).join(' ') });
      }
      throw e;
    }

    // Read-modify-write of the provenance object: the column is small and a
    // concurrent edit of the same row is a human race we accept here.
    const { data: current } = await supabase.from('exercises').select('enrichment').eq('id', exerciseId).maybeSingle();
    const enrichment = (current?.enrichment ?? {}) as Record<string, unknown>;
    const { error: updateError } = await supabase.from('exercises').update({
      image_url: publicUrl,
      enrichment: { ...enrichment, image_url: { by: 'model', at: new Date().toISOString() } },
    }).eq('id', exerciseId);
    if (updateError) console.error('Database update error:', updateError);

    return json({ success: true, imageUrl: publicUrl, exerciseId });
  } catch (error) {
    console.error('Error in generate-exercise-image function:', error);
    return json({ error: error instanceof Error ? error.message : 'Failed to generate image', success: false }, 500);
  }
});
```

- [ ] **Step 6: Type-check and deploy**

Run from the repo root:
```bash
deno check supabase/functions/generate-exercise-image/index.ts && npx supabase functions deploy generate-exercise-image
```
Expected: no type errors; `Deployed Functions on project ...: generate-exercise-image`. (Supabase bundles `../_shared/` imports with the function.)

- [ ] **Step 7: Verify unchanged behaviour with a throwaway row**

Run from `mobile/`. First pick an exercise with no image (`enrichment` has no `image_url`), then call the function as before:
```bash
set -a; . ./.env; set +a
EX=$(curl -s "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/exercises?select=id,name&image_url=is.null&is_official=eq.false&limit=1" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE"); echo "$EX"
ID=$(echo "$EX" | sed -E 's/.*"id":"([^"]+)".*/\1/')
curl -s -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/generate-exercise-image" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" -H "Content-Type: application/json" -d "{\"exerciseId\":\"$ID\",\"userId\":\"backfill\"}"
curl -s "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/exercises?select=image_url,enrichment&id=eq.$ID" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE"
```
Expected: `{"success":true,"imageUrl":"https://.../storage/v1/object/public/exercise-images/exercises/<id>_<ts>.png","exerciseId":"<id>"}`; the second read shows that URL and `"image_url":{"by":"model",...}` in `enrichment`. Open the URL in a browser: a photo of the movement. (This spends one image credit on a row that had none; that is the pipeline's job anyway.)

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared supabase/functions/generate-exercise-image/index.ts
git commit -m "refactor(edge): exercise image prompt and generation move to _shared/exerciseImage.ts; legacy entry point calls it

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `capture-post` action `describe`

**Files:**
- Modify: `supabase/functions/capture-post/index.ts`

- [ ] **Step 1: Add the describe helper**

In `supabase/functions/capture-post/index.ts`, directly above the line `async function resolveTikTok(url: string) {`, insert:

```ts
// ── describe ─────────────────────────────────────────────────────────────────
// One short description for one catalog exercise from its structured facts,
// for enrich-exercise to fill an empty description with. Suggest only: the
// caller validates and writes. Facts come either from the row (exerciseId,
// read with the service role) or verbatim in the body (facts).

interface DescribeFacts {
  name: string;
  aliases: string[];
  category: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  skillLevel: string | null;
}

const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];

function factsFromBody(v: unknown): DescribeFacts {
  const f = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  const name = typeof f.name === 'string' ? f.name.trim() : '';
  if (!name) throw new Error('facts.name is required');
  return {
    name,
    aliases: strList(f.aliases),
    category: typeof f.category === 'string' && f.category.trim() !== '' ? f.category.trim() : null,
    primaryMuscles: strList(f.primaryMuscles),
    secondaryMuscles: strList(f.secondaryMuscles),
    equipment: strList(f.equipment),
    skillLevel: typeof f.skillLevel === 'string' && f.skillLevel.trim() !== '' ? f.skillLevel.trim() : null,
  };
}

async function factsFromRow(exerciseId: string): Promise<DescribeFacts> {
  const service = serviceClient();
  const { data, error } = await service
    .from('exercises')
    .select(
      'id, name, skill_level, core_default_equipment, ' +
      'movement_category:movement_categories(name), ' +
      'exercise_equipment(equipment(name)), ' +
      'exercise_muscle_regions(is_primary, muscle_region:muscle_regions(name)), ' +
      'exercise_aliases(alias)',
    )
    .eq('id', exerciseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('exercise not found');
  // deno-lint-ignore no-explicit-any
  const row = data as any;
  const junction: string[] = (row.exercise_equipment ?? [])
    .map((ee: { equipment: { name: string } | null }) => ee.equipment?.name)
    .filter((n: unknown): n is string => typeof n === 'string');
  const core: string[] = String(row.core_default_equipment ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
  const muscles = (row.exercise_muscle_regions ?? []) as { is_primary: boolean; muscle_region: { name: string } | null }[];
  return {
    name: String(row.name),
    aliases: ((row.exercise_aliases ?? []) as { alias: string }[]).map((a) => a.alias).filter(Boolean),
    category: row.movement_category?.name ?? null,
    primaryMuscles: muscles.filter((m) => m.is_primary).map((m) => m.muscle_region?.name).filter((n): n is string => typeof n === 'string'),
    secondaryMuscles: muscles.filter((m) => !m.is_primary).map((m) => m.muscle_region?.name).filter((n): n is string => typeof n === 'string'),
    equipment: junction.length > 0 ? junction : core,
    skillLevel: row.skill_level ?? null,
  };
}

const DESCRIBE_SYSTEM = `You write the description field for one exercise in a
personal training catalog. The reader is about to do the movement and wants
to know what it is and how to do it well.

Rules:
- One to three sentences, 40 to 600 characters, plain prose. No markdown, no
  bullets, no headings, no line breaks, no hashtags, no marketing.
- Describe THIS exercise, by its given name. Never describe a different
  movement, and never open with the name of another exercise.
- Say what the movement is (the pattern and the load), then the one or two
  cues that matter most for form. Mention the muscles it trains in passing.
- Use only the equipment and muscles given. Do not invent a rep scheme.
- Start with an action verb or with the exercise's own name.

Respond as JSON: {"description": string}`;

function describeUserPrompt(f: DescribeFacts): string {
  return [
    `Exercise: ${f.name}`,
    f.aliases.length > 0 ? `Also known as: ${f.aliases.join(', ')}` : '',
    f.category ? `Category: ${f.category}` : '',
    f.primaryMuscles.length > 0 ? `Primary muscles: ${f.primaryMuscles.join(', ')}` : '',
    f.secondaryMuscles.length > 0 ? `Secondary muscles: ${f.secondaryMuscles.join(', ')}` : '',
    `Equipment: ${f.equipment.length > 0 ? f.equipment.join(', ') : 'bodyweight'}`,
    f.skillLevel ? `Skill level: ${f.skillLevel}` : '',
  ].filter((l) => l !== '').join('\n');
}

/** The describe action: { exerciseId } or { facts } → { description }. */
async function runDescribe(body: Record<string, unknown>): Promise<Response> {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY is not configured');
  const facts = typeof body.exerciseId === 'string' && body.exerciseId !== ''
    ? await factsFromRow(body.exerciseId)
    : factsFromBody(body.facts);

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: DESCRIBE_SYSTEM },
        { role: 'user', content: describeUserPrompt(facts) },
      ],
    }),
  });
  if (!res.ok) throw new UpstreamError(res.status, await res.text());
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('empty model response');
  const parsed = JSON.parse(content);
  const description = typeof parsed?.description === 'string' ? parsed.description.trim() : '';
  return json({ description: description === '' ? null : description });
}
```

- [ ] **Step 2: Route the action, and let the service role in for it**

In the `serve` handler, replace
```ts
    if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') && body.action === 'refresh-creator') {
      return await runRefreshCreator(body);
    }
```
with
```ts
    // enrich-exercise (and the backfill script behind it) calls describe with
    // the service role; it reads catalog facts and writes nothing.
    if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
      if (body.action === 'refresh-creator') return await runRefreshCreator(body);
      if (body.action === 'describe') return await runDescribe(body);
    }
```
and directly after the `refresh-creator` branch inside the user-authenticated section (the block `if (body.action === 'refresh-creator') { return await runRefreshCreator(body); }`), add:
```ts
    if (body.action === 'describe') {
      return await runDescribe(body);
    }
```
Also update the header comment at the top of the file: after the `refresh-creator` paragraph (ending `...may only call this action.`), add
```ts
//
//   describe { exerciseId } | { facts: {name, aliases, category,
//              primaryMuscles, secondaryMuscles, equipment, skillLevel} }
//       → { description }
//       One to three sentences for a catalog exercise from its structured
//       facts, for enrich-exercise to fill an empty description. The service
//       role may call this one too (it reads catalog facts, writes nothing).
```
and change `may only call this action.` to `may call only refresh-creator and describe.`

- [ ] **Step 3: Type-check, run the existing Deno tests, deploy**

Run from the repo root:
```bash
deno check supabase/functions/capture-post/index.ts && (cd supabase/functions && deno test capture-post/creatorAvatar.test.ts) && npx supabase functions deploy capture-post
```
Expected: no type errors; the avatar suite PASSES unchanged; `Deployed Functions on project ...: capture-post`.

- [ ] **Step 4: Smoke it with the service role**

Run from `mobile/`:
```bash
set -a; . ./.env; set +a
curl -s -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/capture-post" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" -H "Content-Type: application/json" -d '{"action":"describe","facts":{"name":"Kettlebell Swing","aliases":["KB Swing"],"category":"Hinge","primaryMuscles":["Glutes","Hamstrings"],"secondaryMuscles":["Lower Back"],"equipment":["Kettlebell"],"skillLevel":"Intermediate"}}'
```
Expected: `{"description":"<one to three sentences about the kettlebell swing>"}`. Then the row path: pick any exercise id from the table and call `{"action":"describe","exerciseId":"<id>"}` — a description of that exercise comes back.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/capture-post/index.ts
git commit -m "feat(capture): describe action writes one exercise description from its catalog facts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 5: `enrich-exercise` edge function — `enrich` and `sweep`

**Files:**
- Create: `supabase/functions/enrich-exercise/index.ts`

- [ ] **Step 1: Write the function**

```ts
// supabase/functions/enrich-exercise/index.ts
// Fill-only enrichment for catalog exercises. Two actions:
//
//   enrich { exerciseId, images?: boolean, force_image?: boolean }
//       → { filled: string[], skipped: Record<string, string>, imageUrl: string | null }
//       Fills description (capture extraction, else capture-post describe),
//       video_url (the single-exercise capture's post) and image_url (the
//       shared generator) — each only when null/blank and not by="user".
//       force_image regenerates over an existing image: the ONE overwrite.
//       Any signed-in user.
//
//   sweep { images: boolean, limit: number, dryRun: boolean }
//       → { dryRun, candidates, wouldFill | filled, skipped, processed, remaining }
//       Rows with any fillable field, newest first, up to `limit`; the enrich
//       logic per row. Admin profiles only (or the service role: the backfill).
//
// Every field is its own try/catch: a failure leaves the slot empty for the
// next sweep, never fails the call. Decisions are in fill.ts (pure, tested);
// this file only reads, calls out and writes.
// Spec: docs/superpowers/specs/2026-09-11-catalog-enrichment-pipeline-design.md §5–§8
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateAndStoreImage } from '../_shared/exerciseImage.ts';
import {
  planFill, validateDescription, pickSingleExerciseSource, extractionDescriptionFor, hasWork,
} from './fill.ts';
import type { EnrichRow, Enrichment, FillPlan, RunFlags, SourceCandidate } from './fill.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? null;

const serviceClient = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const ROW_SELECT =
  'id, name, description, video_url, image_url, enrichment, is_movement, created_at, ' +
  'source_exercises(source:captured_sources(id, source_url, platform, captured_at, extraction_status, raw_extraction, captured_workouts(id)))';

/** The row as read, with its captures flattened for fill.ts. */
interface LoadedRow extends EnrichRow {
  isMovement: boolean;
  sources: SourceCandidate[];
}

// deno-lint-ignore no-explicit-any
function toLoadedRow(raw: any): LoadedRow {
  const sources: SourceCandidate[] = ((raw.source_exercises ?? []) as { source: Record<string, unknown> | null }[])
    .map((se) => se.source)
    .filter((s): s is Record<string, unknown> => !!s)
    .map((s) => ({
      sourceUrl: String(s.source_url ?? ''),
      platform: String(s.platform ?? 'other'),
      capturedAt: String(s.captured_at ?? ''),
      extractionStatus: String(s.extraction_status ?? 'pending'),
      hasWorkout: Array.isArray(s.captured_workouts) && s.captured_workouts.length > 0,
      rawExtraction: s.raw_extraction ?? null,
    }));
  return {
    id: String(raw.id),
    name: String(raw.name),
    description: raw.description ?? null,
    video_url: raw.video_url ?? null,
    image_url: raw.image_url ?? null,
    enrichment: (raw.enrichment ?? {}) as Enrichment,
    isMovement: raw.is_movement === true,
    sources,
  };
}

async function loadRow(service: SupabaseClient, exerciseId: string): Promise<LoadedRow> {
  const { data, error } = await service.from('exercises').select(ROW_SELECT).eq('id', exerciseId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('exercise not found');
  return toLoadedRow(data);
}

/** Every catalog name and alias except this row's own, for validation. */
async function otherNamesFor(service: SupabaseClient, exerciseId: string): Promise<string[]> {
  const [names, aliases] = await Promise.all([
    service.from('exercises').select('id, name'),
    service.from('exercise_aliases').select('exercise_id, alias'),
  ]);
  if (names.error) throw new Error(names.error.message);
  if (aliases.error) throw new Error(aliases.error.message);
  return [
    ...((names.data ?? []) as { id: string; name: string }[]).filter((r) => r.id !== exerciseId).map((r) => r.name),
    ...((aliases.data ?? []) as { exercise_id: string; alias: string }[]).filter((r) => r.exercise_id !== exerciseId).map((r) => r.alias),
  ];
}

async function describeViaCapturePost(exerciseId: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/capture-post`, {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'describe', exerciseId }),
  });
  const body = await res.json().catch(() => ({})) as { description?: string | null; error?: string };
  if (!res.ok) throw new Error(`describe ${res.status}: ${body.error ?? 'failed'}`);
  if (typeof body.description !== 'string' || body.description.trim() === '') throw new Error('describe returned no text');
  return body.description;
}

/** One column plus its provenance stamp, in one statement. */
async function writeField(
  service: SupabaseClient, row: LoadedRow, field: 'description' | 'video_url' | 'image_url',
  value: string, by: 'extraction' | 'model' | 'capture',
): Promise<void> {
  const enrichment: Enrichment = { ...row.enrichment, [field]: { by, at: new Date().toISOString() } };
  const { error } = await service.from('exercises').update({ [field]: value, enrichment }).eq('id', row.id);
  if (error) throw new Error(error.message);
  row.enrichment = enrichment;
  row[field] = value;
}

export interface EnrichResult {
  filled: string[];
  skipped: Record<string, string>;
  imageUrl: string | null;
}

function planFor(row: LoadedRow, flags: RunFlags, otherNames: string[]): FillPlan {
  return planFill(row, {
    extractionDescription: extractionDescriptionFor(row.sources, row.name),
    singleExerciseSourceUrl: pickSingleExerciseSource(row.sources),
  }, flags, otherNames);
}

/** Fill one row per its plan. Never throws for a field; the reason lands in skipped. */
async function enrichRow(service: SupabaseClient, row: LoadedRow, plan: FillPlan, otherNames: string[]): Promise<EnrichResult> {
  const result: EnrichResult = { filled: [], skipped: {}, imageUrl: null };

  if (plan.description) {
    try {
      const text = plan.description.text ?? await describeViaCapturePost(row.id);
      const check = validateDescription(text, row.name, otherNames);
      if (!check.ok) {
        result.skipped.description = `rejected: ${check.reason}`;
      } else {
        await writeField(service, row, 'description', check.text, plan.description.by);
        result.filled.push('description');
      }
    } catch (e) {
      result.skipped.description = e instanceof Error ? e.message : 'failed';
      console.error('enrich description', row.id, e);
    }
  } else {
    result.skipped.description = row.enrichment.description?.by === 'user' ? 'user' : 'filled';
  }

  if (plan.video_url) {
    try {
      await writeField(service, row, 'video_url', plan.video_url.url, 'capture');
      result.filled.push('video_url');
    } catch (e) {
      result.skipped.video_url = e instanceof Error ? e.message : 'failed';
      console.error('enrich video', row.id, e);
    }
  } else {
    result.skipped.video_url = row.enrichment.video_url?.by === 'user' ? 'user'
      : row.video_url && row.video_url.trim() !== '' ? 'filled'
      : 'no single-exercise capture';
  }

  if (plan.image_url) {
    try {
      if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY is not configured');
      const url = await generateAndStoreImage(service, row.id, {
        geminiApiKey: GEMINI_KEY, discipline: row.isMovement ? 'CrossFit' : null,
      });
      await writeField(service, row, 'image_url', url, 'model');
      result.filled.push('image_url');
      result.imageUrl = url;
    } catch (e) {
      result.skipped.image_url = e instanceof Error ? e.message : 'failed';
      console.error('enrich image', row.id, e);
    }
  } else {
    result.skipped.image_url = row.enrichment.image_url?.by === 'user' ? 'user'
      : row.image_url && row.image_url.trim() !== '' ? 'filled'
      : 'images off';
  }

  return result;
}

const flagsFrom = (body: Record<string, unknown>): RunFlags => ({
  images: body.images === true || body.force_image === true,
  forceImage: body.force_image === true,
});

async function runEnrich(body: Record<string, unknown>): Promise<Response> {
  const exerciseId = String(body.exerciseId ?? '').trim();
  if (!exerciseId) throw new Error('exerciseId is required');
  const service = serviceClient();
  const row = await loadRow(service, exerciseId);
  const otherNames = await otherNamesFor(service, exerciseId);
  const plan = planFor(row, flagsFrom(body), otherNames);
  return json(await enrichRow(service, row, plan, otherNames));
}

type FieldCounts = { description: number; video_url: number; image_url: number };
const zero = (): FieldCounts => ({ description: 0, video_url: 0, image_url: 0 });

async function runSweep(body: Record<string, unknown>): Promise<Response> {
  const images = body.images === true;
  const dryRun = body.dryRun === true;
  const limitRaw = Number(body.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 1000) : 20;
  const flags: RunFlags = { images, forceImage: false };
  const service = serviceClient();

  const { data, error } = await service.from('exercises').select(ROW_SELECT).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as unknown[]).map(toLoadedRow);

  // Names once for the whole sweep; each row excludes its own below.
  const [namesRes, aliasRes] = await Promise.all([
    service.from('exercises').select('id, name'),
    service.from('exercise_aliases').select('exercise_id, alias'),
  ]);
  if (namesRes.error) throw new Error(namesRes.error.message);
  if (aliasRes.error) throw new Error(aliasRes.error.message);
  const allNames = (namesRes.data ?? []) as { id: string; name: string }[];
  const allAliases = (aliasRes.data ?? []) as { exercise_id: string; alias: string }[];
  const othersFor = (id: string): string[] => [
    ...allNames.filter((r) => r.id !== id).map((r) => r.name),
    ...allAliases.filter((r) => r.exercise_id !== id).map((r) => r.alias),
  ];

  const candidates = rows
    .map((row) => ({ row, otherNames: othersFor(row.id) }))
    .map(({ row, otherNames }) => ({ row, otherNames, plan: planFor(row, flags, otherNames) }))
    .filter(({ plan }) => hasWork(plan));
  const batch = candidates.slice(0, limit);
  const remaining = candidates.length - batch.length;

  if (dryRun) {
    const wouldFill = zero();
    for (const { plan } of batch) {
      if (plan.description) wouldFill.description++;
      if (plan.video_url) wouldFill.video_url++;
      if (plan.image_url) wouldFill.image_url++;
    }
    return json({ dryRun: true, candidates: candidates.length, processed: batch.length, wouldFill, remaining });
  }

  const filled = zero();
  const skipped = zero();
  const errors: { id: string; name: string; skipped: Record<string, string> }[] = [];
  for (const { row, plan, otherNames } of batch) {
    const r = await enrichRow(service, row, plan, otherNames);
    for (const f of r.filled) filled[f as keyof FieldCounts]++;
    const failed: Record<string, string> = {};
    for (const f of ['description', 'video_url', 'image_url'] as const) {
      if (plan[f] && !r.filled.includes(f)) { skipped[f]++; failed[f] = r.skipped[f]; }
    }
    if (Object.keys(failed).length > 0) errors.push({ id: row.id, name: row.name, skipped: failed });
  }
  return json({ dryRun: false, candidates: candidates.length, processed: batch.length, filled, skipped, remaining, errors });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('missing Authorization header');
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action ?? '');

    // The backfill script holds the service role: both actions.
    const isServiceRole = token === SERVICE_ROLE_KEY;
    let isAdmin = isServiceRole;
    if (!isServiceRole) {
      const anon = createClient(SUPABASE_URL, ANON_KEY);
      const { data: userData, error: userError } = await anon.auth.getUser(token);
      if (userError || !userData?.user) throw new Error('not authenticated');
      if (action === 'sweep') {
        const { data: profile } = await serviceClient()
          .from('profiles').select('is_admin').eq('id', userData.user.id).maybeSingle();
        isAdmin = profile?.is_admin === true;
      }
    }

    if (action === 'enrich') return await runEnrich(body);
    if (action === 'sweep') {
      if (!isAdmin) return json({ error: 'sweep requires an admin profile' }, 403);
      return await runSweep(body);
    }
    throw new Error(`unknown action: ${action}`);
  } catch (e) {
    console.error('enrich-exercise:', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
```

- [ ] **Step 2: Type-check and run the Deno suites**

Run from the repo root:
```bash
deno check supabase/functions/enrich-exercise/index.ts && (cd supabase/functions && deno test enrich-exercise/fill.test.ts _shared/exerciseImage.test.ts)
```
Expected: no type errors; 17 tests pass. If `deno check` reports that `row[field] = value` cannot index `LoadedRow`, keep the assignment (the three field names are all `string | null` on `EnrichRow`) and add `// deno-lint-ignore no-explicit-any` with `(row as any)[field] = value;` — that is the only permitted `any` in the file.

- [ ] **Step 3: Deploy**

Run from the repo root: `npx supabase functions deploy enrich-exercise`
Expected: `Deployed Functions on project ...: enrich-exercise`.

- [ ] **Step 4: Smoke `enrich` on one row, images off, and prove idempotence**

Run from `mobile/`. Pick a row with no description:
```bash
set -a; . ./.env; set +a
EX=$(curl -s "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/exercises?select=id,name&description=is.null&limit=1" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE"); echo "$EX"
ID=$(echo "$EX" | sed -E 's/.*"id":"([^"]+)".*/\1/')
curl -s -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/enrich-exercise" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" -H "Content-Type: application/json" -d "{\"action\":\"enrich\",\"exerciseId\":\"$ID\"}"
curl -s -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/enrich-exercise" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" -H "Content-Type: application/json" -d "{\"action\":\"enrich\",\"exerciseId\":\"$ID\"}"
curl -s "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/exercises?select=description,video_url,enrichment&id=eq.$ID" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE"
```
Expected: first call `{"filled":["description"],"skipped":{"video_url":"no single-exercise capture","image_url":"images off"},"imageUrl":null}` (video filled too if the row has a single-exercise capture); second call `{"filled":[],"skipped":{"description":"filled",...}}`; the read shows the text and `"description":{"by":"model",...}`.

- [ ] **Step 5: Smoke `sweep` dry-run and the auth gates**

```bash
curl -s -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/enrich-exercise" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" -H "Content-Type: application/json" -d '{"action":"sweep","images":false,"limit":1000,"dryRun":true}'
curl -s -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/enrich-exercise" -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d '{"action":"sweep","images":false,"limit":1,"dryRun":true}'
```
Expected: first `{"dryRun":true,"candidates":N,"processed":N,"wouldFill":{"description":~203,"video_url":n,"image_url":0},"remaining":0}` and nothing written; second `{"error":"not authenticated"}` with status 500 (the anon key is not a user session). The admin gate for a real user is exercised on device in Task 12.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/enrich-exercise/index.ts
git commit -m "feat(enrich): enrich-exercise edge function — fill-only enrich and admin-gated sweep

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 6: `extractionPrefill.ts` and the "Create new" prefill

**Files:**
- Create: `mobile/src/lib/__tests__/extractionPrefill.test.ts`
- Create: `mobile/src/lib/extractionPrefill.ts`
- Modify: `mobile/src/lib/supabase/capture.ts` (add `fetchSourceRawExtraction`)
- Modify: `mobile/src/components/training/crossfit/CatalogItemWizard.tsx` (`initialPrefill` prop)
- Modify: `mobile/src/components/training/daily/MatchReviewSheet.tsx` ("Create new" passes the prefill)

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/src/lib/__tests__/extractionPrefill.test.ts
import { extractionPrefillFor, applyPrefillToForm, normaliseName } from "../extractionPrefill";
import type { ExtractionPrefill } from "../extractionPrefill";
import { EMPTY_WIZARD_FORM } from "../catalogWizardForm";

const raw = (exercises: unknown[]) => ({ post_type: "single_exercise", exercises, workout: null });
const swing = {
  name: "Kettlebell Swing",
  description: "Hinge at the hips and swing the bell to chest height.",
  category: "strength",
  skill_level: "Intermediate",
  primary_muscles: ["Glutes", "Hamstrings"],
  secondary_muscles: ["Lower Back"],
  equipment: ["Kettlebell"],
  library_match_id: null,
};

describe("normaliseName", () => {
  it("ignores case and spacing", () => {
    expect(normaliseName("  Kettlebell   SWING ")).toBe("kettlebell swing");
  });
});

describe("extractionPrefillFor", () => {
  it("returns the extraction's values for the reviewed name", () => {
    expect(extractionPrefillFor(raw([swing]), "Kettlebell Swing")).toEqual<ExtractionPrefill>({
      description: "Hinge at the hips and swing the bell to chest height.",
      primaryMuscles: ["Glutes", "Hamstrings"],
      secondaryMuscles: ["Lower Back"],
      equipment: ["Kettlebell"],
      skillLevel: "Intermediate",
    });
  });

  it("matches across case and spacing differences", () => {
    expect(extractionPrefillFor(raw([swing]), "kettlebell  swing")?.skillLevel).toBe("Intermediate");
    expect(extractionPrefillFor(raw([{ ...swing, name: "KETTLEBELL SWING " }]), "Kettlebell Swing")).not.toBeNull();
  });

  it("is null when the name is absent, or the extraction is not an extraction", () => {
    expect(extractionPrefillFor(raw([swing]), "Goblet Squat")).toBeNull();
    expect(extractionPrefillFor(null, "Kettlebell Swing")).toBeNull();
    expect(extractionPrefillFor("garbage", "Kettlebell Swing")).toBeNull();
    expect(extractionPrefillFor({ exercises: "nope" }, "Kettlebell Swing")).toBeNull();
  });

  it("tolerates missing or malformed fields", () => {
    expect(extractionPrefillFor(raw([{ name: "Kettlebell Swing" }]), "Kettlebell Swing")).toEqual<ExtractionPrefill>({
      description: null, primaryMuscles: [], secondaryMuscles: [], equipment: [], skillLevel: null,
    });
    expect(
      extractionPrefillFor(raw([{ ...swing, description: "   ", skill_level: "Elite", primary_muscles: [1, "Glutes"] }]), "Kettlebell Swing"),
    ).toEqual<ExtractionPrefill>({
      description: null, primaryMuscles: ["Glutes"], secondaryMuscles: ["Lower Back"], equipment: ["Kettlebell"], skillLevel: null,
    });
  });
});

describe("applyPrefillToForm", () => {
  const dict = {
    muscleRegions: [{ id: "m-glutes", name: "Glutes" }, { id: "m-hams", name: "Hamstrings" }, { id: "m-back", name: "Lower Back" }],
    equipment: [{ id: "eq-kb", name: "Kettlebell" }, { id: "eq-db", name: "Dumbbell" }],
  };
  const prefill: ExtractionPrefill = {
    description: "Hinge at the hips and swing the bell to chest height.",
    primaryMuscles: ["glutes", "Hamstrings"], secondaryMuscles: ["Lower Back", "Unknown Muscle"],
    equipment: ["kettlebell", "Rope"], skillLevel: "Intermediate",
  };

  it("maps names to ids, case-insensitively, and drops names the dictionary lacks", () => {
    const form = applyPrefillToForm(EMPTY_WIZARD_FORM, prefill, dict);
    expect(form.description).toBe("Hinge at the hips and swing the bell to chest height.");
    expect(form.primary_muscle_region_ids).toEqual(["m-glutes", "m-hams"]);
    expect(form.muscle_region_ids).toEqual(["m-glutes", "m-hams", "m-back"]);
    expect(form.equipment_ids).toEqual(["eq-kb"]);
    expect(form.skill_level).toBe("Intermediate");
  });

  it("never overwrites a field the form already has", () => {
    const touched = { ...EMPTY_WIZARD_FORM, description: "Mine.", skill_level: "Advanced" as const, equipment_ids: ["eq-db"] };
    const form = applyPrefillToForm(touched, prefill, dict);
    expect(form.description).toBe("Mine.");
    expect(form.skill_level).toBe("Advanced");
    expect(form.equipment_ids).toEqual(["eq-db"]);
    expect(form.primary_muscle_region_ids).toEqual(["m-glutes", "m-hams"]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run from `mobile/`: `npx jest src/lib/__tests__/extractionPrefill.test.ts`
Expected: FAIL, "Cannot find module '../extractionPrefill'".

- [ ] **Step 3: Write the module**

```ts
// mobile/src/lib/extractionPrefill.ts
// From a capture's stored raw extraction and the name under review, the
// values the catalog wizard should open with — so "Create new" starts from
// what the model read instead of from blanks. Pure: no I/O, no React
// Native. The raw extraction is the model's own JSON (snake_case), stored
// on captured_sources.raw_extraction before any client sanitizing.
// Spec: docs/superpowers/specs/2026-09-11-catalog-enrichment-pipeline-design.md §4, §6
import type { WizardFormData } from "./catalogWizardForm";
import type { SkillLevel } from "../types/crossfit";

export interface ExtractionPrefill {
  description: string | null;
  /** Names from the muscle_regions reference table, as the model wrote them. */
  primaryMuscles: string[];
  secondaryMuscles: string[];
  /** Names from the equipment reference table. */
  equipment: string[];
  skillLevel: SkillLevel | null;
}

/** Lower-case, trimmed, inner whitespace collapsed. */
export function normaliseName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];

const SKILLS: SkillLevel[] = ["Beginner", "Intermediate", "Advanced"];

/** The prefill for `reviewedName`, or null when the extraction does not list it. */
export function extractionPrefillFor(raw: unknown, reviewedName: string): ExtractionPrefill | null {
  if (typeof raw !== "object" || raw === null) return null;
  const exercises = (raw as { exercises?: unknown }).exercises;
  if (!Array.isArray(exercises)) return null;
  const wanted = normaliseName(reviewedName);
  for (const e of exercises) {
    if (typeof e !== "object" || e === null) continue;
    const ex = e as Record<string, unknown>;
    if (typeof ex.name !== "string" || normaliseName(ex.name) !== wanted) continue;
    const description = typeof ex.description === "string" && ex.description.trim() !== "" ? ex.description.trim() : null;
    const skill = typeof ex.skill_level === "string" ? (SKILLS.find((s) => s === ex.skill_level) ?? null) : null;
    return {
      description,
      primaryMuscles: strings(ex.primary_muscles),
      secondaryMuscles: strings(ex.secondary_muscles),
      equipment: strings(ex.equipment),
      skillLevel: skill,
    };
  }
  return null;
}

/** The two dictionaries the prefill needs, by name. */
export interface PrefillDictionaries {
  muscleRegions: { id: string; name: string }[];
  equipment: { id: string; name: string }[];
}

function idsFor(names: string[], rows: { id: string; name: string }[]): string[] {
  const byName = new Map(rows.map((r) => [normaliseName(r.name), r.id]));
  const ids: string[] = [];
  for (const n of names) {
    const id = byName.get(normaliseName(n));
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Lay the prefill onto a form. Only empty fields are filled — the person
 * may have typed before the dictionaries arrived, and a prefill must never
 * clobber a keystroke. Names the dictionaries do not know are dropped.
 */
export function applyPrefillToForm(
  form: WizardFormData, prefill: ExtractionPrefill, dict: PrefillDictionaries,
): WizardFormData {
  const next: WizardFormData = { ...form };
  if (next.description.trim() === "" && prefill.description) next.description = prefill.description;
  if (next.skill_level === null && prefill.skillLevel) next.skill_level = prefill.skillLevel;
  if (next.equipment_ids.length === 0) next.equipment_ids = idsFor(prefill.equipment, dict.equipment);
  if (next.muscle_region_ids.length === 0 && next.primary_muscle_region_ids.length === 0) {
    const primary = idsFor(prefill.primaryMuscles, dict.muscleRegions);
    const secondary = idsFor(prefill.secondaryMuscles, dict.muscleRegions).filter((id) => !primary.includes(id));
    next.primary_muscle_region_ids = primary;
    next.muscle_region_ids = [...primary, ...secondary];
  }
  return next;
}
```

- [ ] **Step 4: Run the tests**

Run from `mobile/`: `npx jest src/lib/__tests__/extractionPrefill.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Read a source's raw extraction**

In `mobile/src/lib/supabase/capture.ts`, directly above the line `export interface SaveCaptureInput {`, add:

```ts
/** The model's stored JSON for a capture (prefill material), or null. */
export async function fetchSourceRawExtraction(sourceId: string): Promise<unknown | null> {
  const { data, error } = await supabase
    .from("captured_sources")
    .select("raw_extraction")
    .eq("id", sourceId)
    .maybeSingle();
  if (error) {
    console.error("fetchSourceRawExtraction failed:", error);
    return null;
  }
  return data?.raw_extraction ?? null;
}
```

- [ ] **Step 6: Give the wizard an `initialPrefill` prop**

In `mobile/src/components/training/crossfit/CatalogItemWizard.tsx`:

Add to the imports, after the `generateExerciseImageInBackground` import line:
```ts
import { applyPrefillToForm } from '@/src/lib/extractionPrefill';
import type { ExtractionPrefill } from '@/src/lib/extractionPrefill';
```

In `CatalogItemWizardProps`, after the `initialName?: string;` line, add:
```ts
  /** Values read from the capture extraction (description, muscles,
   *  equipment, skill level) laid onto the form once the dictionaries have
   *  loaded. Create only; ignored with editId. */
  initialPrefill?: ExtractionPrefill | null;
```

Change the destructure
```ts
  isMovement, editId, initialName, onClose, onSave, onCreated,
```
to
```ts
  isMovement, editId, initialName, initialPrefill, onClose, onSave, onCreated,
```

In `loadDictionaries`, directly after the `setDictionaries({ ... });` call (the statement ending `grips, directions, supportPositions, armPositions, benchAngles,\n      });`), add:
```ts
      // The prefill needs ids for the extraction's names, so it waits for
      // the dictionaries. Only empty fields are filled (applyPrefillToForm).
      if (initialPrefill && !editId) {
        setFormData((prev) => applyPrefillToForm(prev, initialPrefill, {
          muscleRegions: muscleRegions.map((m) => ({ id: m.id, name: m.name })),
          equipment: equipment.map((e) => ({ id: e.id, name: e.name })),
        }));
      }
```

- [ ] **Step 7: "Create new" reads the extraction**

In `mobile/src/components/training/daily/MatchReviewSheet.tsx`:

Add to the imports, after the `CatalogExerciseRow` type import:
```ts
import { fetchSourceRawExtraction } from "@/src/lib/supabase/capture";
import { extractionPrefillFor } from "@/src/lib/extractionPrefill";
import type { ExtractionPrefill } from "@/src/lib/extractionPrefill";
```

After the line `const [createFor, setCreateFor] = useState<PendingMatchReview | null>(null);` add:
```ts
  /** The extraction's values for the name being created, read when "Create
   *  new" is tapped. Null when the source is gone or never listed the name. */
  const [createPrefill, setCreatePrefill] = useState<ExtractionPrefill | null>(null);

  const openCreate = async (review: PendingMatchReview) => {
    let prefill: ExtractionPrefill | null = null;
    if (review.sourceId) {
      const raw = await fetchSourceRawExtraction(review.sourceId);
      prefill = extractionPrefillFor(raw, review.rawName);
    }
    setCreatePrefill(prefill);
    setCreateFor(review);
  };
```

Change the "Create new" button's `onPress={() => setCreateFor(review)}` to `onPress={() => { openCreate(review); }}`.

In the wizard `<Modal>`, change `initialName={createFor.rawName}` to
```tsx
              initialName={createFor.rawName}
              initialPrefill={createPrefill}
```
and update the comment above the modal from `prefilled with the captured name.` to `prefilled with the captured name and the extraction's values for it.`

- [ ] **Step 8: Typecheck and run the two suites**

Run from `mobile/`: `npx tsc --noEmit -p . && npx jest src/lib/__tests__/extractionPrefill.test.ts src/lib/__tests__/catalogWizardForm.test.ts`
Expected: nothing from tsc; both PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/extractionPrefill.ts src/lib/__tests__/extractionPrefill.test.ts src/lib/supabase/capture.ts src/components/training/crossfit/CatalogItemWizard.tsx src/components/training/daily/MatchReviewSheet.tsx
git commit -m "feat(catalog): Create new opens the wizard prefilled from the capture extraction

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 7: Mobile client — `enrich.ts`, the 7-day gate, the wizard fires it, `exerciseImages.ts` wraps it

**Files:**
- Create: `mobile/src/lib/__tests__/enrichSweepGate.test.ts`
- Create: `mobile/src/lib/enrichSweepGate.ts`
- Create: `mobile/src/lib/supabase/enrich.ts`
- Modify: `mobile/src/lib/supabase/exerciseImages.ts` (rewritten as a wrapper)
- Modify: `mobile/src/components/training/crossfit/CatalogItemWizard.tsx` (fires `enrichExerciseInBackground`)

- [ ] **Step 1: Write the failing gate test**

```ts
// mobile/src/lib/__tests__/enrichSweepGate.test.ts
import { sweepIsDue, SWEEP_INTERVAL_MS, SWEEP_LAST_RUN_KEY } from "../enrichSweepGate";

const now = new Date("2026-09-11T12:00:00Z");

describe("sweepIsDue", () => {
  it("is due when nothing was recorded", () => {
    expect(sweepIsDue(null, now)).toBe(true);
    expect(sweepIsDue("", now)).toBe(true);
  });

  it("is due after seven days, not before", () => {
    expect(sweepIsDue("2026-09-04T12:00:00.001Z", now)).toBe(false);
    expect(sweepIsDue("2026-09-04T12:00:00.000Z", now)).toBe(true);
    expect(sweepIsDue("2026-08-01T00:00:00Z", now)).toBe(true);
  });

  it("treats garbage as never run", () => {
    expect(sweepIsDue("not a date", now)).toBe(true);
  });

  it("names its constants", () => {
    expect(SWEEP_INTERVAL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(SWEEP_LAST_RUN_KEY).toBe("catalog.enrichSweep.lastRun.v1");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run from `mobile/`: `npx jest src/lib/__tests__/enrichSweepGate.test.ts`
Expected: FAIL, "Cannot find module '../enrichSweepGate'".

- [ ] **Step 3: Write the gate**

```ts
// mobile/src/lib/enrichSweepGate.ts
// The periodic-sweep gate: at most once every seven days per device. Pure;
// the AsyncStorage read and write live in lib/supabase/enrich.ts.
// Spec: docs/superpowers/specs/2026-09-11-catalog-enrichment-pipeline-design.md §4, §7
export const SWEEP_LAST_RUN_KEY = "catalog.enrichSweep.lastRun.v1";
export const SWEEP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
/** The weekly run's batch cap (§4). */
export const SWEEP_BATCH_LIMIT = 20;

/** True when the last recorded run is missing, unreadable, or ≥ 7 days old. */
export function sweepIsDue(lastRunIso: string | null, now: Date): boolean {
  if (!lastRunIso) return true;
  const last = Date.parse(lastRunIso);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= SWEEP_INTERVAL_MS;
}
```

- [ ] **Step 4: Run the gate test**

Run from `mobile/`: `npx jest src/lib/__tests__/enrichSweepGate.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the client**

```ts
// mobile/src/lib/supabase/enrich.ts
// Client half of enrich-exercise. Three entry points: fire-and-forget after
// a wizard create, the page's Enrich / Regenerate image, and the weekly
// admin sweep the Training tab kicks off. None of them may block or fail a
// save: every failure here is a logged null.
// Spec: docs/superpowers/specs/2026-09-11-catalog-enrichment-pipeline-design.md §4, §6, §7
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../supabase";
import { SWEEP_BATCH_LIMIT, SWEEP_LAST_RUN_KEY, sweepIsDue } from "../enrichSweepGate";

/** enrich-exercise { action: "enrich" } response. */
export interface EnrichResult {
  /** Field names written this call: "description" | "video_url" | "image_url". */
  filled: string[];
  /** Field name → why it was not written ("user", "filled", "images off", a reason). */
  skipped: Record<string, string>;
  /** The new picture's public URL when image_url was filled this call. */
  imageUrl: string | null;
}

export interface EnrichOptions {
  /** Generate a picture for an empty slot. Default false. */
  images?: boolean;
  /** Regenerate over an existing picture — the only overwrite. Implies images. */
  forceImage?: boolean;
}

/** Fill this row's empty fields. Null on any failure. */
export async function enrichExercise(exerciseId: string, opts: EnrichOptions = {}): Promise<EnrichResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke("enrich-exercise", {
      body: {
        action: "enrich",
        exerciseId,
        images: opts.images === true || opts.forceImage === true,
        force_image: opts.forceImage === true,
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return {
      filled: Array.isArray(data?.filled) ? data.filled : [],
      skipped: data?.skipped && typeof data.skipped === "object" ? data.skipped : {},
      imageUrl: typeof data?.imageUrl === "string" ? data.imageUrl : null,
    };
  } catch (e) {
    console.error("enrich failed:", e);
    return null;
  }
}

/**
 * Fire-and-forget after a wizard create: description, video and image for
 * the new row, with the phone returning to what it was doing. The row
 * exists either way; the page picks the fills up on its next open.
 */
export function enrichExerciseInBackground(exerciseId: string): void {
  void enrichExercise(exerciseId, { images: true }).catch((err) => {
    console.error("Background enrichment failed:", err);
  });
}

export interface SweepOptions {
  images: boolean;
  limit: number;
  dryRun: boolean;
}

/** enrich-exercise { action: "sweep" } response, both modes. */
export interface SweepSummary {
  dryRun: boolean;
  /** Rows with at least one fillable field, before the limit. */
  candidates: number;
  processed: number;
  remaining: number;
  /** Dry run only. */
  wouldFill?: { description: number; video_url: number; image_url: number };
  /** Real run only. */
  filled?: { description: number; video_url: number; image_url: number };
  skipped?: { description: number; video_url: number; image_url: number };
}

/** Run a sweep. Admin only (the function refuses others). Null on failure. */
export async function runEnrichSweep(opts: SweepOptions): Promise<SweepSummary | null> {
  try {
    const { data, error } = await supabase.functions.invoke("enrich-exercise", {
      body: { action: "sweep", images: opts.images, limit: opts.limit, dryRun: opts.dryRun },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data as SweepSummary;
  } catch (e) {
    console.error("enrich sweep failed:", e);
    return null;
  }
}

/** The signed-in user's admin flag; false when signed out or on any error. */
async function currentUserIsAdmin(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    return data?.is_admin === true;
  } catch {
    return false;
  }
}

/**
 * The periodic self-heal (§4): images on, 20 rows, at most once every seven
 * days per device, only from an admin's device. Returns true when a sweep
 * ran. Never throws.
 */
export async function maybeRunWeeklySweep(now: Date = new Date()): Promise<boolean> {
  try {
    if (!(await currentUserIsAdmin())) return false;
    let lastRun: string | null = null;
    try {
      lastRun = await AsyncStorage.getItem(SWEEP_LAST_RUN_KEY);
    } catch (e) {
      console.warn("enrich sweep gate read failed:", e);
    }
    if (!sweepIsDue(lastRun, now)) return false;
    // Stamp before running so a slow or failed sweep is not retried on every
    // tab open; the next attempt is a week away either way.
    try {
      await AsyncStorage.setItem(SWEEP_LAST_RUN_KEY, now.toISOString());
    } catch (e) {
      console.warn("enrich sweep gate write failed:", e);
    }
    const summary = await runEnrichSweep({ images: true, limit: SWEEP_BATCH_LIMIT, dryRun: false });
    if (summary) console.log("weekly enrich sweep:", JSON.stringify(summary));
    return summary !== null;
  } catch (e) {
    console.error("weekly enrich sweep failed:", e);
    return false;
  }
}
```

- [ ] **Step 6: `exerciseImages.ts` becomes a wrapper**

Replace the entire contents of `mobile/src/lib/supabase/exerciseImages.ts` with:

```ts
// Generated exercise pictures — now a thin wrapper over enrich-exercise with
// force_image, so the workout session's tap-to-generate keeps working while
// the server owns the prompt and the bucket. The catalog wizard no longer
// calls this: it fires enrichExerciseInBackground (lib/supabase/enrich.ts),
// which fills the picture with everything else.
import { enrichExercise } from "./enrich";

/** Generate the picture and return its public URL, or null on any failure. */
export async function generateExerciseImage(
  exerciseId: string,
  _userId: string,
): Promise<string | null> {
  const result = await enrichExercise(exerciseId, { forceImage: true });
  if (!result) return null;
  if (result.imageUrl) return result.imageUrl;
  console.error("Image generation failed:", result.skipped.image_url ?? result);
  return null;
}

/** A row wants a generated picture only when nobody supplied one. */
export function needsGeneratedImage(row: { image_url: string | null }): boolean {
  return !row.image_url || row.image_url.trim() === "";
}
```

The module graph now reaches AsyncStorage through `./enrich`, which Jest's node environment cannot load. In `mobile/src/lib/__tests__/exerciseImages.test.ts`, directly after the line `jest.mock("../supabase", () => ({ supabase: {} }));`, add:
```ts
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
```

- [ ] **Step 7: The wizard fires enrichment after create**

In `mobile/src/components/training/crossfit/CatalogItemWizard.tsx`:

Replace the import line
```ts
import { generateExerciseImageInBackground } from '@/src/lib/supabase/exerciseImages';
```
with
```ts
import { enrichExerciseInBackground } from '@/src/lib/supabase/enrich';
```

Replace
```ts
        // A new exercise should arrive with a picture. Fire-and-forget: the
        // row exists either way, and the list picks the URL up on its next
        // load.
        generateExerciseImageInBackground(row, user.id);
```
with
```ts
        // A new exercise should arrive with a description, a demo video and
        // a picture. Fire-and-forget: the row exists either way, and the
        // page picks the fills up on its next open.
        enrichExerciseInBackground(row.id);
```

- [ ] **Step 8: Typecheck and the full suite**

Run from `mobile/`: `npx tsc --noEmit -p . && npx jest && grep -rn "generateExerciseImageInBackground" src app; echo "grep exit $?"`
Expected: nothing from tsc; all suites PASS (`exerciseImages.test.ts` with its two mocks included); the grep prints no matches (exit 1).

- [ ] **Step 9: Commit**

```bash
git add src/lib/enrichSweepGate.ts src/lib/__tests__/enrichSweepGate.test.ts src/lib/supabase/enrich.ts src/lib/supabase/exerciseImages.ts src/lib/__tests__/exerciseImages.test.ts src/components/training/crossfit/CatalogItemWizard.tsx
git commit -m "feat(catalog): enrich client, weekly-sweep gate; the wizard enriches after create; image generation wraps enrich

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The update path writes `by: "user"` (TDD)

**Files:**
- Create: `mobile/src/lib/__tests__/exerciseEnrichment.test.ts`
- Create: `mobile/src/lib/exerciseEnrichment.ts`
- Modify: `mobile/src/lib/supabase/frontDoor.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/src/lib/__tests__/exerciseEnrichment.test.ts
import { provenanceAfterPatch, withoutProvenance } from "../exerciseEnrichment";
import type { ExerciseEnrichment } from "../exerciseEnrichment";

const AT = "2026-09-11T10:00:00.000Z";
const NOW = "2026-09-11T11:00:00.000Z";
const current = { description: "Model text.", video_url: null, image_url: "https://x/old.png" };
const prov: ExerciseEnrichment = {
  description: { by: "model", at: AT },
  image_url: { by: "model", at: AT },
};

describe("provenanceAfterPatch", () => {
  it("returns null when the patch touches none of the three fields", () => {
    expect(provenanceAfterPatch(prov, current, { skill_level: "Beginner" }, NOW)).toBeNull();
  });

  it("stamps by=user for a field changed to a non-empty value", () => {
    expect(provenanceAfterPatch(prov, current, { description: "My own words." }, NOW)).toEqual({
      description: { by: "user", at: NOW },
      image_url: { by: "model", at: AT },
    });
    expect(provenanceAfterPatch(prov, current, { video_url: "https://youtu.be/1" }, NOW)).toEqual({
      ...prov,
      video_url: { by: "user", at: NOW },
    });
  });

  it("leaves an unchanged echo alone — the wizard round-trips every field on save", () => {
    expect(provenanceAfterPatch(prov, current, { description: "Model text.", image_url: "https://x/old.png" }, NOW)).toBeNull();
  });

  it("clears the key when a field is blanked (blank means fill this again)", () => {
    expect(provenanceAfterPatch(prov, current, { description: null }, NOW)).toEqual({
      image_url: { by: "model", at: AT },
    });
    expect(provenanceAfterPatch(prov, current, { image_url: "" }, NOW)).toEqual({
      description: { by: "model", at: AT },
    });
  });

  it("blanking an already-empty field with no key is a no-op", () => {
    expect(provenanceAfterPatch(prov, current, { video_url: null }, NOW)).toBeNull();
  });
});

describe("withoutProvenance", () => {
  it("drops one key and keeps the rest", () => {
    expect(withoutProvenance(prov, "image_url")).toEqual({ description: { by: "model", at: AT } });
    expect(withoutProvenance({}, "image_url")).toEqual({});
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run from `mobile/`: `npx jest src/lib/__tests__/exerciseEnrichment.test.ts`
Expected: FAIL, "Cannot find module '../exerciseEnrichment'".

- [ ] **Step 3: Write the module**

```ts
// mobile/src/lib/exerciseEnrichment.ts
// The exercises.enrichment provenance object as the phone sees it, and the
// one rule the front door applies on update: a person's non-empty value
// stamps by="user" (the pipeline never touches it again); blanking a field
// drops its key (the pipeline may fill it again); an unchanged echo leaves
// whatever stamp is there. Pure.
// Spec: docs/superpowers/specs/2026-09-11-catalog-enrichment-pipeline-design.md §5
export type EnrichmentBy = "user" | "extraction" | "model" | "capture";
export type EnrichableField = "description" | "video_url" | "image_url";
export interface EnrichmentStamp { by: EnrichmentBy; at: string }
export type ExerciseEnrichment = Partial<Record<EnrichableField, EnrichmentStamp>>;

export const ENRICHABLE_FIELDS: EnrichableField[] = ["description", "video_url", "image_url"];

const norm = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export function withoutProvenance(prov: ExerciseEnrichment, field: EnrichableField): ExerciseEnrichment {
  const next = { ...prov };
  delete next[field];
  return next;
}

/**
 * The provenance object to write alongside a column patch, or null when
 * the patch leaves provenance as it is. `current` is the row before the
 * patch; only the three enrichable keys of `patch` are read.
 */
export function provenanceAfterPatch(
  prov: ExerciseEnrichment,
  current: Record<EnrichableField, string | null>,
  patch: Partial<Record<EnrichableField, string | null>> & Record<string, unknown>,
  nowIso: string,
): ExerciseEnrichment | null {
  let next: ExerciseEnrichment = { ...prov };
  let changed = false;
  for (const field of ENRICHABLE_FIELDS) {
    if (patch[field] === undefined) continue;
    const before = norm(current[field]);
    const after = norm(patch[field]);
    if (after === before) continue;
    if (after === null) {
      if (next[field] !== undefined) { next = withoutProvenance(next, field); changed = true; }
    } else {
      next = { ...next, [field]: { by: "user", at: nowIso } };
      changed = true;
    }
  }
  return changed ? next : null;
}
```

- [ ] **Step 4: Run the tests**

Run from `mobile/`: `npx jest src/lib/__tests__/exerciseEnrichment.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Wire it into the front door**

In `mobile/src/lib/supabase/frontDoor.ts`:

Add after the existing `import type { SkillLevel } from '../../types/crossfit';` line:
```ts
import { provenanceAfterPatch, withoutProvenance } from '../exerciseEnrichment';
import type { ExerciseEnrichment } from '../exerciseEnrichment';
```

In `CatalogExerciseRow`, after `image_url: string | null;` add:
```ts
  /** Provenance for description / video_url / image_url (lib/exerciseEnrichment). */
  enrichment: ExerciseEnrichment;
```

In `ROW_COLUMNS`, change `'image_url, load_position_id, stance_id, range_depth_id, symmetry_id, ' +` to `'image_url, enrichment, load_position_id, stance_id, range_depth_id, symmetry_id, ' +`.

In `updateCatalogExercise`, directly after the line `if (patch.image_url !== undefined) cols.image_url = patch.image_url;`, add:
```ts
  // Provenance (§5): a person's non-empty value is by="user" forever; a
  // blanked field drops its key so the pipeline may fill it again; an
  // unchanged echo (the wizard round-trips all three) changes nothing.
  const nextProvenance = provenanceAfterPatch(
    current.enrichment ?? {},
    { description: current.description, video_url: current.video_url, image_url: current.image_url },
    patch,
    new Date().toISOString(),
  );
  if (nextProvenance !== null) cols.enrichment = nextProvenance;
```

In the stale-image invalidation near the end of `updateCatalogExercise`, replace
```ts
    const { error: imgErr } = await supabase
      .from('exercises')
      .update({ image_url: null })
      .eq('id', id)
      .select('id')
      .maybeSingle();
```
with
```ts
    // The key goes with the picture: blank means the pipeline may fill it.
    const { error: imgErr } = await supabase
      .from('exercises')
      .update({ image_url: null, enrichment: withoutProvenance(finalRow.enrichment ?? {}, 'image_url') })
      .eq('id', id)
      .select('id')
      .maybeSingle();
```
and change the following `finalRow = { ...finalRow, image_url: null };` to
```ts
      finalRow = { ...finalRow, image_url: null, enrichment: withoutProvenance(finalRow.enrichment ?? {}, 'image_url') };
```

- [ ] **Step 6: Typecheck and the full suite**

Run from `mobile/`: `npx tsc --noEmit -p . && npx jest`
Expected: nothing from tsc; all suites PASS. If tsc reports a `CatalogExerciseRow` literal somewhere missing `enrichment`, add `enrichment: {}` to that literal — do not make the field optional.

- [ ] **Step 7: Commit**

```bash
git add src/lib/exerciseEnrichment.ts src/lib/__tests__/exerciseEnrichment.test.ts src/lib/supabase/frontDoor.ts
git commit -m "feat(catalog): the update path stamps by=user and clears provenance on blank for description, video and image

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 9: Page menu — "Enrich" and "Regenerate image"; the client prompt builder goes

**Files:**
- Modify: `mobile/src/components/training/item-detail/TrainingItemDetailScreen.tsx`
- Modify: `mobile/app/(tabs)/training/movement/[id].tsx`

Note: the "Find a demo ›" link in the Demo Video section (spec §4) belongs to the page-v2 plan (`docs/superpowers/specs/2026-09-11-exercise-detail-page-v2-design.md`). Do NOT add it here; the section stays as it is.

- [ ] **Step 1: Drop the `discipline` prop**

In `TrainingItemDetailScreen.tsx`, delete from `TrainingItemDetailScreenProps` the whole `discipline?: string;` member together with its doc comment (the block from `/**\n   * Flavours the generated photo` through `discipline?: string;`). Update the header comment's line `the word on screen, which tab the hierarchy links stay inside, and whether the AI photo prompt says "CrossFit". Those` to `the word on screen and which tab the hierarchy links stay inside (the server picks the photo's discipline from is_movement). Those`. Change the destructure
```ts
  noun,
  nounPlural,
  routeBase,
  discipline,
}: TrainingItemDetailScreenProps) {
```
to
```ts
  noun,
  nounPlural,
  routeBase,
}: TrainingItemDetailScreenProps) {
```

In `mobile/app/(tabs)/training/movement/[id].tsx`, delete the line `      discipline="CrossFit"`.

- [ ] **Step 2: Swap the imports**

In `TrainingItemDetailScreen.tsx`, add after the `fetchExerciseSources` import:
```ts
import { enrichExercise } from '@/src/lib/supabase/enrich';
```
`equipmentNamesOf` stays imported (the equipment chips use it); `aliasNamesOf` stays (the "Also known as" section uses it).

- [ ] **Step 3: Replace the menu and the generator**

Replace the whole `handleMenuPress` function and the whole `handleGenerateImage` function (from `const handleMenuPress = () => {` through the closing `};` of `handleGenerateImage`) with:

```ts
  const handleMenuPress = () => {
    if (!item) return;

    Alert.alert(
      `${capitalize(noun)} Options`,
      'Choose an action',
      [
        {
          text: `Edit ${capitalize(noun)}`,
          onPress: () => setEditVisible(true),
        },
        {
          text: 'Enrich',
          onPress: () => { handleEnrich(false); },
        },
        {
          text: 'Regenerate Image',
          onPress: () => { handleEnrich(true); },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  /** A field name as the alert says it. */
  const fieldLabel = (field: string) =>
    field === 'description' ? 'description' : field === 'video_url' ? 'demo video' : 'image';

  /**
   * Enrich fills whatever is empty (description, demo video, picture) and
   * never touches a value a person set. Regenerate image is the one
   * overwrite: a fresh picture over the existing one. The server owns the
   * prompt; the phone sends an id and a flag.
   */
  const handleEnrich = async (forceImage: boolean) => {
    if (!item) return;

    try {
      setGenerating(true);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert('Error', 'You must be logged in to do that');
        return;
      }

      // Regenerating spends an image credit on a picture that already exists:
      // only the creator of a custom item, or an admin for official ones.
      if (forceImage) {
        const canGenerate = isAdmin || (!item.is_official && item.created_by === user.id);
        if (!canGenerate) {
          Alert.alert(
            'Permission Denied',
            item.is_official
              ? `Only administrators can regenerate images for official ${nounPlural}.`
              : `You can only regenerate images for ${nounPlural} you created.`
          );
          return;
        }
      }

      const result = await enrichExercise(item.id, { images: true, forceImage });
      if (!result) {
        Alert.alert('Error', forceImage ? 'Image generation failed. Please try again.' : 'Enrichment failed. Please try again.');
        return;
      }

      if (forceImage && !result.imageUrl) {
        Alert.alert('Error', result.skipped.image_url ?? 'Image generation failed');
        return;
      }

      const message = result.filled.length === 0
        ? 'Nothing was empty — every field already has a value.'
        : `Filled: ${result.filled.map(fieldLabel).join(', ')}.`;
      Alert.alert(forceImage ? 'Image regenerated' : 'Enriched', message, [
        { text: 'OK', onPress: () => loadItem() },
      ]);
    } catch (error: any) {
      console.error('Error enriching item:', error);
      const errorMessage = error?.message || 'Something went wrong. Please try again.';
      Alert.alert('Error', errorMessage);
    } finally {
      setGenerating(false);
    }
  };
```

- [ ] **Step 4: The hero placeholder's button fills an empty slot**

In the hero placeholder (the `<TouchableOpacity style={styles.generateButton} ...>`), change `onPress={handleGenerateImage}` to `onPress={() => { handleEnrich(true); }}`. (The slot is empty there, so "force" only means "generate now".)

- [ ] **Step 5: Typecheck, then prove the client prompt is gone**

Run from `mobile/`: `npx tsc --noEmit -p . && grep -rn "generate-movement-image\|Photorealistic\|handleGenerateImage\|discipline" src/components/training/item-detail app/\(tabs\)/training; echo "grep exit $?"`
Expected: nothing from tsc; the grep prints no matches (exit 1).

- [ ] **Step 6: Commit**

```bash
git add src/components/training/item-detail/TrainingItemDetailScreen.tsx "app/(tabs)/training/movement/[id].tsx"
git commit -m "feat(catalog): page menu gets Enrich and Regenerate image; the client image prompt is deleted

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Delete `generate-movement-image`; the Training tab runs the weekly sweep

**Files:**
- Delete: `supabase/functions/generate-movement-image/index.ts`
- Modify: `mobile/app/(tabs)/training/index.tsx`

- [ ] **Step 1: Confirm nothing calls the old function**

Run from the repo root: `grep -rn "generate-movement-image" mobile/src mobile/app supabase/functions scripts; echo "grep exit $?"`
Expected: no matches (exit 1). (Task 9 removed the only caller.)

- [ ] **Step 2: Delete it, locally and remotely**

Run from the repo root:
```bash
git rm -r supabase/functions/generate-movement-image
npx supabase functions delete generate-movement-image
```
Expected: the directory is staged for deletion; the CLI reports the function deleted from the project (if it says the function does not exist remotely, that is also fine). The `movement-images` bucket is NOT touched: existing `image_url` values point into it and keep working.

- [ ] **Step 3: The Training tab kicks off the weekly sweep**

In `mobile/app/(tabs)/training/index.tsx`:

Add after the line `import { fetchCapturedWorkouts, fetchCatalog } from "@/src/lib/supabase/capture";`:
```ts
import { maybeRunWeeklySweep } from "@/src/lib/supabase/enrich";
```

Inside `Training()`, directly after the `useEffect` that consumes `shareUrl` (the block ending `  }, [shareUrl, router]);`), add:
```ts
  // The catalog's periodic self-heal: once every seven days per device, from
  // an admin's device only, twenty rows with images on. Fire-and-forget on
  // the tab's first mount — the gate inside decides whether anything runs.
  useEffect(() => {
    maybeRunWeeklySweep().catch(console.error);
  }, []);
```

- [ ] **Step 4: Typecheck**

Run from `mobile/`: `npx tsc --noEmit -p .`
Expected: nothing.

- [ ] **Step 5: Commit**

Run from `mobile/` (the `git rm` above already staged the deletion; the first path only keeps the command honest if it did not):
```bash
git add -A ../supabase/functions/generate-movement-image "app/(tabs)/training/index.tsx"
git commit -m "feat(catalog): weekly enrich sweep from the Training tab; generate-movement-image deleted

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 11: One-time backfill — dry run, then real, images off

**Files:**
- Create: `scripts/enrich-backfill.ts`
- Modify: this plan (record the two counts in Step 3 and Step 4)

- [ ] **Step 1: Write the script**

```ts
// Fill every empty description and demo video in the catalog, once. Calls
// enrich-exercise's sweep with images OFF (decision 5: no image backfill):
// first a dry run that only counts, then — unless --dry-run was passed —
// batches of 25 until the function reports nothing remaining. Idempotent:
// a second run finds nothing to fill.
//
// Run from repo root:
//   deno run --allow-net --allow-read scripts/enrich-backfill.ts            # dry run, then real
//   deno run --allow-net --allow-read scripts/enrich-backfill.ts --dry-run  # counts only
// Reads mobile/.env (EXPO_PUBLIC_SUPABASE_URL, SERVICE_ROLE).
const envText = await Deno.readTextFile(new URL('../mobile/.env', import.meta.url));
const env: Record<string, string> = {};
for (const line of envText.split('\n')) {
  const i = line.indexOf('=');
  if (i > 0 && !line.startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const BASE = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.SERVICE_ROLE;
if (!BASE || !KEY) {
  console.error('mobile/.env needs EXPO_PUBLIC_SUPABASE_URL and SERVICE_ROLE');
  Deno.exit(1);
}
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const dryRunOnly = Deno.args.includes('--dry-run');
const BATCH = 25;

type Counts = { description: number; video_url: number; image_url: number };
interface SweepResponse {
  dryRun: boolean;
  candidates: number;
  processed: number;
  remaining: number;
  wouldFill?: Counts;
  filled?: Counts;
  skipped?: Counts;
  errors?: { id: string; name: string; skipped: Record<string, string> }[];
  error?: string;
}

async function sweep(limit: number, dryRun: boolean): Promise<SweepResponse> {
  const res = await fetch(`${BASE}/functions/v1/enrich-exercise`, {
    method: 'POST', headers,
    body: JSON.stringify({ action: 'sweep', images: false, limit, dryRun }),
  });
  const body = await res.json().catch(() => ({})) as SweepResponse;
  if (!res.ok || body.error) throw new Error(`sweep ${res.status}: ${body.error ?? 'failed'}`);
  return body;
}

const fmt = (c: Counts | undefined) =>
  c ? `${c.description} descriptions, ${c.video_url} videos, ${c.image_url} images` : '-';

// 1. Dry run: what a full sweep would touch.
const dry = await sweep(1000, true);
console.log(`dry run: ${dry.candidates} rows with something to fill; would fill ${fmt(dry.wouldFill)}`);
if (dryRunOnly) Deno.exit(0);

// 2. Real run, batched so one slow model call cannot time the function out.
const total: Counts = { description: 0, video_url: 0, image_url: 0 };
const skippedTotal: Counts = { description: 0, video_url: 0, image_url: 0 };
let processed = 0;
let batchNo = 0;
let remaining = dry.candidates;
// A row whose description keeps failing validation is re-selected every
// batch; the loop stops when a batch fills nothing rather than spinning.
while (remaining > 0) {
  batchNo++;
  const r = await sweep(BATCH, false);
  processed += r.processed;
  for (const f of ['description', 'video_url', 'image_url'] as const) {
    total[f] += r.filled?.[f] ?? 0;
    skippedTotal[f] += r.skipped?.[f] ?? 0;
  }
  console.log(`batch ${batchNo}: processed ${r.processed}, filled ${fmt(r.filled)}, skipped ${fmt(r.skipped)}, remaining ${r.remaining}`);
  for (const e of r.errors ?? []) console.log(`  skip ${e.name} (${e.id}): ${JSON.stringify(e.skipped)}`);
  const filledThisBatch = (r.filled?.description ?? 0) + (r.filled?.video_url ?? 0) + (r.filled?.image_url ?? 0);
  remaining = r.remaining;
  if (filledThisBatch === 0) {
    console.log('batch filled nothing; stopping (the rows left are retried by the weekly sweep)');
    break;
  }
}
console.log(`done: processed ${processed} rows; filled ${fmt(total)}; skipped ${fmt(skippedTotal)}`);
```

- [ ] **Step 2: Type-check the script**

Run from the repo root: `deno check scripts/enrich-backfill.ts`
Expected: no errors.

- [ ] **Step 3: Dry run against the live database**

Run from the repo root: `deno run --allow-net --allow-read scripts/enrich-backfill.ts --dry-run`
Expected: one line, e.g. `dry run: 204 rows with something to fill; would fill 203 descriptions, 9 videos, 0 images` (images must be 0). Nothing is written.

**Record the dry-run line here (spec §9):** `dry run: ___ rows with something to fill; would fill ___ descriptions, ___ videos, 0 images`

- [ ] **Step 4: The real run**

Run from the repo root: `deno run --allow-net --allow-read scripts/enrich-backfill.ts`
Expected: the dry-run line again, then one line per batch of 25 (each takes a minute or two: one model call per description), then `done: processed N rows; filled D descriptions, V videos, 0 images; skipped ...`. Any `skip <name>` lines name a description the validator rejected; those rows stay empty for the weekly sweep to retry.

**Record the done line here (spec §9):** `done: processed ___ rows; filled ___ descriptions, ___ videos, 0 images; skipped ___`

- [ ] **Step 5: Prove idempotence and spot-check three rows**

Run from the repo root: `deno run --allow-net --allow-read scripts/enrich-backfill.ts --dry-run`
Expected: `dry run: R rows ...; would fill 0 descriptions, 0 videos, 0 images` where R is the count of rows whose description was rejected in Step 4 (0 when none were). Then from `mobile/`:
```bash
set -a; . ./.env; set +a; curl -s "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/exercises?select=name,description,video_url,enrichment&enrichment->description->>by=eq.model&limit=3" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE"
```
Read the three descriptions: each describes its own row's movement in one to three plain sentences. If one describes a different movement, note the name in the task report; do not hand-fix rows here.

- [ ] **Step 6: Commit the script and the recorded counts**

```bash
git add scripts/enrich-backfill.ts docs/superpowers/plans/2026-09-11-catalog-enrichment-pipeline.md
git commit -m "feat(catalog): enrich backfill script; descriptions and videos backfilled once (images off)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Device walk, spec status, merge to main

**Files:**
- Modify: `docs/superpowers/specs/2026-09-11-catalog-enrichment-pipeline-design.md` (Status line)

- [ ] **Step 1: Run the app on the isolated simulator**

Boot `FitTracker-walk3` (UDID `883E9323-DFCB-4B68-BE22-A0A45836206F`; it has the dev client installed and Brian signed in). No native modules changed in this plan, so no dev-client rebuild. Start Metro from `mobile/` with `npx expo start --dev-client --port 8097 --clear` in the background, then `xcrun simctl openurl 883E9323-DFCB-4B68-BE22-A0A45836206F "fittracker-local://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8097"` and tap Open at device points (275, 473) with idb. Drive with `idb ui tap` and `xcrun simctl io <udid> screenshot`.

- [ ] **Step 2: Walk the spec's list (§9)**

Training › Exercises. Confirm, with a screenshot for each:
1. Capture a single-exercise post (paste an Instagram or TikTok link to one movement whose name is not in the catalog) through the + button; save the review. The "captured names need review" banner appears.
2. Open the banner › the review card › "Create new". The wizard opens with the captured name AND: Step 1 shows the extraction's description in the description field; Step 2 shows its skill level and muscles ticked (primary marked); Step 3 shows its equipment ticked. Save it.
3. Open the new exercise's page. Within a minute (pull back and reopen the page if needed) it shows: the description; a Demo Video section whose "Watch Video" opens the captured post; a hero image.
4. Overflow menu › Enrich: alert says "Nothing was empty — every field already has a value." (idempotent).
5. Overflow menu › Edit › paste `https://www.youtube.com/watch?v=dQw4w9WgXcQ` into the video field, save. Menu › Enrich again. Reopen the page: the video is still the YouTube link (by=user is untouched). Confirm from a terminal that `enrichment->video_url->>by` is `user` for the row.
6. Overflow menu › Regenerate Image on the same row: alert "Image regenerated", and after OK the hero shows a different picture.
7. Edit the exercise again and blank the description field, save; Menu › Enrich: alert "Filled: description." and the page shows a fresh model description (blank means fill again).
8. Restart the app (kill and relaunch through the dev-client link) with the signed-in admin account: Metro's log shows `weekly enrich sweep: {...}` once; a second relaunch shows no sweep line (the 7-day gate). Because the sweep runs with images on, up to 20 image-less rows now have pictures — that is the spec's intended behaviour, not a bug.
9. Workouts tab › any captured workout › a movement › its page: no "Generate Image" regression — the placeholder button still generates.

- [ ] **Step 3: Mark the spec**

Change the spec's `**Status:**` line to `**Status:** Implemented and device-verified 2026-09-11 (plan: docs/superpowers/plans/2026-09-11-catalog-enrichment-pipeline.md)`.

- [ ] **Step 4: Full verification before merging**

Run from `mobile/`: `npx tsc --noEmit -p . && npx jest`
Run from `supabase/functions`: `deno test enrich-exercise/fill.test.ts _shared/exerciseImage.test.ts capture-post/creatorAvatar.test.ts`
Expected: nothing from tsc; every suite PASS.

- [ ] **Step 5: Commit, merge to main, push**

```bash
git add docs/superpowers/specs/2026-09-11-catalog-enrichment-pipeline-design.md
git commit -m "docs(catalog): enrichment pipeline spec marked device-verified

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git checkout main
git merge --no-ff catalog-enrichment -m "Merge catalog-enrichment: fill-only enrichment pipeline, extraction prefill, one image generator

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push origin main
git branch -d catalog-enrichment
```

Stop Metro and shut the simulator down afterwards.
