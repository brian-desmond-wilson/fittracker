# Stage 6 — Retire Legacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop every legacy catalog structure (spec Phase 7), close the parent-candidacy hardening hole, curate skill/scoring on the whole catalog, and land the two exit-gate UI follow-ups.

**Architecture:** App and edge code move off the legacy columns FIRST (they work against both schemas), then two migrations land: a hardening pass on the engine's parent selection, then the drop itself. Curation is data-only (cores get authored values, derivations inherit by backfill) and gates on Brian's approval of a sheet. Every live push follows the house gate: staging rehearsal → user says "push".

**Tech Stack:** Expo/React Native, Supabase (Postgres + PostgREST + edge functions), plpgsql engine triggers, jest, REST probe scripts.

**House rules that bind every task:** no PRs — commit to main; commits end `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; never edit `mobile/.env`; staging DB is `postgresql://postgres:postgres@127.0.0.1:56322/postgres` (543xx ports are a DIFFERENT project); live pushes only via `supabase db push` after staging rehearsal AND explicit user "push"; user tests app changes on device before app-code commits are considered verified.

---

## Context for a zero-context engineer

The movement model (Stages 1–5, all LIVE) made every exercise derive from a core movement plus identity attributes. A trigger-maintained fingerprint (`exercises.identity_fingerprint`) plus UNIQUE constraint `exercises_fingerprint_key (core_movement_id, identity_fingerprint)` makes duplicates impossible. The engine functions (`recompute_exercise_identity_row` worker, `recompute_exercise_identity` orchestrator) live in `supabase/migrations/20260909100000_turn_the_locks.sql` (worker, lines 117–209) and `supabase/migrations/20260910100000_renormalize_and_policies.sql` (orchestrator + triggers). The app writes the catalog ONLY through `mobile/src/lib/supabase/frontDoor.ts`.

**Legacy structures being dropped** (spec Phase 7, authoritative wording at `docs/superpowers/specs/2026-08-24-movement-model-redesign-design.md:99`):

| Structure | Kind | Canonical replacement (survives) |
|---|---|---|
| `exercises.goal_type_id` | column | `exercise_goal_types` junction |
| `exercises.movement_style_id` | column | `exercise_movement_styles` junction |
| `exercises.equipment_types` | text[] column | `exercise_equipment` junction + `equipment` table |
| `exercises.aliases` | text[] column | `exercise_aliases` table |
| `exercise_planes_of_motion` | junction table | `exercises.plane_of_motion_id` FK column |
| `exercise_load_positions` | junction table | `exercises.load_position_id` FK column |
| `exercise_stances` | junction table | `exercises.stance_id` FK column |
| `exercise_variations`, `variation_options`, `variation_categories` | tables | derivation hierarchy (children of a core) |

**Sweep results (2026-09-09, exhaustive):** No DB view, trigger, or surviving function references any drop target (the engine's only "aliases" reference is the surviving `exercise_aliases` table). Exactly ONE edge function breaks: `generate-exercise-image` reads `equipment_types`. The `exercises.aliases` column has zero remaining app reads/writes. `movement_style_id` on exercises is type-declaration-only in the app. The heavy app work is: `frontDoor.ts` (ROW_COLUMNS + legacy-compat writes, already comment-labeled "until Stage 6"), eleven `goal_type:goal_types(*)` PostgREST embeds that resolve THROUGH the doomed FK column (dropping the column 400s the embed — these don't contain the string `goal_type_id`, so naive greps miss them), and the dead variations UI (six embeds + two fetchers + one detail-screen section).

**Verification tooling:** `scripts/movement-model/verify_foundation.sql` (harness V0–V11; its V7 currently asserts the legacy structures still EXIST and must be inverted in the drop task). Four REST probe suites in `scripts/movement-model/`: `probe_front_door.sh`, `probe_wizard_payload.sh`, `probe_reads.sh`, `probe_capture.sh` — run against staging (they read env from the script header; never source the repo-root `.env`, it is dead web leftovers). Jest: `cd mobile && npx jest` (1784 tests, 88 suites green as of 2026-09-09). Typecheck: `cd mobile && npx tsc --noEmit` — NOTE the Supabase client is untyped, so tsc proves nothing about column names; the probes are the real schema tests.

**Migration numbering:** remote head is `20260911100000_straight_leg_style.sql`. New migrations in this plan: `20260914100000_core_curation.sql`, `20260914110000_scope_parent_candidacy.sql`, `20260915100000_retire_legacy.sql`. Timestamps must stay in this relative order; if another migration lands first, renumber to sort after it (lesson from Stage 5: `db push` refuses out-of-order files; merge/renumber, never `migration repair`).

## File structure (what changes where)

- `mobile/src/components/training/daily/MatchReviewSheet.tsx` — chip confirm dialog (Task 1)
- `mobile/src/components/training/crossfit/wizard/Step3Attributes.tsx`, `wizard/AttributePickerSheet.tsx`, `mobile/src/lib/supabase/crossfit.ts` (one new fetcher) — "Standard — as core" display (Task 2)
- `docs/superpowers/audit/2026-09-09-skill-scoring-curation.csv` — curation decision record (Task 3, GATE)
- `supabase/migrations/20260914100000_core_curation.sql` — curation data migration (Task 4, live GATE)
- `mobile/src/lib/catalogWizardForm.ts` + its test file, `CatalogItemWizard.tsx`, `wizard/Step2Classification.tsx` — required skill/scoring (Task 5)
- `mobile/src/lib/supabase/frontDoor.ts` — off legacy (Task 6)
- `mobile/src/lib/supabase/crossfit.ts` + 5 components + `mobile/src/types/crossfit.ts` — goal_type embed retirement (Task 7)
- `mobile/src/lib/supabase/crossfit.ts`, `TrainingItemDetailScreen.tsx`, `mobile/src/types/crossfit.ts` — variations retirement (Task 8)
- `capture.ts`, `daily.ts`, `wodDetailHelpers.ts`, `WODMovementsStep.tsx`, `MovementConfigModal.tsx`, `AddWODWizard.tsx`, `types/crossfit.ts` — remaining legacy consumers (Task 9)
- `supabase/functions/generate-exercise-image/index.ts` — junction embed (Task 10, deploy GATE)
- `supabase/migrations/20260914110000_scope_parent_candidacy.sql` — hardening (Task 11, live GATE)
- `supabase/migrations/20260915100000_retire_legacy.sql`, `scripts/movement-model/verify_foundation.sql`, `dump_live_data.sh`, `swap_fresh_dump.sql`, `probe_wizard_payload.sh` — the drop (Task 12, live GATE)
- Docs/roadmap/spec/memory close-out (Tasks 13–14)

**Execution gates requiring Brian:** end of Task 3 (approve curation sheet), Task 4 (say "push"), after Task 5 (on-device check of wizard + chips), Task 10 (approve edge deploy), Task 11 ("push"), Task 12 ("push"). Everything else runs continuously. Per standing directive, post a status update at every task boundary.

---

### Task 1: Confirm step on review suggestion chips

Brian's directive from the exit gate: a one-tap chip resolution is too easy to fire by accident (he mis-tapped "Thruster" and undoing took manual 3-table surgery). Add a confirm dialog to the chip tap. No undo machinery (a resolution writes 4 tables with upsert-ambiguity; YAGNI — confirm prevents the accident instead).

**Files:**
- Modify: `mobile/src/components/training/daily/MatchReviewSheet.tsx:149-166`

- [x] **Step 1: Replace the chip onPress with a confirm wrapper**

Current code (lines 153-164):

```tsx
                        {review.candidates.map((c) => (
                          <TouchableOpacity
                            key={c.exerciseId}
                            style={styles.pill}
                            disabled={busy}
                            onPress={() => resolve(review, c.exerciseId, false)}
                          >
                            <Link2 size={12} color={colors.primary} />
                            <Text style={styles.pillText}>{c.name}</Text>
                          </TouchableOpacity>
                        ))}
```

Replace the `onPress` line with:

```tsx
                            onPress={() => confirmChipLink(review, c)}
```

and add this handler next to `resolve` (after line 109, same indentation level as `resolve`):

```tsx
  /**
   * Chips are one-tap and easy to hit by accident, and a resolution is
   * effectively irreversible from the app (it writes the review, provenance,
   * workout items, and optionally an alias). Confirm before committing.
   */
  const confirmChipLink = (
    review: PendingMatchReview,
    candidate: { exerciseId: string; name: string },
  ) => {
    const teaching = saveAliasFor(review)
      ? `\n\n“${review.rawName}” will also be remembered as a name for it.`
      : '';
    Alert.alert(
      'Link this movement?',
      `“${review.rawName}” will be linked to “${candidate.name}”.${teaching}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Link', onPress: () => resolve(review, candidate.exerciseId, false) },
      ],
    );
  };
```

`Alert` is already imported (line 4). Do NOT add confirms to the Find-in-catalog or Create-new paths — those are deliberate multi-step flows.

- [x] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors (pre-existing error count unchanged).

- [x] **Step 3: Commit**

```bash
git add mobile/src/components/training/daily/MatchReviewSheet.tsx
git commit -m "feat(reviews): confirm dialog before one-tap chip resolution

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

On-device verification happens in the Task 5 gate (batched with the wizard changes).

---

### Task 2: "Standard — as ⟨core⟩" replaces "None" in the attribute step

Brian's directive: an unset identity attribute on a derivation isn't "None" — it means "same as the core". Show `Standard — as Thruster` instead of `None`, with the core's description visible in the picker sheet. Display-level only: storing attributes on cores would break the fingerprint lock (cores are attribute-free at fingerprint `''` by design — decided during the exit gate).

**Files:**
- Modify: `mobile/src/lib/supabase/crossfit.ts` (add one fetcher near `fetchCoreClassification`, which starts at line 403)
- Modify: `mobile/src/components/training/crossfit/wizard/Step3Attributes.tsx:267-311`
- Modify: `mobile/src/components/training/crossfit/wizard/AttributePickerSheet.tsx:58-68`

- [x] **Step 1: Add `fetchCoreDescription` to crossfit.ts**

Insert directly after the `fetchCoreClassification` function body ends (its closing `}` is around line 437):

```ts
/**
 * The core's own description, for the wizard's attribute step: an unset
 * attribute on a derivation displays as "Standard — as <core>", and the
 * picker sheet shows this text under that option so the user knows what
 * the standard execution IS.
 */
export async function fetchCoreDescription(coreId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('exercises')
    .select('description')
    .eq('id', coreId)
    .maybeSingle();
  if (error) {
    console.error('Error fetching core description:', error);
    return null;
  }
  return data?.description ?? null;
}
```

- [x] **Step 2: Load the description in Step3Attributes and compute the standard label**

In `Step3Attributes.tsx`, add to the imports: `fetchCoreDescription` from `@/src/lib/supabase/crossfit` (match the file's existing import path style for crossfit.ts), and `useState`/`useEffect` if not already imported. Then inside the component, near the existing state (the component already has `openPicker` state and a `fetchVariantLabels` effect keyed on `formData.core_movement_id` around line 80):

```tsx
  const isDerivation = formData.kind === 'derivation' && !!formData.core_movement_id;
  /** What an unset attribute MEANS on a derivation: inherited standard execution. */
  const standardLabel = isDerivation && formData.core_movement_name
    ? `Standard — as ${formData.core_movement_name}`
    : 'None';

  const [coreDescription, setCoreDescription] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!isDerivation) {
      setCoreDescription(null);
      return;
    }
    fetchCoreDescription(formData.core_movement_id!).then((d) => {
      if (!cancelled) setCoreDescription(d);
    });
    return () => {
      cancelled = true;
    };
  }, [formData.core_movement_id, isDerivation]);
```

- [x] **Step 3: Use the label in both picker rows**

At line 281 (attribute pickers) change:

```tsx
                    {value ?? 'None'}
```

to:

```tsx
                    {value ?? standardLabel}
```

and the accessibility label at line 275 from `` `${label}: ${value ?? 'none'}` `` to `` `${label}: ${value ?? standardLabel}` ``. Apply the same two changes to the variant-label row (its `?? 'None'` is at line 306).

- [x] **Step 4: Pass the label and description into AttributePickerSheet**

In `AttributePickerSheet.tsx`, add to the props interface:

```tsx
  /** Label for the cleared state; derivations show "Standard — as <core>". */
  noneLabel?: string;
  /** Shown under the cleared option — the core's description on derivations. */
  noneDescription?: string | null;
```

Change the None row (lines 58-68) to:

```tsx
          <TouchableOpacity
            style={styles.row}
            onPress={() => choose(null)}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedId === null }}
          >
            <View style={styles.rowTextWrap}>
              <Text style={[styles.rowLabel, styles.noneLabel, selectedId === null && styles.rowLabelOn]}>
                {noneLabel ?? 'None'}
              </Text>
              {noneDescription ? (
                <Text style={styles.rowDescription} numberOfLines={3}>
                  {noneDescription}
                </Text>
              ) : null}
            </View>
            {selectedId === null && <Check size={18} color={colors.primary} />}
          </TouchableOpacity>
```

Reuse the sheet's existing option-description styles (option rows already render `option.description` at lines 83-87 — reuse the same text style name for `rowDescription` and the same wrapper pattern for `rowTextWrap`; if the option rows use different style names, match THOSE names instead of inventing new ones).

Then in `Step3Attributes.tsx`, wherever `<AttributePickerSheet` is rendered, pass:

```tsx
            noneLabel={standardLabel}
            noneDescription={isDerivation ? coreDescription : null}
```

- [x] **Step 5: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [x] **Step 6: Commit**

```bash
git add mobile/src/lib/supabase/crossfit.ts mobile/src/components/training/crossfit/wizard/Step3Attributes.tsx mobile/src/components/training/crossfit/wizard/AttributePickerSheet.tsx
git commit -m "feat(wizard): unset attributes read 'Standard — as <core>' with core description

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Curation sheet — skill level + scoring for the whole catalog 🚧 GATE

Brian's declared standard: EVERY exercise carries a skill level and ≥1 scoring type when relevant; "not relevant" is expressed with the existing `Not Scored / N/A` scoring row, so in practice every row gets both. Current gaps (staging, 2026-09-09): 11 of 48 cores lack `skill_level`, 37 of 48 cores have zero `exercise_scoring_types` rows; catalog-wide 58/287 lack skill and 256/287 lack scoring. Strategy: author values for the 48 cores and 52 outliers; the 187 derivations inherit from their cores by backfill (Task 4).

**Files:**
- Create: `docs/superpowers/audit/2026-09-09-skill-scoring-curation.csv`

- [x] **Step 1: Generate the sheet skeleton from staging**

```bash
psql postgresql://postgres:postgres@127.0.0.1:56322/postgres -c "\copy (
  SELECT e.name,
         CASE WHEN e.tier = 0 THEN 'core' ELSE 'outlier' END AS kind,
         COALESCE(mf.name,'') AS family,
         COALESCE(e.skill_level,'') AS current_skill,
         COALESCE((SELECT string_agg(st.name,'|' ORDER BY st.display_order)
            FROM exercise_scoring_types est JOIN scoring_types st ON st.id=est.scoring_type_id
            WHERE est.exercise_id=e.id),'') AS current_scoring,
         '' AS proposed_skill, '' AS proposed_scoring
  FROM exercises e LEFT JOIN movement_families mf ON mf.id=e.movement_family_id
  WHERE e.tier = 0 OR e.core_movement_id IS NULL
  ORDER BY kind, family, e.name
) TO 'docs/superpowers/audit/2026-09-09-skill-scoring-curation.csv' CSV HEADER"
```

(Run from repo root; if `\copy` pathing fights you, redirect `COPY ... TO STDOUT` into the file.) Rows with a `current_*` value keep it — proposals fill blanks only, never overwrite existing curation.

- [x] **Step 2: Fill `proposed_skill` and `proposed_scoring` for every blank**

Core proposals are pre-decided (from the 2026-09-09 research pass) — enter them verbatim:

Skill (the 11 blank cores): Calf Raise=Beginner, Carry=Beginner, Leg Curl=Beginner, Plank=Beginner, Bent-Over Row=Beginner, Curl=Beginner, Lat Pulldown=Beginner, Raise=Beginner, Triceps Pushdown=Beginner, Leg Press=Beginner, Bench Press=Intermediate.

Scoring (the 37 cores with none; `|`-separated, names must match `scoring_types.name` exactly):

| Core | Proposed scoring |
|---|---|
| Calf Raise | Reps\|Load |
| Bike | Calories\|Distance\|Time |
| Carry | Distance\|Load |
| Leg Curl | Reps\|Load |
| Handstand Walk | Distance |
| Crunch | Reps |
| Leg Raise | Reps |
| Mountain Climber | Reps |
| Plank | Duration / Hold |
| Reverse Crunch | Reps |
| Russian Twist | Reps |
| Sit-Up | Reps |
| Toes-to-Bar | Reps |
| V-Up | Reps |
| Snatch | Reps\|Load |
| Bent-Over Row | Reps\|Load |
| Curl | Reps\|Load |
| Inverted Row | Reps |
| Lat Pulldown | Reps\|Load |
| Bench Press | Reps\|Load |
| Chest Fly | Reps\|Load |
| Dip | Reps |
| Handstand Push-Up | Reps |
| Push-Up | Reps |
| Raise | Reps\|Load |
| Triceps Extension | Reps\|Load |
| Triceps Pushdown | Reps\|Load |
| Muscle-Up | Reps |
| Jump Rope | Reps\|Time |
| Around the World | Reps |
| Halo | Reps |
| Ski | Calories\|Distance\|Time |
| Leg Press | Reps\|Load |
| Thruster | Reps\|Load |
| Swim | Distance\|Time |
| Wall Ball | Reps |

The 11 cores that already have scoring (Rope Climb, Deadlift, Lunge, Clean, Burpee, Jump, Pull-Up, Press, Row, Run, Squat, Swing) keep theirs untouched.

For the 52 outliers: propose from each row's name/family using the same conventions (loaded strength → `Reps|Load`; bodyweight reps → `Reps`; holds → `Duration / Hold`; monostructural → `Distance|Time` or `Calories|Distance|Time`; recovery/mobility work → `Not Scored / N/A` and skill `Beginner`). Every blank must get a proposal — no row left empty.

- [x] **Step 3: 🚧 GATE — present the sheet to Brian and STOP**

Post the full sheet (or the artifact route if he prefers) and wait for his approval. He may edit values. Do not start Task 4 until he approves. The approved CSV is the decision record — commit it:

```bash
git add docs/superpowers/audit/2026-09-09-skill-scoring-curation.csv
git commit -m "docs(audit): approved skill/scoring curation sheet (48 cores + 52 outliers)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Curation migration 🚧 LIVE GATE

**Files:**
- Create: `supabase/migrations/20260914100000_core_curation.sql`

- [x] **Step 1: Write the migration from the approved sheet**

Shape (VALUES lists are filled row-for-row from the approved CSV — cores AND outliers; the core values below are the pre-approved defaults and must match the final sheet):

```sql
-- Stage 6 curation: every catalog row carries skill_level and ≥1 scoring type.
-- Values are the approved sheet docs/superpowers/audit/2026-09-09-skill-scoring-curation.csv
-- (decision record). Fills blanks only — never overwrites existing curation.
-- skill_level is not an identity column: no recompute, no fingerprint movement.

-- 1) Authored skill levels (cores + outliers missing one).
UPDATE public.exercises e SET skill_level = v.skill
FROM (VALUES
  ('Calf Raise','Beginner'),
  ('Carry','Beginner'),
  ('Leg Curl','Beginner'),
  ('Plank','Beginner'),
  ('Bent-Over Row','Beginner'),
  ('Curl','Beginner'),
  ('Lat Pulldown','Beginner'),
  ('Raise','Beginner'),
  ('Triceps Pushdown','Beginner'),
  ('Leg Press','Beginner'),
  ('Bench Press','Intermediate')
  -- ... outlier rows from the approved sheet, same shape
) AS v(name, skill)
WHERE e.name = v.name
  AND (e.tier = 0 OR e.core_movement_id IS NULL)
  AND e.skill_level IS NULL;

-- 2) Authored scoring types (cores + outliers with none).
INSERT INTO public.exercise_scoring_types (exercise_id, scoring_type_id)
SELECT e.id, st.id
FROM (VALUES
  ('Calf Raise','Reps'), ('Calf Raise','Load'),
  ('Bike','Calories'), ('Bike','Distance'), ('Bike','Time'),
  ('Carry','Distance'), ('Carry','Load'),
  ('Leg Curl','Reps'), ('Leg Curl','Load'),
  ('Handstand Walk','Distance'),
  ('Crunch','Reps'), ('Leg Raise','Reps'), ('Mountain Climber','Reps'),
  ('Plank','Duration / Hold'),
  ('Reverse Crunch','Reps'), ('Russian Twist','Reps'), ('Sit-Up','Reps'),
  ('Toes-to-Bar','Reps'), ('V-Up','Reps'),
  ('Snatch','Reps'), ('Snatch','Load'),
  ('Bent-Over Row','Reps'), ('Bent-Over Row','Load'),
  ('Curl','Reps'), ('Curl','Load'),
  ('Inverted Row','Reps'),
  ('Lat Pulldown','Reps'), ('Lat Pulldown','Load'),
  ('Bench Press','Reps'), ('Bench Press','Load'),
  ('Chest Fly','Reps'), ('Chest Fly','Load'),
  ('Dip','Reps'), ('Handstand Push-Up','Reps'), ('Push-Up','Reps'),
  ('Raise','Reps'), ('Raise','Load'),
  ('Triceps Extension','Reps'), ('Triceps Extension','Load'),
  ('Triceps Pushdown','Reps'), ('Triceps Pushdown','Load'),
  ('Muscle-Up','Reps'),
  ('Jump Rope','Reps'), ('Jump Rope','Time'),
  ('Around the World','Reps'), ('Halo','Reps'),
  ('Ski','Calories'), ('Ski','Distance'), ('Ski','Time'),
  ('Leg Press','Reps'), ('Leg Press','Load'),
  ('Thruster','Reps'), ('Thruster','Load'),
  ('Swim','Distance'), ('Swim','Time'),
  ('Wall Ball','Reps')
  -- ... outlier rows from the approved sheet, same shape
) AS v(name, scoring)
JOIN public.exercises e ON e.name = v.name AND (e.tier = 0 OR e.core_movement_id IS NULL)
JOIN public.scoring_types st ON st.name = v.scoring
ON CONFLICT (exercise_id, scoring_type_id) DO NOTHING;

-- 3) Derivations inherit from their core where still blank.
UPDATE public.exercises d SET skill_level = c.skill_level
FROM public.exercises c
WHERE d.core_movement_id = c.id AND d.id <> c.id
  AND d.skill_level IS NULL AND c.skill_level IS NOT NULL;

INSERT INTO public.exercise_scoring_types (exercise_id, scoring_type_id)
SELECT d.id, cst.scoring_type_id
FROM public.exercises d
JOIN public.exercises c ON c.id = d.core_movement_id AND d.id <> c.id
JOIN public.exercise_scoring_types cst ON cst.exercise_id = c.id
WHERE NOT EXISTS (SELECT 1 FROM public.exercise_scoring_types x WHERE x.exercise_id = d.id)
ON CONFLICT (exercise_id, scoring_type_id) DO NOTHING;

-- 4) Assert the declared standard now holds.
DO $$
DECLARE n_skill INT; n_scoring INT;
BEGIN
  SELECT count(*) INTO n_skill FROM public.exercises WHERE skill_level IS NULL;
  SELECT count(*) INTO n_scoring FROM public.exercises e
    WHERE NOT EXISTS (SELECT 1 FROM public.exercise_scoring_types est WHERE est.exercise_id = e.id);
  IF n_skill > 0 OR n_scoring > 0 THEN
    RAISE EXCEPTION 'curation incomplete: % rows without skill_level, % without scoring', n_skill, n_scoring;
  END IF;
END $$;
```

NOTE the final assertion means the sheet MUST cover every blank core/outlier — the migration self-verifies completeness. Sanity-check name matches before rehearsal: every `v.name` must hit exactly one row (`tier=0 OR core_movement_id IS NULL`); a typo'd name silently no-ops the UPDATE but then trips the final assertion — that is the designed failure mode.

- [x] **Step 2: Rehearse on staging**

```bash
psql postgresql://postgres:postgres@127.0.0.1:56322/postgres -v ON_ERROR_STOP=1 -f supabase/migrations/20260914100000_core_curation.sql
```

Expected: completes without the exception. Then verify no engine churn (fingerprints must not move — skill/scoring are not identity attributes):

```bash
psql postgresql://postgres:postgres@127.0.0.1:56322/postgres -c "
SELECT count(*) AS rows_touched_today FROM exercises WHERE updated_at > now() - interval '10 minutes' AND identity_fingerprint IS DISTINCT FROM identity_fingerprint;"
psql postgresql://postgres:postgres@127.0.0.1:56322/postgres -f scripts/movement-model/verify_foundation.sql
```

Expected: harness V0–V11 PASS. NOTE: staging lacks the 4 exercises Brian minted on-device 2026-09-09 (they exist on live only) — those are derivations, covered by the backfill legs, so live totals will differ from staging by 4; the completeness assertion handles both.

- [x] **Step 3: 🚧 GATE — live push**

Report rehearsal results to Brian and wait for "push". Then:

```bash
supabase db push
```

Verify live via REST (anon key from `mobile/.env`): zero rows missing skill or scoring.

- [x] **Step 4: Commit**

```bash
git add supabase/migrations/20260914100000_core_curation.sql
git commit -m "feat(curation): skill level + scoring types for every catalog row

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Wizard requires skill level and ≥1 scoring type

Only after Task 4 (cores curated → wizard inheritance pre-fills these for derivations, so the requirement costs the user nothing in the common path).

**Files:**
- Modify: `mobile/src/lib/catalogWizardForm.ts`
- Test: the existing catalogWizardForm jest suite (`cd mobile && npx jest catalogWizardForm` to locate it)
- Modify: `mobile/src/components/training/crossfit/CatalogItemWizard.tsx:313-331`
- Modify: `mobile/src/components/training/crossfit/wizard/Step2Classification.tsx` (labels at lines ~349 and ~458)

- [x] **Step 1: Write the failing tests**

Add to the catalogWizardForm test file:

```ts
describe('missingClassification', () => {
  const complete = {
    ...EMPTY_WIZARD_FORM,
    modality_id: 'mod-1',
    movement_family_id: 'fam-1',
    goal_type_ids: ['goal-1'],
    skill_level: 'Beginner' as const,
    scoring_type_ids: ['scoring-1'],
  };

  it('returns empty for a fully classified form', () => {
    expect(missingClassification(complete)).toEqual([]);
  });

  it('requires skill level', () => {
    expect(missingClassification({ ...complete, skill_level: null })).toEqual(['Skill level']);
  });

  it('requires at least one scoring type', () => {
    expect(missingClassification({ ...complete, scoring_type_ids: [] })).toEqual(['Scoring type']);
  });

  it('reports every gap on the empty form', () => {
    expect(missingClassification(EMPTY_WIZARD_FORM)).toEqual([
      'Modality', 'Movement family', 'Goal type', 'Skill level', 'Scoring type',
    ]);
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `cd mobile && npx jest catalogWizardForm`
Expected: FAIL — `missingClassification` is not exported.

- [x] **Step 3: Implement in catalogWizardForm.ts**

```ts
/**
 * Required classification fields, as human-readable labels (empty = complete).
 * Skill level and scoring are required by declared standard (2026-09-09):
 * every catalog row carries both; "not scored" work uses the Not Scored / N/A
 * scoring type rather than an empty junction.
 */
export function missingClassification(form: WizardFormData): string[] {
  const missing: string[] = [];
  if (!form.modality_id) missing.push('Modality');
  if (!form.movement_family_id) missing.push('Movement family');
  if (form.goal_type_ids.length === 0) missing.push('Goal type');
  if (!form.skill_level) missing.push('Skill level');
  if (form.scoring_type_ids.length === 0) missing.push('Scoring type');
  return missing;
}
```

- [x] **Step 4: Run tests to verify pass**

Run: `cd mobile && npx jest catalogWizardForm`
Expected: PASS, all suites.

- [x] **Step 5: Wire the wizard to it**

In `CatalogItemWizard.tsx`, replace the body of `canSave` (lines 325-331):

```tsx
  const canSave = () => {
    if (!step1Complete()) return false;
    return missingClassification(formData).length === 0;
  };
```

and inside `canProceed` (lines 313-323), replace the step-2 classification checks (the explicit modality/family/goal checks) with the same helper call so the step-2 "Next" gate matches the save gate. Import `missingClassification` from `@/src/lib/catalogWizardForm` (match the file's existing import of `WizardFormData`/`EMPTY_WIZARD_FORM`).

In `Step2Classification.tsx`: append the required marker `*` to the Skill Level label (line ~349) and the Scoring Types label (line ~458), matching exactly how the existing required fields (Modality/Family/Goal Type) mark theirs; add one hint line under the scoring section, styled like the section's existing helper text:

```tsx
          <Text style={styles.helperText}>
            Recovery and mobility work scores as “Not Scored / N/A”.
          </Text>
```

(If the file's helper-text style has a different name, use that name.)

- [x] **Step 6: Typecheck + full jest**

Run: `cd mobile && npx tsc --noEmit && npx jest`
Expected: no new tsc errors; all suites pass.

- [x] **Step 7: 🚧 GATE — on-device check, then commit**

Ask Brian to verify on device (Metro workflow per `feedback_simulator_isolation` memory): (a) chip confirm dialog from Task 1, (b) "Standard — as ⟨core⟩" display from Task 2, (c) wizard blocks save without skill/scoring and derivations pre-fill both from the core. Then:

```bash
git add mobile/src/lib/catalogWizardForm.ts mobile/src/components/training/crossfit/CatalogItemWizard.tsx mobile/src/components/training/crossfit/wizard/Step2Classification.tsx
git add mobile/src/lib/__tests__  # or wherever the touched test file lives
git commit -m "feat(wizard): skill level and scoring type are required classification

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Front door off the legacy columns

The blocks are already comment-labeled "Legacy compat (until Stage 6)" — this task is their scheduled removal. App still runs against the pre-drop schema afterward (reads simply select fewer columns; the legacy columns go stale, which is fine — they're dropped in Task 12).

**Files:**
- Modify: `mobile/src/lib/supabase/frontDoor.ts` (interface ~lines 200-212, ROW_COLUMNS ~214-222, insert row ~655-680, Phase-3 compat block ~1230-1250)

- [x] **Step 1: Remove the two fields from `ExerciseRow` and `ROW_COLUMNS`**

In the `ExerciseRow` interface delete these two lines:

```ts
  equipment_types: string[] | null;
  goal_type_id: string | null;
```

In `ROW_COLUMNS` delete `equipment_types, ` and `goal_type_id, ` (the string becomes `'... skill_level, short_name, requires_weight, requires_distance, video_url, ...'`).

- [x] **Step 2: Stop writing them on create**

In `insertRow` delete these two lines (keep `requires_weight`/`requires_distance` — those columns survive):

```ts
    equipment_types: equipmentNames.length > 0 ? equipmentNames : null,
```
```ts
    goal_type_id: goalTypeIds[0] ?? null,
```

If `goalTypeIds` (the local variable) is now unused, remove its declaration; `equipmentNames` stays (feeds `deriveRequiresWeight`).

- [x] **Step 3: Shrink the Phase-3 compat block on update**

Replace the block (currently starting `// ── Phase 3: legacy-compat columns, AFTER the junctions they mirror (I2) ──`) with:

```ts
  // ── Phase 3: derived convenience columns, AFTER the junctions they mirror ──
  // requires_weight/requires_distance survive Stage 6 (they're app conveniences,
  // not legacy identity storage). These fire no recompute.
  const compat: Record<string, unknown> = {};
  if (nextEquipmentIds !== undefined) {
    const names = await fetchEquipmentNames(nextEquipmentIds);
    compat.requires_weight = deriveRequiresWeight(names);
  }
  if (patch.scoring_type_ids !== undefined) {
    compat.requires_distance = await deriveRequiresDistance(dedupe(patch.scoring_type_ids));
  }
  if (Object.keys(compat).length > 0) {
    const { error } = await withDeadlockRetry(() =>
      supabase.from('exercises').update(compat).eq('id', id).select('id').single(),
    );
    if (error) await mapAndThrow(error, errCtx);
  }
```

(The deleted lines are `compat.equipment_types = ...` and the whole `if (patch.goal_type_ids !== undefined)` clause.)

- [x] **Step 4: Sweep the rest of the file**

`grep -n "equipment_types\|goal_type_id" mobile/src/lib/supabase/frontDoor.ts` — fix any remaining reference EXCEPT junction-table column names (`exercise_goal_types` selects its own `goal_type_id` column — those survive and stay).

- [x] **Step 5: Verify — typecheck, jest, probes**

```bash
cd mobile && npx tsc --noEmit && npx jest
```
```bash
bash scripts/movement-model/probe_front_door.sh
```
Expected: probes PASS against staging (create/update/delete round-trips through the front door contract).

- [x] **Step 6: Commit**

```bash
git add mobile/src/lib/supabase/frontDoor.ts
git commit -m "refactor(front-door): drop legacy-compat reads and writes (Stage 6)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Retire the `goal_type` FK embeds

Eleven PostgREST embeds resolve through the `exercises.goal_type_id` FK; the column drop 400s every one. They don't contain the string `goal_type_id` — this list is the product of the 2026-09-09 sweep and is exhaustive.

**Files:**
- Modify: `mobile/src/lib/supabase/crossfit.ts:403-441` (fetchCoreClassification), 578, 643, 707, 777, 843, 1890 (list fetchers), 1094/1103/1112/1121 (fetchWODById ×4)
- Modify: `mobile/src/components/training/item-detail/TrainingItemDetailScreen.tsx:175, 488-493`
- Modify: `mobile/src/components/training/crossfit/MovementSearchModal.tsx:144`
- Modify: `mobile/src/components/training/crossfit/SwipeableMovementCard.tsx:273`
- Modify: `mobile/src/components/training/crossfit/WODDetailScreen.tsx:457`
- Modify: `mobile/src/types/crossfit.ts:552, 569`

- [x] **Step 1: fetchCoreClassification — junction only**

Remove `goal_type_id, ` from the select string and change the return mapping:

```ts
    goal_type_ids: junctionGoals,
```

(delete the `junctionGoals.length > 0 ? ... : row.goal_type_id ? ...` fallback). Update the function's doc comment: the junction is now the only source; the legacy fallback is gone with Stage 6.

- [x] **Step 2: Delete the embed line from the six list fetchers**

In `fetchMovements`, `searchMovements`, `fetchAllExercises`, `searchAllExercises`, `fetchMovementById`, `fetchExerciseWithDetails` delete the line:

```
      goal_type:goal_types(*),
```

- [x] **Step 3: fetchWODById — same deletion ×4**

Delete `goal_type:goal_types(*),` from all four exercise embeds (`exercise:`, `rx_alternative_exercise:`, `l2_alternative_exercise:`, `l1_alternative_exercise:`).

- [x] **Step 4: TrainingItemDetailScreen — junction replacement**

At line 175 replace:

```
          goal_type:goal_types(id, name),
```

with:

```
          goal_rows:exercise_goal_types(goal_type:goal_types(id, name)),
```

Add to the `DetailRow` interface (line 58 area):

```ts
  goal_rows?: { goal_type: { id: string; name: string } | null }[];
```

Replace the Goal Type meta item (lines 488-493):

```tsx
          {(item.goal_rows?.length ?? 0) > 0 && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Goal Type</Text>
              <Text style={styles.metaValue} numberOfLines={1}>
                {item.goal_rows!.map((g) => g.goal_type?.name).filter(Boolean).join(', ')}
              </Text>
            </View>
          )}
```

- [x] **Step 5: Drop the display fallbacks**

- `MovementSearchModal.tsx:144`: `{movement.movement_category?.name || movement.goal_type?.name}` → `{movement.movement_category?.name}`
- `SwipeableMovementCard.tsx:273`: `{movement.movement_category?.name || movement.goal_type?.name || 'General'}` → `{movement.movement_category?.name || 'General'}`
- `WODDetailScreen.tsx:457`: delete the line `const goalTypeName = exercise?.goal_type?.name;` (verified dead — that was its only occurrence in the file)

- [x] **Step 6: Types**

In `types/crossfit.ts` delete the `goal_type?: GoalType; // Legacy single goal type...` members at lines 552 and 569.

- [x] **Step 7: Verify + commit**

```bash
cd mobile && npx tsc --noEmit && npx jest
bash scripts/movement-model/probe_reads.sh
```

```bash
git add mobile/src/lib/supabase/crossfit.ts mobile/src/components/training/item-detail/TrainingItemDetailScreen.tsx mobile/src/components/training/crossfit/MovementSearchModal.tsx mobile/src/components/training/crossfit/SwipeableMovementCard.tsx mobile/src/components/training/crossfit/WODDetailScreen.tsx mobile/src/types/crossfit.ts
git commit -m "refactor(catalog): goal types read from the junction only (Stage 6)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Retire the variations UI remnants

The variation tables are the pre-model way of expressing what derivations now express. The UI that read them: six list-fetcher embeds, two dead fetchers, one detail-screen section. (`ScalingComparisonView.tsx` mentions "variation" but reads `*_movement_variation` text columns on `wod_movements` — unrelated, DO NOT touch.)

**Files:**
- Modify: `mobile/src/lib/supabase/crossfit.ts` (~93-113 fetchVariationCategories, ~915-940 fetchVariationOptions, embeds at 580-584, 645-649, 709-713, 779-783, 844-848, 1894-1898)
- Modify: `mobile/src/components/training/item-detail/TrainingItemDetailScreen.tsx:176, 518-534`
- Modify: `mobile/src/types/crossfit.ts`

- [x] **Step 1: Confirm the two fetchers are dead exports**

```bash
grep -rn "fetchVariationCategories\|fetchVariationOptions" mobile/src --include='*.ts' --include='*.tsx' | grep -v "lib/supabase/crossfit.ts"
```
Expected: no output. (If a caller appears, it renders data that no longer exists — delete the calling UI too and note it in the commit.)

- [x] **Step 2: Delete both fetchers and all six embeds**

Delete the whole `fetchVariationCategories` and `fetchVariationOptions` functions. In the six list fetchers delete the embed block:

```
      variations:exercise_variations(
        *,
        variation_option:variation_options(
          *,
          category:variation_categories(*)
        )
      ),
```

- [x] **Step 3: Detail screen**

Delete line 176 (`variations:exercise_variations(*),`) and the whole Variations JSX section (lines 518-534, the `{item.variations && ...}` block). Remove now-unused styles (`variationItem`, `variationName`, `variationDescription`) if nothing else references them.

- [x] **Step 4: Types**

In `types/crossfit.ts`: remove the `variations` member from `ExerciseWithVariations` and add a doc comment that the name is historical (the interface now equals a catalog list row; renaming it touches too many call sites for zero behavior — YAGNI). Delete `VariationCategory`, `VariationOption`/`VariationOptionWithCategory`, and `ExerciseVariation` types if `grep -rn` shows no remaining references after the edits above.

- [x] **Step 5: Verify + commit**

```bash
cd mobile && npx tsc --noEmit && npx jest
```

```bash
git add mobile/src/lib/supabase/crossfit.ts mobile/src/components/training/item-detail/TrainingItemDetailScreen.tsx mobile/src/types/crossfit.ts
git commit -m "refactor(catalog): retire variations UI — derivations replaced them (Stage 6)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Remaining `equipment_types` consumers move to the junction

**Files:**
- Modify: `mobile/src/lib/supabase/capture.ts:505-545` (fetchCatalog)
- Modify: `mobile/src/lib/supabase/daily.ts:322-385` (fetchCandidateData)
- Modify: `mobile/src/lib/supabase/crossfit.ts` (add `equipment_rows` embed to fetchMovements/searchMovements/fetchAllExercises/searchAllExercises and the four fetchWODById exercise embeds)
- Modify: `mobile/src/lib/wodDetailHelpers.ts:180-196`
- Modify: `mobile/src/components/training/crossfit/WODMovementsStep.tsx:78`, `MovementConfigModal.tsx:267`, `AddWODWizard.tsx:29`
- Modify: `mobile/src/lib/gemini.ts:112` (verify only — field stays populated in-memory)
- Modify: `mobile/src/types/crossfit.ts` (Exercise 300/308/313, movement iface 370/375, CreateExerciseInput 714, CreateMovementInput 729/739/747/756, ScoringTypeName 28)

- [x] **Step 1: capture.ts fetchCatalog — junction only**

Remove `equipment_types` from the select (keep `equipment_junction:exercise_equipment(equipment(name))`) and replace the union mapping with:

```ts
    equipmentTypes: (row.equipment_junction ?? [])
      .map((e: any) => e.equipment?.name)
      .filter((n: any): n is string => typeof n === "string"),
```

Delete the "legacy array fills in for pre-model rows" comment — post-Stage-3 every row's junction is authoritative.

- [x] **Step 2: daily.ts fetchCandidateData — junction swap**

In the exercises select replace `equipment_types,` with:

```
        equipment_junction:exercise_equipment(equipment(name)),
```

and the candidate mapping:

```ts
    equipmentTypes: (row.equipment_junction ?? [])
      .map((e: any) => e.equipment?.name)
      .filter((n: any): n is string => typeof n === "string"),
```

- [x] **Step 3: crossfit.ts — add the equipment embed where movement rows feed WOD tooling**

Add this line to the select of `fetchMovements`, `searchMovements`, `fetchAllExercises`, `searchAllExercises`, and to all four exercise embeds in `fetchWODById` (right after the `movement_category:` line in each):

```
      equipment_rows:exercise_equipment(equipment(name)),
```

- [x] **Step 4: wodDetailHelpers.ts — read the junction rows**

Replace the equipment block inside the `wod.movements?.forEach` (lines ~186-195):

```ts
    if (exercise.requires_weight) {
      const names = ((exercise as any).equipment_rows ?? [])
        .map((r: any) => r.equipment?.name)
        .filter((n: any): n is string => typeof n === 'string');
      if (names.length > 0) {
        names.forEach((eq: string) => equipmentSet.add(eq));
      } else {
        equipmentSet.add('Weights');
      }
    }
```

- [x] **Step 5: In-memory copies feed from the junction**

`WODMovementsStep.tsx:78` and `MovementConfigModal.tsx:267` copy `movement.equipment_types` into `WODMovementConfig`. Change both copy expressions to:

```ts
      equipment_types: ((movement as any).equipment_rows ?? [])
        .map((r: any) => r.equipment?.name)
        .filter((n: any): n is string => typeof n === 'string'),
```

The in-memory field NAME `equipment_types` on `WODMovementConfig`/`AddWODWizard.tsx:29` stays (it never touches the DB; renaming it churns the WOD wizard for zero behavior). `gemini.ts:112` (`category: m.equipment_types?.[0]`) and `extractMovementData` in `wodDetailHelpers.ts` then keep working unchanged — verify by reading them, change nothing.

- [x] **Step 6: types/crossfit.ts cleanup**

Delete from `Exercise`: `goal_type_id` (300), `aliases` (308), `equipment_types` (313). Delete from the movement/detail interface: `movement_style_id` (370), `aliases` (375). Delete `CreateExerciseInput.goal_type_id` (714) and from `CreateMovementInput`: `goal_type_id` (729), `aliases` (739), `movement_style_id` (747), `equipment_types` (756). Fix any resulting tsc errors at call sites by deleting the dead assignments (the untyped Supabase client means these fields were silently ignored on write already).

Also fix the stale scoring union (line 28) to match the real dictionary:

```ts
export type ScoringTypeName =
  | 'Reps'
  | 'Rounds + Reps'
  | 'Load'
  | 'Time'
  | 'Distance'
  | 'Calories'
  | 'Duration / Hold'
  | 'Quality'
  | 'Height / Range'
  | 'Not Scored / N/A';
```

- [x] **Step 7: Verify + commit**

```bash
cd mobile && npx tsc --noEmit && npx jest
bash scripts/movement-model/probe_reads.sh && bash scripts/movement-model/probe_capture.sh
```

```bash
git add mobile/src/lib/supabase/capture.ts mobile/src/lib/supabase/daily.ts mobile/src/lib/supabase/crossfit.ts mobile/src/lib/wodDetailHelpers.ts mobile/src/components/training/crossfit/WODMovementsStep.tsx mobile/src/components/training/crossfit/MovementConfigModal.tsx mobile/src/types/crossfit.ts
git commit -m "refactor(catalog): equipment reads move to the exercise_equipment junction (Stage 6)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Edge function `generate-exercise-image` 🚧 DEPLOY GATE

The only edge function touching a drop target. It 400s at its select the moment the column drops.

**Files:**
- Modify: `supabase/functions/generate-exercise-image/index.ts:51, 65`

- [x] **Step 1: Swap the select and prompt source**

Line 51:

```ts
    const { data: exercise, error: exerciseError } = await supabase.from('exercises').select('id, name, description, exercise_equipment(equipment(name))').eq('id', exerciseId).single();
```

Line 65 (prompt equipment):

```ts
    const equipmentList = (exercise.exercise_equipment ?? [])
      .map((ee: any) => ee.equipment?.name)
      .filter(Boolean)
      .join(', ') || 'bodyweight';
```

- [x] **Step 2: 🚧 GATE — deploy with Brian's go-ahead**

```bash
supabase functions deploy generate-exercise-image
```

Then verify: in the app, open any exercise without an image and tap Generate; the Metro log shows the prompt including real equipment names (the Stage 5 exit-gate log line format: `Generating item image with prompt: ... Equipment: Kettlebell, Bench. ...`).

- [x] **Step 3: Commit**

```bash
git add supabase/functions/generate-exercise-image/index.ts
git commit -m "fix(edge): exercise image prompt reads equipment junction (Stage 6)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Scope parent candidacy to official-or-own rows 🚧 LIVE GATE

Stage 5 quality-review hand-off: the engine's parent selection has no ownership filter, so a user's private row can become an official row's parent (dangling hierarchy for other users). Fix: a parent candidate must be official OR share the child's owner. The other two hardening hand-offs are explicitly DEFERRED (Task 13 records this): wild-alias scoping waits for the multi-user milestone (solo user today; the carve-out is deliberate Stage 5 behavior), and fingerprint slot-squatting is handled by playbook (promote or rename the private row during official curation) rather than constraint surgery.

**Files:**
- Create: `supabase/migrations/20260914110000_scope_parent_candidacy.sql`

- [x] **Step 1: Write the migration**

`CREATE OR REPLACE` the worker with the current source from `supabase/migrations/20260909100000_turn_the_locks.sql:117-209` COPIED VERBATIM, then apply exactly two edits (everything else byte-identical — the function is engine-critical):

Edit 1 — the `SELECT ... INTO v_old` gains `created_by`:

```sql
  SELECT core_movement_id, is_core, identity_fingerprint, parent_exercise_id,
         tier, generated_name, name, name_is_custom, created_by
    INTO v_old FROM exercises WHERE id = p_id;
```

Edit 2 — the parent-candidate query gains one predicate (after the cardinality line):

```sql
    SELECT c.id, c.tier INTO v_parent, v_ptier
    FROM exercises c
    WHERE c.core_movement_id = v_core AND c.id <> p_id
      AND exercise_identity_attrs(c.id) <@ v_attrs
      AND cardinality(exercise_identity_attrs(c.id)) < cardinality(v_attrs)
      -- Stage 6 hardening: a private row must never become another owner's
      -- parent — candidates are official rows, or rows sharing this row's
      -- owner. Without this, a user row can squat inside the official
      -- hierarchy and dangle for everyone else (Stage 5 review hand-off).
      AND (c.is_official OR c.created_by IS NOT DISTINCT FROM v_old.created_by)
    ORDER BY cardinality(exercise_identity_attrs(c.id)) DESC, c.created_at ASC, c.id ASC
    LIMIT 1;
```

Keep the function's `SECURITY DEFINER SET search_path = public` header and its REVOKE state (already REVOKEd from PUBLIC/anon/authenticated in Stage 5 — CREATE OR REPLACE preserves ACLs, but assert it in Step 3's rehearsal anyway).

- [x] **Step 2: Pre-check both environments for rows the new rule would re-parent**

```bash
psql postgresql://postgres:postgres@127.0.0.1:56322/postgres -c "
SELECT child.name AS child, p.name AS bad_parent
FROM exercises child JOIN exercises p ON p.id = child.parent_exercise_id
WHERE NOT p.is_official AND p.created_by IS DISTINCT FROM child.created_by;"
```

Expected: 0 rows (also run the equivalent REST/psql check against live before the push). If rows appear, list them for Brian — they are existing infiltrations and re-parent on the family's next recompute; note them in the push report.

- [x] **Step 3: Rehearse on staging with a hostile scenario**

```bash
psql postgresql://postgres:postgres@127.0.0.1:56322/postgres -v ON_ERROR_STOP=1 -f supabase/migrations/20260914110000_scope_parent_candidacy.sql
psql postgresql://postgres:postgres@127.0.0.1:56322/postgres -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SET LOCAL ROLE postgres;
-- Private row {Dumbbell} under Thruster, owned by a user.
WITH core AS (SELECT id FROM exercises WHERE name = 'Thruster' AND tier = 0),
u AS (SELECT id FROM auth.users LIMIT 1),
ins AS (
  INSERT INTO exercises (name, slug, core_movement_id, is_official, created_by)
  SELECT 'ZZ Private Dumbbell Thruster', 'zz-priv-db-thruster', core.id, false, u.id
  FROM core, u RETURNING id
)
INSERT INTO exercise_equipment (exercise_id, equipment_id)
SELECT ins.id, e.id FROM ins, equipment e WHERE e.name = 'Dumbbell';

-- Official row {Dumbbell + Strict}: its attrs SUPERSET the private row's.
WITH core AS (SELECT id FROM exercises WHERE name = 'Thruster' AND tier = 0),
ins AS (
  INSERT INTO exercises (name, slug, core_movement_id, is_official, created_by)
  SELECT 'ZZ Official Strict DB Thruster', 'zz-off-strict-db-thruster', core.id, true, NULL
  FROM core RETURNING id
)
INSERT INTO exercise_equipment (exercise_id, equipment_id)
SELECT ins.id, e.id FROM ins, equipment e WHERE e.name = 'Dumbbell';
INSERT INTO exercise_movement_styles (exercise_id, movement_style_id)
SELECT x.id, ms.id FROM exercises x, movement_styles ms
WHERE x.slug = 'zz-off-strict-db-thruster' AND ms.name = 'Strict';

-- The official row must parent to the CORE, not the private superset-path row.
DO $$
DECLARE v_parent TEXT;
BEGIN
  SELECT p.name INTO v_parent FROM exercises c JOIN exercises p ON p.id = c.parent_exercise_id
  WHERE c.slug = 'zz-off-strict-db-thruster';
  IF v_parent <> 'Thruster' THEN
    RAISE EXCEPTION 'FAIL: official row parented to %, expected core Thruster', v_parent;
  END IF;
  RAISE NOTICE 'PASS: private row excluded from official parent candidacy';
END $$;

-- Same-owner chaining still works: a second private row {Dumbbell, Strict}
-- by the SAME user must parent to that user's {Dumbbell} row.
WITH core AS (SELECT id FROM exercises WHERE name = 'Thruster' AND tier = 0),
u AS (SELECT created_by AS id FROM exercises WHERE slug = 'zz-priv-db-thruster'),
ins AS (
  INSERT INTO exercises (name, slug, core_movement_id, is_official, created_by)
  SELECT 'ZZ Private Strict DB Thruster', 'zz-priv-strict-db-thruster', core.id, false, u.id
  FROM core, u RETURNING id
)
INSERT INTO exercise_equipment (exercise_id, equipment_id)
SELECT ins.id, e.id FROM ins, equipment e WHERE e.name = 'Dumbbell';
INSERT INTO exercise_movement_styles (exercise_id, movement_style_id)
SELECT x.id, ms.id FROM exercises x, movement_styles ms
WHERE x.slug = 'zz-priv-strict-db-thruster' AND ms.name = 'Strict';
DO $$
DECLARE v_parent TEXT;
BEGIN
  SELECT p.name INTO v_parent FROM exercises c JOIN exercises p ON p.id = c.parent_exercise_id
  WHERE c.slug = 'zz-priv-strict-db-thruster';
  IF v_parent <> 'ZZ Private Dumbbell Thruster' THEN
    RAISE EXCEPTION 'FAIL: same-owner chain broken — parented to %', v_parent;
  END IF;
  RAISE NOTICE 'PASS: same-owner private chaining intact';
END $$;
ROLLBACK;
SQL
psql postgresql://postgres:postgres@127.0.0.1:56322/postgres -f scripts/movement-model/verify_foundation.sql
```

NOTE: the fingerprint collision guard applies — the scenario's attribute sets ({Dumbbell} vs {Dumbbell,Strict}) are chosen to be distinct from each other AND from every existing Thruster-family row; if the family gains rows before execution, adjust the attribute picks to stay collision-free. Expected: both PASS notices, harness green, everything rolled back. Also run `bash scripts/movement-model/probe_front_door.sh` after (engine behavior unchanged for the app's own writes).

- [x] **Step 4: 🚧 GATE — live push**

Report rehearsal results; on Brian's "push": `supabase db push`, then re-run the Step-2 check against live (expect 0 rows re-parented, or exactly the ones reported).

- [x] **Step 5: Commit**

```bash
git add supabase/migrations/20260914110000_scope_parent_candidacy.sql
git commit -m "feat(engine): parent candidates must be official or same-owner (Stage 6 hardening)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: THE DROP 🚧 LIVE GATE

Only after Tasks 6–11 are committed and the Task 10 deploy is live — after this migration, code still reading a legacy structure 400s.

**Files:**
- Create: `supabase/migrations/20260915100000_retire_legacy.sql`
- Modify: `scripts/movement-model/verify_foundation.sql` (V7 block, lines ~452-519)
- Modify: `scripts/movement-model/dump_live_data.sh:17-19`, `scripts/movement-model/swap_fresh_dump.sql:30-38`, `scripts/movement-model/probe_wizard_payload.sh:112-113`

- [x] **Step 1: FIRST — take the final pre-drop backup with the UNMODIFIED dump script**

```bash
bash scripts/movement-model/dump_live_data.sh
```

This is the last backup that can ever capture the legacy tables' contents. Note the produced `backups/catalog_data_*.sql` filename in the commit message. Only after this backup exists may the script be edited.

- [x] **Step 2: Write the drop migration**

```sql
-- Stage 6 (spec Phase 7): retire legacy catalog storage. Every attribute
-- now lives in exactly one place:
--   goal types        → exercise_goal_types junction
--   movement styles   → exercise_movement_styles junction
--   equipment         → exercise_equipment junction
--   aliases           → exercise_aliases table
--   plane/load/stance → single FK columns on exercises (these SURVIVE)
--   variations        → the derivation hierarchy (children of a core)
-- Final pre-drop backup: see commit message (dump_live_data.sh run of this date).

ALTER TABLE public.exercises
  DROP COLUMN IF EXISTS goal_type_id,
  DROP COLUMN IF EXISTS movement_style_id,
  DROP COLUMN IF EXISTS equipment_types,
  DROP COLUMN IF EXISTS aliases;

-- Vestigial variant-pointer columns on OTHER tables (all 100% NULL on live and
-- staging, verified 2026-09-09; their FK constraints would otherwise block the
-- table drops below). Found during Task 8 review.
ALTER TABLE public.exercise_standards DROP COLUMN IF EXISTS variation_option_id;
ALTER TABLE public.movement_measurement_profiles DROP COLUMN IF EXISTS variation_option_id;
ALTER TABLE public.movement_scaling_links
  DROP COLUMN IF EXISTS from_variation_option_id,
  DROP COLUMN IF EXISTS to_variation_option_id;

-- Children before parents (FKs).
DROP TABLE IF EXISTS public.exercise_variations;
DROP TABLE IF EXISTS public.variation_options;
DROP TABLE IF EXISTS public.variation_categories;
DROP TABLE IF EXISTS public.exercise_planes_of_motion;
DROP TABLE IF EXISTS public.exercise_load_positions;
DROP TABLE IF EXISTS public.exercise_stances;
```

- [x] **Step 2b: Clean the dead variant-filter params in app code**

Five functions in `mobile/src/lib/supabase/crossfit.ts` (exercise standards, measurement profiles, progression/regression fetchers) accept an optional `variationOptionId` and `.eq()` on the columns dropped above. No caller passes the argument (verified in Task 8 review). Delete the parameter and its filter branch from each; `npx tsc --noEmit` proves no caller breaks. These reference `variation_option_id` column names, which the exit-gate grep pattern does NOT catch — this step is the cleanup.

- [x] **Step 3: Invert the harness's V7 guard**

In `verify_foundation.sql`, replace the V7 block (which today raises `V7 FAIL: ... dropped early` if the structures are MISSING) with the absence assertion:

```sql
-- V7 (Stage 6): the legacy structures are GONE. Their presence now means a
-- failed or skipped drop, not safety.
DO $$
DECLARE bad TEXT := '';
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'exercises'
               AND column_name IN ('goal_type_id','movement_style_id','equipment_types','aliases')) THEN
    bad := bad || ' legacy exercises columns;';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public'
               AND table_name IN ('exercise_planes_of_motion','exercise_load_positions','exercise_stances',
                                  'exercise_variations','variation_options','variation_categories')) THEN
    bad := bad || ' legacy tables;';
  END IF;
  IF bad <> '' THEN
    RAISE EXCEPTION 'V7 FAIL: legacy structures still present:%', bad;
  END IF;
  RAISE NOTICE 'V7 PASS: all legacy structures dropped';
END $$;
```

- [x] **Step 4: Update the tooling scripts**

- `dump_live_data.sh:17-19`: remove the six dropped tables from the `-t` list (they no longer exist; pg_dump errors on missing tables).
- `swap_fresh_dump.sql:30-38`: remove the `DELETE FROM exercise_planes_of_motion/exercise_load_positions/exercise_stances` lines.
- `probe_wizard_payload.sh:112-113`: read the assertion there; it checks the legacy compat mirror (`equipment_types`/`goal_type_id` on the created row). Replace it with the junction assertions (select `exercise_equipment`/`exercise_goal_types` rows for the created exercise and assert the expected counts/ids — match the probe's existing assertion style).
- Leave `generate_catalog_pass.py` and `audit_worksheet.sql` UNTOUCHED: the generator must keep regenerating the Stage 3 migration byte-identically, and both are pre-drop-era tools. Add one header comment line to each: `# NOTE: pre-Stage-6 tool — references legacy structures that no longer exist; historical use only.` (`--` comment for the .sql file). Verify the generator still regenerates byte-identically afterward:

```bash
python3 scripts/movement-model/generate_catalog_pass.py --check 2>/dev/null || \
  { python3 scripts/movement-model/generate_catalog_pass.py && git diff --exit-code supabase/migrations/20260908100000_catalog_pass.sql; }
```

Expected: no diff.

- [x] **Step 5: Rehearse on staging**

```bash
psql postgresql://postgres:postgres@127.0.0.1:56322/postgres -v ON_ERROR_STOP=1 -f supabase/migrations/20260915100000_retire_legacy.sql
psql postgresql://postgres:postgres@127.0.0.1:56322/postgres -f scripts/movement-model/verify_foundation.sql
bash scripts/movement-model/probe_front_door.sh
bash scripts/movement-model/probe_wizard_payload.sh
bash scripts/movement-model/probe_reads.sh
bash scripts/movement-model/probe_capture.sh
cd mobile && npx jest && cd ..
```

Expected: harness V0–V11 PASS (V7 now asserts absence), all four probe suites PASS against the dropped schema, jest green. This is the real proof the app works post-drop.

- [x] **Step 6: 🚧 GATE — live push**

Report rehearsal results; on Brian's "push":

```bash
supabase db push
```

Then run the exit-gate proof against live REST: a select naming a dropped column must 400, and the app's own reads (probe suites pointed at live are NOT run — live probes would write; instead verify via anon REST that `exercises?select=id&limit=1` succeeds while `exercises?select=equipment_types&limit=1` errors).

- [x] **Step 7: Commit**

```bash
git add supabase/migrations/20260915100000_retire_legacy.sql scripts/movement-model/
git commit -m "feat(catalog)!: drop legacy columns and tables (Stage 6 / spec Phase 7)

Final pre-drop backup: backups/catalog_data_<timestamp>.sql
V7 harness guard inverted to assert absence.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Exit-gate proof and final verification

- [x] **Step 1: The roadmap's exit gate — grep proves no app code references a dropped structure**

```bash
grep -rn "equipment_types\|goal_type_id\|movement_style_id\|exercise_planes_of_motion\|exercise_load_positions\|exercise_stances\|exercise_variations\|variation_options\|variation_categories" \
  mobile/src supabase/functions --include='*.ts' --include='*.tsx' \
  | grep -v "exercise_goal_types\|exercise_movement_styles\|goal_type_ids\|movement_style_ids"
```

Expected residue: ONLY junction-internal column reads (e.g. a select of `goal_type_id` INSIDE an `exercise_goal_types(...)` embed, or `movement_style_id` on `exercise_movement_styles` rows) and the in-memory `WODMovementConfig.equipment_types` field (never a DB read). Anything else = a miss; fix it and re-run. Also:

```bash
grep -rn "\.aliases\b" mobile/src --include='*.ts' --include='*.tsx'
```

Expected: no `exercises.aliases` reads (form-state `formData.aliases` and `exercise_aliases` usage are fine).

- [x] **Step 2: Full suite, one last time**

```bash
cd mobile && npx tsc --noEmit && npx jest && cd ..
psql postgresql://postgres:postgres@127.0.0.1:56322/postgres -f scripts/movement-model/verify_foundation.sql
```

- [x] **Step 3: Record the deferred hardening decisions**

In `docs/superpowers/plans/2026-08-24-movement-model-roadmap.md`, Stage 6 section: tick the parent-candidacy box (done, Task 11) and EDIT the wild-alias box (do not tick) to read that it is deferred to the multi-user milestone with rationale (solo user; carve-out is deliberate Stage 5 behavior; revisit when accounts multiply). Add one line documenting the slot-squatting playbook: "a private row squatting a (core, fingerprint) slot is resolved during official curation by promoting the row (`is_official=true`, curated fields) or renaming its identity — no constraint surgery."

- [x] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-08-24-movement-model-roadmap.md
git commit -m "docs(roadmap): Stage 6 exit-gate grep proof + deferred-hardening decisions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: Close out Stage 6

- [x] **Step 1: Spec** — in `docs/superpowers/specs/2026-08-24-movement-model-redesign-design.md`, annotate the Phase 7 bullet (line 99): `**Executed 2026-09-XX** (migration 20260915100000_retire_legacy.sql; V7 guard inverted).` Match the spec's existing amendment style (prior stages appended dated execution notes rather than rewriting).

- [x] **Step 2: Roadmap** — tick every remaining Stage 6 box (legacy drops, final verification suite, curation pass, exit gate) with dates and migration filenames, in the same voice as the Stage 5 closure entry.

- [x] **Step 3: Memory** — update `~/.claude/projects/-Users-brianwilson-code-fittracker/memory/project_movement_model_redesign.md`: description line says the redesign is COMPLETE (Stages 1–6 live); body records the three Stage 6 migrations, the final backup filename, the inverted V7, the deferred alias-scoping decision, and that `generate_catalog_pass.py`/`audit_worksheet.sql` are historical pre-drop tools. Update the matching line in `MEMORY.md`.

- [x] **Step 4: Push and final report**

```bash
git push
```

Report: what shipped, live state (migrations applied, backup taken, harness green), what remains (alias scoping at multi-user; any items Brian deferred from the curation sheet).

---

## Self-review (2026-09-09)

**Spec coverage:** Phase 7 drop list → Task 12 (all eight structures, exact names); V7 retirement → Task 12 Step 3; "only after Phase 6 ships" → satisfied (Stage 5 exit gate passed 2026-09-09). Roadmap Stage 6 boxes: parent-candidacy → Task 11; curation directive → Tasks 3-5; wild-alias scoping → deliberately deferred with decision recorded (Task 13 Step 3 — deferral, not omission, per roadmap's own "address here or in a dedicated hardening pass" wording); legacy drops → Task 12; verification suite → Task 13; exit-gate grep → Task 13 Step 1. Exit-gate UI follow-ups (chips undo/confirm → confirm chosen, Task 1; "Standard — as core" → Task 2). Edge functions reading legacy → Task 10 (sweep found exactly one).

**Known judgment calls baked in:** (1) confirm-dialog instead of undo (reversal surface is 4 tables with upsert ambiguity); (2) `ExerciseWithVariations` keeps its historical name; (3) in-memory `WODMovementConfig.equipment_types` field name survives; (4) `Not Scored / N/A` expresses "scoring not relevant" so the wizard can require ≥1 scoring type unconditionally; (5) outlier curation values are authored at Task 3 execution from the generated sheet and gated on Brian — the cores' values are pre-authored in this plan.

**Placeholder scan:** clean — every code step carries the code; the two VALUES lists marked "from the approved sheet" are gate outputs by design, with shape and defaults specified.

**Type consistency:** `missingClassification` (Tasks 5); `equipment_rows` embed name used consistently (Tasks 9); `goal_rows` only in TrainingItemDetailScreen (Task 7); `fetchCoreDescription` (Task 2) matches its single call site.

