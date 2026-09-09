import { supabase } from '../supabase';
import type { SkillLevel } from '../../types/crossfit';

// ============================================================================
// FRONT DOOR — the sole write path for the exercises catalog (Stage 5, Task 1)
// ============================================================================
//
// Every insert/update of an `exercises` row goes through createCatalogExercise
// / updateCatalogExercise — the sole writer, with no exceptions: Task 4
// retired capture's legacy createExercise path (capture links through the
// alias dictionary and queues unknowns in exercise_match_reviews instead of
// minting rows). The Postgres engine (Stages 1–4)
// hierarchy: this module NEVER writes `generated_name`, `identity_fingerprint`,
// `tier`, or `parent_exercise_id` — it writes the identity inputs and reads the
// engine's outputs back. The client is UNTYPED, so column names here are
// verified by the committed staging probe (scripts/movement-model/
// probe_front_door.sh), not by the compiler.
//
// TRANSACTION BOUNDARY NOTE: REST gives no multi-statement transaction, and
// exercises_fingerprint_key is INITIALLY IMMEDIATE, so an UPDATE's junction
// diff passes through intermediate identities the constraint can see. The
// mitigations here (insert-before-delete, opposite-order retry, transient-vs-
// duplicate fingerprint comparison) close the practical cases; the airtight
// alternative — a SECURITY-DEFINER transactional junction-swap RPC — is
// deliberately deferred to the Task 5 migration if reviews demand it.
// CREATE is immune by construction: rows are created CORE-LAST (coreless rows
// have a NULL fingerprint), so the one recompute that matters fires against
// the complete identity — see createCatalogExercise.

// ── Typed errors ────────────────────────────────────────────────────────────

/**
 * The row's identity (core + attribute set) already exists in the catalog.
 *
 * DECISION (Stage 4 review M5, live the moment user rows gain cores):
 * fingerprint uniqueness stays GLOBAL — NOT scoped by created_by. Rationale:
 * single-developer app; a user variant identical to an official row IS the
 * duplicate the model exists to prevent, and this error surfaces the existing
 * row instead of failing opaquely. Revisit only if the app ever becomes
 * multi-tenant-authored.
 */
export class DuplicateExerciseError extends Error {
  /** The row that already owns this identity (null only if the lookup failed). */
  existing: CatalogExerciseRow | null;
  constructor(existing: CatalogExerciseRow | null) {
    super(
      existing
        ? `An exercise with this exact identity already exists: ${existing.name}`
        : 'An exercise with this exact identity already exists.',
    );
    this.name = 'DuplicateExerciseError';
    this.existing = existing;
  }
}

/** The chosen core_movement_id does not reference an is_core row (engine rejection). */
export class CoreValidationError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'CoreValidationError';
  }
}

/** Two deadlock rejections in a row (the first is retried automatically). */
export class CatalogDeadlockError extends Error {
  constructor() {
    super('The catalog write deadlocked twice; please try again.');
    this.name = 'CatalogDeadlockError';
  }
}

/** The input violates a front-door contract (G2 variant scoping, outlier naming…). */
export class CatalogInputError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'CatalogInputError';
  }
}

/**
 * A mid-save intermediate identity collided with an existing exercise even
 * though the FINAL identity is free (no REST transaction: each junction
 * statement fires the recompute against the IMMEDIATE fingerprint constraint).
 * Both statement orders were tried where an alternative existed. NOT a
 * duplicate — the caller should apply the change in two saves.
 */
export class CatalogTransientCollisionError extends Error {
  constructor() {
    super(
      'This change passes through an identity that already exists mid-save. ' +
        'Apply the change in two saves (remove the old attribute or equipment ' +
        'and save, then add the new one and save again).',
    );
    this.name = 'CatalogTransientCollisionError';
  }
}

/** The target row does not exist, or RLS hides/forbids it (official/foreign row). */
export class CatalogNotFoundOrForbiddenError extends Error {
  constructor(id: string) {
    super(`Exercise ${id} was not found, or you are not allowed to modify it.`);
    this.name = 'CatalogNotFoundOrForbiddenError';
  }
}

/** The naming engine did not run on insert — the DB triggers are missing/broken. */
export class EngineNotRunningError extends Error {
  constructor() {
    super('The naming engine did not generate a name on insert; the catalog triggers appear to be missing.');
    this.name = 'EngineNotRunningError';
  }
}

/** Slug uniqueness kept colliding after bounded regeneration attempts. */
export class CatalogSlugCollisionError extends Error {
  constructor() {
    super('Could not find a free slug after repeated attempts.');
    this.name = 'CatalogSlugCollisionError';
  }
}

// ── Input / output shapes ───────────────────────────────────────────────────

/** One FK column each — the model is single-select per identity attribute. */
export interface CatalogIdentityAttributes {
  load_position_id?: string | null;
  stance_id?: string | null;
  range_depth_id?: string | null;
  symmetry_id?: string | null;
  grip_orientation_id?: string | null;
  grip_width_id?: string | null;
  direction_id?: string | null;
  support_position_id?: string | null;
  arm_position_id?: string | null;
  bench_angle_id?: string | null;
  /** Only from `variant_labels` rows scoped to the chosen core (guardrail G2). */
  variant_label_id?: string | null;
}

export interface CreateCatalogExerciseInput extends CatalogIdentityAttributes {
  /** Optional custom display name. Omit it to let the engine name the row. */
  name?: string | null;
  /** null = outlier: no engine naming/tier; a custom name is then required. */
  core_movement_id: string | null;
  /**
   * Create a CORE movement: the DB trigger self-references core_movement_id,
   * the engine sets tier 0. A core needs a name (it IS the naming noun) and
   * must not also name a core_movement_id. Not editable after create
   * (promotion/demotion is curation tooling, not an app write).
   */
  is_core?: boolean;
  /** Equipment junction rows (part of the identity fingerprint). */
  equipment_ids?: string[];
  /**
   * Movement styles junction (exercise_movement_styles). Identity styles
   * (movement_styles.is_identity) are fingerprint members; modifier styles
   * are carried but identity-inert. Both are accepted here.
   */
  movement_style_ids?: string[];
  /** Scoring types junction; a 'Distance' member derives requires_distance. */
  scoring_type_ids?: string[];
  primary_muscle_region_ids?: string[];
  secondary_muscle_region_ids?: string[];
  goal_type_ids?: string[];
  movement_family_id?: string | null;
  /** Modality (movement_categories row). */
  movement_category_id?: string | null;
  is_movement: boolean;
  /** Legacy-compat column (until Stage 6). */
  skill_level?: SkillLevel | null;
  /** Abbreviated display name (e.g. "C2B"); plain column, not identity. */
  short_name?: string | null;
  description?: string | null;
  video_url?: string | null;
  image_url?: string | null;
  created_by: string;
}

export type UpdateCatalogExercisePatch = Partial<
  Omit<CreateCatalogExerciseInput, 'created_by' | 'is_movement' | 'is_core'>
> & {
  /** Drop a custom name and hand naming back to the engine (needs a core). */
  clear_custom_name?: boolean;
};

/** The stored row, engine-owned columns included (read back after every write). */
export interface CatalogExerciseRow extends CatalogIdentityAttributes {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  generated_name: string | null;
  identity_fingerprint: string | null;
  tier: number | null;
  parent_exercise_id: string | null;
  name_is_custom: boolean;
  core_movement_id: string | null;
  is_core: boolean;
  is_movement: boolean;
  is_official: boolean;
  created_by: string | null;
  movement_family_id: string | null;
  movement_category_id: string | null;
  skill_level: string | null;
  short_name: string | null;
  equipment_types: string[] | null;
  requires_weight: boolean;
  requires_distance: boolean;
  goal_type_id: string | null;
  video_url: string | null;
  image_url: string | null;
}

const ROW_COLUMNS =
  'id, name, slug, description, generated_name, identity_fingerprint, tier, ' +
  'parent_exercise_id, name_is_custom, core_movement_id, is_core, is_movement, ' +
  'is_official, created_by, movement_family_id, movement_category_id, ' +
  'skill_level, short_name, equipment_types, requires_weight, requires_distance, ' +
  'goal_type_id, video_url, ' +
  'image_url, load_position_id, stance_id, range_depth_id, symmetry_id, ' +
  'grip_orientation_id, grip_width_id, direction_id, support_position_id, ' +
  'arm_position_id, bench_angle_id, variant_label_id';

const IDENTITY_COLUMNS = [
  'load_position_id',
  'stance_id',
  'range_depth_id',
  'symmetry_id',
  'grip_orientation_id',
  'grip_width_id',
  'direction_id',
  'support_position_id',
  'arm_position_id',
  'bench_angle_id',
  'variant_label_id',
] as const;

/** Engine writes `name` over this the moment the row has a core. */
const PLACEHOLDER_NAME = '(pending engine name)';

const SLUG_ATTEMPTS = 3;

// ── Error classification ────────────────────────────────────────────────────

interface PgLikeError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}

function isFingerprintCollision(err: PgLikeError): boolean {
  return err.code === '23505' && (err.message ?? '').includes('exercises_fingerprint_key');
}

function isSlugCollision(err: PgLikeError): boolean {
  return err.code === '23505' && (err.message ?? '').includes('exercises_slug_key');
}

function isDeadlock(err: PgLikeError): boolean {
  return err.code === '40P01';
}

function isCoreValidation(err: PgLikeError): boolean {
  // enforce_core_self_reference raises P0001 with this phrasing.
  return (err.message ?? '').includes('does not reference a core movement');
}

/** PostgREST "JSON object requested, 0 rows" — the RLS-or-missing signature. */
function isZeroRows(err: PgLikeError): boolean {
  return err.code === 'PGRST116';
}

/**
 * The 23505 detail names the colliding key:
 * "Key (core_movement_id, identity_fingerprint)=(<uuid>, <fp>) already exists."
 * Parsing it is the exact lookup; the client-side fingerprint is the fallback.
 */
function parseCollisionKey(details: string | null | undefined): {
  coreId: string;
  fingerprint: string;
} | null {
  const m = /\(core_movement_id, identity_fingerprint\)=\(([^,]+), ([^)]*)\)/.exec(details ?? '');
  return m ? { coreId: m[1].trim(), fingerprint: m[2].trim() } : null;
}

/**
 * Client-side mirror of exercise_identity_attrs + fingerprint join: the sorted
 * attribute uuid set joined by '|'. Postgres orders uuids byte-wise, which for
 * lowercased canonical text is plain lexicographic order. `extraIds` carries
 * junction-sourced identity members (equipment, identity movement styles).
 */
export function clientFingerprint(
  attrs: CatalogIdentityAttributes,
  extraIds: string[],
): string {
  const ids: string[] = [];
  for (const col of IDENTITY_COLUMNS) {
    const v = attrs[col];
    if (v) ids.push(v.toLowerCase());
  }
  for (const id of extraIds) ids.push(id.toLowerCase());
  return ids.sort().join('|');
}

// ── Error mapping ───────────────────────────────────────────────────────────

interface ErrCtx {
  coreId: string | null;
  /**
   * The identity the row will hold once the WHOLE save has been applied
   * (null = unknown: outlier, or a patch that cannot change identity).
   * A 23505 whose colliding fingerprint differs from this is a TRANSIENT
   * ordering artifact of the non-transactional save — never a duplicate.
   */
  finalFingerprint: string | null;
  /** Update statements: 0 rows means RLS-hidden/forbidden, not "no change". */
  targetId?: string;
}

async function findExistingByIdentity(
  key: { coreId: string; fingerprint: string } | null,
  ctx: ErrCtx,
): Promise<CatalogExerciseRow | null> {
  // Fallback when the detail did not parse: the intended final fingerprint.
  // If that is unknown too (outlier / identity-blind patch — the identity-
  // movement-styles caveat lives in the callers that compute it), the error
  // still throws, just without the existing row attached.
  const lookup =
    key ?? (ctx.coreId && ctx.finalFingerprint != null
      ? { coreId: ctx.coreId, fingerprint: ctx.finalFingerprint }
      : null);
  if (!lookup) return null;
  const { data } = await supabase
    .from('exercises')
    .select(ROW_COLUMNS)
    .eq('core_movement_id', lookup.coreId)
    .eq('identity_fingerprint', lookup.fingerprint)
    .maybeSingle();
  let row = (data as unknown as CatalogExerciseRow | null) ?? null;
  // Duplicate race: the winning writer may not have finished its own readback
  // dance yet. Give the engine one beat and re-read; if the placeholder still
  // stands, return the row as-is (the id is right; the name is cosmetic).
  if (row && row.name === PLACEHOLDER_NAME) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const { data: reread } = await supabase
      .from('exercises')
      .select(ROW_COLUMNS)
      .eq('id', row.id)
      .maybeSingle();
    row = (reread as unknown as CatalogExerciseRow | null) ?? row;
  }
  return row;
}

/** Map a Postgres rejection to the typed front-door error and throw it. */
async function mapAndThrow(err: PgLikeError, ctx: ErrCtx): Promise<never> {
  if (isFingerprintCollision(err)) {
    const key = parseCollisionKey(err.details);
    // Transient-vs-duplicate: a collision on a fingerprint that is NOT the
    // save's final identity is an intermediate-state artifact, not a duplicate.
    if (key && ctx.finalFingerprint != null && key.fingerprint !== ctx.finalFingerprint) {
      throw new CatalogTransientCollisionError();
    }
    // See the M5 decision note on DuplicateExerciseError: global uniqueness.
    throw new DuplicateExerciseError(await findExistingByIdentity(key, ctx));
  }
  if (isCoreValidation(err)) {
    throw new CoreValidationError(err.message ?? 'core_movement_id does not reference a core movement');
  }
  if (isDeadlock(err)) {
    throw new CatalogDeadlockError();
  }
  if (isZeroRows(err) && ctx.targetId) {
    throw new CatalogNotFoundOrForbiddenError(ctx.targetId);
  }
  throw new Error(err.message ?? 'Catalog write failed');
}

/**
 * Run one write statement; a 40P01 deadlock (family recompute lock ordering)
 * is retried exactly once, per the Stage 4 notes.
 */
async function withDeadlockRetry<T>(
  op: () => PromiseLike<{ data: T; error: PgLikeError | null }>,
): Promise<{ data: T; error: PgLikeError | null }> {
  const first = await op();
  if (first.error && isDeadlock(first.error)) {
    return await op();
  }
  return first;
}

// ── Slug generation (legacy compat, moved here from crossfit.ts) ────────────

/**
 * Generate a unique slug for an exercise name via collision probing.
 * If the base slug exists, appends a number (e.g., squat-2, squat-3).
 * A probe error THROWS — it must never read as "slug free".
 */
export async function generateUniqueSlug(name: string): Promise<string> {
  const baseSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const taken = async (slug: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('exercises')
      .select('slug')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data != null;
  };

  if (!(await taken(baseSlug))) return baseSlug;
  for (let counter = 2; counter < 100; counter++) {
    const numberedSlug = `${baseSlug}-${counter}`;
    if (!(await taken(numberedSlug))) return numberedSlug;
  }
  // Fallback: append timestamp
  return `${baseSlug}-${Date.now()}`;
}

function placeholderSlug(): string {
  return `pending-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Shared helpers ──────────────────────────────────────────────────────────

function dedupe(ids: string[] | undefined): string[] {
  return Array.from(new Set(ids ?? []));
}

/** Legacy requires_weight derivation, identical to the old writers'. */
const WEIGHTED_EQUIPMENT = ['Barbell', 'Dumbbell', 'Kettlebell', 'Med Ball', 'Plate', 'Sandbag'];
function deriveRequiresWeight(equipmentNames: string[]): boolean {
  return equipmentNames.some((eq) =>
    WEIGHTED_EQUIPMENT.some((w) => eq.toLowerCase().includes(w.toLowerCase())),
  );
}

async function fetchEquipmentNames(equipmentIds: string[]): Promise<string[]> {
  if (equipmentIds.length === 0) return [];
  const { data, error } = await supabase
    .from('equipment')
    .select('id, name')
    .in('id', equipmentIds);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; name: string }[];
  if (rows.length !== equipmentIds.length) {
    throw new CatalogInputError('One or more equipment ids do not exist.');
  }
  // Preserve input order so the legacy array is deterministic.
  const byId = new Map(rows.map((r) => [r.id, r.name]));
  return equipmentIds.map((id) => byId.get(id)!);
}

async function fetchEquipmentIdsOf(exerciseId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('exercise_equipment')
    .select('equipment_id')
    .eq('exercise_id', exerciseId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { equipment_id: string }[]).map((r) => r.equipment_id);
}

/**
 * Validate movement style ids and split them by identity: identity styles are
 * fingerprint members, modifier styles are identity-inert junction rows.
 */
async function fetchStyleRows(
  styleIds: string[],
): Promise<{ id: string; is_identity: boolean }[]> {
  if (styleIds.length === 0) return [];
  const { data, error } = await supabase
    .from('movement_styles')
    .select('id, is_identity')
    .in('id', styleIds);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; is_identity: boolean }[];
  if (rows.length !== styleIds.length) {
    throw new CatalogInputError('One or more movement style ids do not exist.');
  }
  return rows;
}

/**
 * Legacy requires_distance derivation, identical to the old writer's: true
 * iff the scoring set includes the 'Distance' scoring type. Also validates
 * the ids exist.
 */
async function deriveRequiresDistance(scoringTypeIds: string[]): Promise<boolean> {
  if (scoringTypeIds.length === 0) return false;
  const { data, error } = await supabase
    .from('scoring_types')
    .select('id, name')
    .in('id', scoringTypeIds);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; name: string }[];
  if (rows.length !== scoringTypeIds.length) {
    throw new CatalogInputError('One or more scoring type ids do not exist.');
  }
  return rows.some((r) => r.name === 'Distance');
}

/**
 * Drift alarm: after a successful save, the stored fingerprint must equal the
 * client's mirror of the final identity. A mismatch means clientFingerprint
 * and exercise_identity_attrs() have drifted apart — the transient-vs-
 * duplicate discriminator is then unsound. Loud, never fatal: the save itself
 * is done and correct (the ENGINE owns the truth; the client mirror is the
 * suspect).
 */
function alarmOnFingerprintDrift(
  row: CatalogExerciseRow,
  expectedFingerprint: string | null,
): void {
  if (expectedFingerprint == null) return;
  if ((row.identity_fingerprint ?? '') !== expectedFingerprint) {
    console.error(
      `front door: fingerprint drift on ${row.id} — client computed ` +
        `'${expectedFingerprint}' but the engine stored ` +
        `'${row.identity_fingerprint ?? ''}'. clientFingerprint no longer ` +
        'mirrors exercise_identity_attrs(); fix the mirror before trusting ' +
        'transient-collision handling.',
    );
  }
}

/** Identity movement styles are junction identity members the patch never touches. */
async function fetchIdentityStyleIds(exerciseId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('exercise_movement_styles')
    .select('movement_style_id, movement_styles!inner(is_identity)')
    .eq('exercise_id', exerciseId)
    .eq('movement_styles.is_identity', true);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as { movement_style_id: string }[]).map(
    (r) => r.movement_style_id,
  );
}

/** Guardrail G2: a variant label must belong to the chosen core movement. */
async function assertVariantLabelScoped(
  variantLabelId: string | null | undefined,
  coreMovementId: string | null,
): Promise<void> {
  if (!variantLabelId) return;
  if (!coreMovementId) {
    throw new CatalogInputError('A variant label requires a core movement (variant labels are core-scoped).');
  }
  const { data, error } = await supabase
    .from('variant_labels')
    .select('id, core_movement_id')
    .eq('id', variantLabelId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { id: string; core_movement_id: string } | null;
  if (!row || row.core_movement_id !== coreMovementId) {
    throw new CatalogInputError(
      'The variant label does not belong to the chosen core movement (guardrail G2).',
    );
  }
}

function pickIdentityColumns(source: CatalogIdentityAttributes): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const col of IDENTITY_COLUMNS) {
    if (source[col] !== undefined) out[col] = source[col] ?? null;
  }
  return out;
}

async function fetchRow(id: string): Promise<CatalogExerciseRow> {
  const { data, error } = await supabase
    .from('exercises')
    .select(ROW_COLUMNS)
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as CatalogExerciseRow;
}

/** Best-effort compensation delete of a half-created row (house pattern: log, never mask). */
async function compensateDelete(id: string): Promise<void> {
  const { error } = await supabase.from('exercises').delete().eq('id', id);
  if (error) {
    console.error(`front door: failed to remove half-created exercise ${id}:`, error.message);
  }
}

// ── Create ──────────────────────────────────────────────────────────────────

/**
 * The ONLY insert path for `exercises`.
 *
 * Naming contract: a custom name is written with `name_is_custom: true` and the
 * engine preserves it; without one the row is inserted with a placeholder and
 * `name_is_custom: false`, and the engine's generated name is read back (the
 * INSERT's own RETURNING image predates the AFTER-trigger recompute, so the
 * final state always comes from a fresh SELECT).
 *
 * SEQUENCING (Task 2 follow-up b): a derivation is created CORE-LAST —
 * insert with core_movement_id NULL, write every junction (fingerprint is
 * NULL while coreless, so junction statements cannot collide), then one final
 * UPDATE sets core_movement_id and the recompute lands directly on the final
 * identity. This kills the create-side transient-collision class outright: a
 * 23505 during create is now always a REAL duplicate (or a slug race).
 * Cores need no resequencing (their fingerprint key is self-scoped) and
 * outliers never have one.
 */
export async function createCatalogExercise(
  input: CreateCatalogExerciseInput,
): Promise<CatalogExerciseRow> {
  if (input.name != null && input.name.trim() === '') {
    throw new CatalogInputError('An exercise name cannot be blank (omit it to let the engine name the row).');
  }
  const isCore = input.is_core === true;
  const customName = input.name?.trim() || null;
  if (isCore && input.core_movement_id) {
    throw new CatalogInputError('A core movement cannot itself derive from a core (pick one).');
  }
  if (!input.core_movement_id && !customName) {
    throw new CatalogInputError(
      isCore
        ? 'A core movement needs a name — it is the noun the engine names derivations from.'
        : 'An outlier exercise (no core movement) needs a name — the engine only names rows attached to a core.',
    );
  }
  await assertVariantLabelScoped(input.variant_label_id, input.core_movement_id);

  const equipmentIds = dedupe(input.equipment_ids);
  const equipmentNames = await fetchEquipmentNames(equipmentIds);
  const styleIds = dedupe(input.movement_style_ids);
  const styleRows = await fetchStyleRows(styleIds);
  const identityStyleIds = styleRows.filter((r) => r.is_identity).map((r) => r.id);
  const scoringTypeIds = dedupe(input.scoring_type_ids);
  const requiresDistance = await deriveRequiresDistance(scoringTypeIds);

  // The full final identity is known up front (columns + equipment + identity
  // styles): it drives the duplicate lookup and the post-save drift alarm.
  // Cores get a fingerprint too (self-scoped, so it can never collide).
  const expectedFingerprint =
    input.core_movement_id || isCore
      ? clientFingerprint(input, [...equipmentIds, ...identityStyleIds])
      : null;
  const errCtx: ErrCtx = {
    coreId: input.core_movement_id,
    finalFingerprint: input.core_movement_id ? expectedFingerprint : null,
  };

  // Legacy compat (until Stage 6): probing slug; equipment_types name array and
  // skill_level so existing readers keep working; requires_weight,
  // requires_distance and the single goal_type_id column derived exactly as
  // the old writers did.
  const goalTypeIds = dedupe(input.goal_type_ids);

  const insertRow: Record<string, unknown> = {
    name: customName ?? PLACEHOLDER_NAME,
    name_is_custom: customName != null,
    // Core-last resequencing: derivations insert coreless; the trigger
    // self-references cores at insert regardless of what is written here.
    core_movement_id: null,
    is_core: isCore,
    ...pickIdentityColumns(input),
    movement_family_id: input.movement_family_id ?? null,
    movement_category_id: input.movement_category_id ?? null,
    is_movement: input.is_movement,
    is_official: false,
    created_by: input.created_by,
    description: input.description ?? null,
    video_url: input.video_url ?? null,
    image_url: input.image_url ?? null,
    skill_level: input.skill_level ?? null,
    short_name: input.short_name ?? null,
    equipment_types: equipmentNames.length > 0 ? equipmentNames : null,
    requires_weight: deriveRequiresWeight(equipmentNames),
    requires_distance: requiresDistance,
    goal_type_id: goalTypeIds[0] ?? null,
    // Engine-owned, never written here: generated_name, identity_fingerprint,
    // tier, parent_exercise_id.
  };

  // Insert with bounded slug regeneration: a 23505 on exercises_slug_key means
  // a race won the slug between probe and insert — re-probe (the winner now
  // exists, so the generator yields the next suffix) and retry.
  let slug = customName ? await generateUniqueSlug(customName) : placeholderSlug();
  let id: string | null = null;
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    const inserted = await withDeadlockRetry(() =>
      supabase.from('exercises').insert({ ...insertRow, slug }).select('id').single(),
    );
    if (!inserted.error) {
      id = (inserted.data as { id: string }).id;
      break;
    }
    if (isSlugCollision(inserted.error)) {
      if (attempt === SLUG_ATTEMPTS - 1) throw new CatalogSlugCollisionError();
      slug = customName ? await generateUniqueSlug(customName) : placeholderSlug();
      continue;
    }
    await mapAndThrow(inserted.error, errCtx);
  }
  if (!id) throw new CatalogSlugCollisionError();

  // Junction inserts. While the row is coreless its fingerprint is NULL, so
  // these statements cannot hit the fingerprint constraint (cores are
  // self-scoped and equally collision-free). Errors are still mapped —
  // deadlocks and FK rejections remain possible — and any failure removes the
  // half-created row before throwing.
  try {
    if (equipmentIds.length > 0) {
      // One statement: AFTER-ROW triggers all fire after the full row set is
      // visible, so the first recompute already sees the complete equipment.
      const { error } = await withDeadlockRetry(() =>
        supabase
          .from('exercise_equipment')
          .insert(equipmentIds.map((equipment_id) => ({ exercise_id: id, equipment_id }))),
      );
      if (error) await mapAndThrow(error, errCtx);
    }

    if (styleIds.length > 0) {
      const { error } = await withDeadlockRetry(() =>
        supabase
          .from('exercise_movement_styles')
          .insert(styleIds.map((movement_style_id) => ({ exercise_id: id, movement_style_id }))),
      );
      if (error) await mapAndThrow(error, errCtx);
    }

    const primaryMuscles = dedupe(input.primary_muscle_region_ids);
    const secondaryMuscles = dedupe(input.secondary_muscle_region_ids).filter(
      (m) => !primaryMuscles.includes(m),
    );
    if (primaryMuscles.length + secondaryMuscles.length > 0) {
      const { error } = await withDeadlockRetry(() =>
        supabase.from('exercise_muscle_regions').insert([
          ...primaryMuscles.map((muscle_region_id) => ({
            exercise_id: id,
            muscle_region_id,
            is_primary: true,
          })),
          ...secondaryMuscles.map((muscle_region_id) => ({
            exercise_id: id,
            muscle_region_id,
            is_primary: false,
          })),
        ]),
      );
      if (error) await mapAndThrow(error, errCtx);
    }

    if (goalTypeIds.length > 0) {
      const { error } = await withDeadlockRetry(() =>
        supabase
          .from('exercise_goal_types')
          .insert(goalTypeIds.map((goal_type_id) => ({ exercise_id: id, goal_type_id }))),
      );
      if (error) await mapAndThrow(error, errCtx);
    }

    if (scoringTypeIds.length > 0) {
      const { error } = await withDeadlockRetry(() =>
        supabase
          .from('exercise_scoring_types')
          .insert(scoringTypeIds.map((scoring_type_id) => ({ exercise_id: id, scoring_type_id }))),
      );
      if (error) await mapAndThrow(error, errCtx);
    }

    // Core-last: the single UPDATE that gives the row its identity. The
    // recompute fires HERE, against the COMPLETE attribute set — a 23505 on
    // this statement is a real duplicate of the final identity, never a
    // transient. Core validation (engine trigger) also lands here.
    if (input.core_movement_id) {
      const { error } = await withDeadlockRetry(() =>
        supabase
          .from('exercises')
          .update({ core_movement_id: input.core_movement_id })
          .eq('id', id)
          .select('id')
          .single(),
      );
      if (error) await mapAndThrow(error, errCtx);
    }
  } catch (err) {
    // No transaction over REST: compensate by removing the half-created row.
    await compensateDelete(id);
    throw err;
  }

  // From here the row is committed and valid. Deliberate row-survives exits:
  // if a readback below throws, the row REMAINS — a retried create then hits
  // DuplicateExerciseError carrying it, by design (better than a silent twin).
  if (!customName) {
    const named = await fetchRow(id);
    if (named.name === PLACEHOLDER_NAME) {
      // Sole-writer invariant guard: the engine did not run. Do not leave a
      // placeholder-named row in the catalog.
      await compensateDelete(id);
      throw new EngineNotRunningError();
    }
    // Swap the placeholder slug for a probing slug of the engine's name (slug
    // is not an identity column: no recompute). The row is already valid, so
    // slug failures are cosmetic — bounded retries, then log and keep the
    // pending slug rather than stranding a committed row behind an error.
    try {
      for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
        const finalSlug = await generateUniqueSlug(named.name);
        const { error } = await supabase.from('exercises').update({ slug: finalSlug }).eq('id', id);
        if (!error) break;
        if (!isSlugCollision(error) || attempt === SLUG_ATTEMPTS - 1) {
          console.error(`front door: slug swap failed for ${id} (keeping pending slug):`, error.message);
          break;
        }
      }
    } catch (slugErr) {
      console.error(
        `front door: slug swap failed for ${id} (keeping pending slug):`,
        slugErr instanceof Error ? slugErr.message : String(slugErr),
      );
    }
  }

  const finalRow = await fetchRow(id);
  alarmOnFingerprintDrift(finalRow, expectedFingerprint);
  return finalRow;
}

// ── Update ──────────────────────────────────────────────────────────────────

interface JunctionDiff {
  toDelete: string[];
  toInsert: string[];
}

function diffIds(current: string[], next: string[]): JunctionDiff {
  const cur = new Set(current);
  const nxt = new Set(next);
  return {
    toDelete: current.filter((id) => !nxt.has(id)),
    toInsert: next.filter((id) => !cur.has(id)),
  };
}

/**
 * Apply an identity-junction diff (equipment or movement styles — both feed
 * the fingerprint) in one of the two possible statement orders.
 *
 * insert-first: the transient identity is the UNION of old+new members — it
 * collides only if an exact union-child exists. delete-first: the transient is
 * a SUBSET — which collides with the row's own PARENT whenever the parent is
 * exactly that subset (the reviewer-confirmed C1 case). insert-first is
 * therefore the default, delete-first the opposite-order retry.
 *
 * A failed statement rolls back atomically WITH its trigger recompute, so a
 * collision on the first statement of either order leaves the row unchanged.
 * A failure on the SECOND statement is compensated best-effort before
 * rethrowing.
 */
async function applyIdentityJunctionDiff(
  table: 'exercise_equipment' | 'exercise_movement_styles',
  fkColumn: 'equipment_id' | 'movement_style_id',
  exerciseId: string,
  diff: JunctionDiff,
  order: 'insert-first' | 'delete-first',
  errCtx: ErrCtx,
): Promise<void> {
  const doInsert = async () => {
    if (diff.toInsert.length === 0) return;
    const { error } = await withDeadlockRetry(() =>
      supabase
        .from(table)
        .insert(diff.toInsert.map((v) => ({ exercise_id: exerciseId, [fkColumn]: v }))),
    );
    if (error) await mapAndThrow(error, errCtx);
  };
  const doDelete = async () => {
    if (diff.toDelete.length === 0) return;
    const { error } = await withDeadlockRetry(() =>
      supabase
        .from(table)
        .delete()
        .eq('exercise_id', exerciseId)
        .in(fkColumn, diff.toDelete),
    );
    if (error) await mapAndThrow(error, errCtx);
  };
  const compensate = async (undo: 'delete-inserted' | 'restore-deleted') => {
    const { error } =
      undo === 'delete-inserted'
        ? await supabase
            .from(table)
            .delete()
            .eq('exercise_id', exerciseId)
            .in(fkColumn, diff.toInsert)
        : await supabase
            .from(table)
            .insert(diff.toDelete.map((v) => ({ exercise_id: exerciseId, [fkColumn]: v })));
    if (error) {
      console.error(
        `front door: ${table} compensation failed for ${exerciseId}:`,
        error.message,
      );
    }
  };

  if (order === 'insert-first') {
    await doInsert();
    try {
      await doDelete();
    } catch (err) {
      if (diff.toInsert.length > 0) await compensate('delete-inserted');
      throw err;
    }
  } else {
    await doDelete();
    try {
      await doInsert();
    } catch (err) {
      if (diff.toDelete.length > 0) await compensate('restore-deleted');
      throw err;
    }
  }
}

/**
 * The ONLY update path for `exercises`. Junctions are recomputed diff-style
 * (delete/insert changed rows only) as one logical operation; the engine's
 * recompute fires per changed statement and the final state is read back.
 * Junction keys left undefined in the patch are untouched.
 */
export async function updateCatalogExercise(
  id: string,
  patch: UpdateCatalogExercisePatch,
): Promise<CatalogExerciseRow> {
  if (patch.name != null && patch.name.trim() === '') {
    throw new CatalogInputError('An exercise name cannot be blank.');
  }

  // I4: a missing row and an RLS-hidden/forbidden one are the same outcome.
  const { data: currentData, error: currentError } = await supabase
    .from('exercises')
    .select(ROW_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (currentError) throw new Error(currentError.message);
  const current = currentData as unknown as CatalogExerciseRow | null;
  if (!current) throw new CatalogNotFoundOrForbiddenError(id);

  const nextCore =
    patch.core_movement_id !== undefined ? patch.core_movement_id : current.core_movement_id;
  const nextVariant =
    patch.variant_label_id !== undefined ? patch.variant_label_id : current.variant_label_id;
  if (nextVariant !== current.variant_label_id || nextCore !== current.core_movement_id) {
    await assertVariantLabelScoped(nextVariant, nextCore ?? null);
  }

  const nextEquipmentIds =
    patch.equipment_ids !== undefined ? dedupe(patch.equipment_ids) : undefined;
  const nextStyleIds =
    patch.movement_style_ids !== undefined ? dedupe(patch.movement_style_ids) : undefined;
  // Validate patched style ids up front (and learn their identity split).
  const nextStyleRows = nextStyleIds !== undefined ? await fetchStyleRows(nextStyleIds) : undefined;

  // Merge patch onto current WITHOUT undefined-keys clobbering (M2): the
  // identity the row will hold after the whole save.
  const mergedAttrs: CatalogIdentityAttributes = {};
  for (const col of IDENTITY_COLUMNS) {
    mergedAttrs[col] = patch[col] !== undefined ? patch[col] : current[col];
  }

  let cachedEquipmentIds: string[] | null = null;
  const getCurrentEquipmentIds = async (): Promise<string[]> =>
    (cachedEquipmentIds ??= await fetchEquipmentIdsOf(id));

  // The final fingerprint is only computable when the patch can move identity;
  // it must include the junction members the patch never carries (current
  // equipment/styles when untouched).
  const touchesIdentity =
    nextEquipmentIds !== undefined ||
    nextStyleIds !== undefined ||
    patch.core_movement_id !== undefined ||
    IDENTITY_COLUMNS.some((col) => patch[col] !== undefined);
  let finalFingerprint: string | null = null;
  if (touchesIdentity && nextCore) {
    const equipFinal = nextEquipmentIds ?? (await getCurrentEquipmentIds());
    const identityStylesFinal =
      nextStyleRows !== undefined
        ? nextStyleRows.filter((r) => r.is_identity).map((r) => r.id)
        : await fetchIdentityStyleIds(id);
    finalFingerprint = clientFingerprint(mergedAttrs, [...equipFinal, ...identityStylesFinal]);
  }
  const errCtx: ErrCtx = { coreId: nextCore ?? null, finalFingerprint, targetId: id };

  // ── Phase 1: column patch (identity singles + non-identity fields) ──
  // Compat columns move to phase 3 (I2) so each phase is individually
  // consistent: columns match the row, compat arrays match the junctions.
  const cols: Record<string, unknown> = { ...pickIdentityColumns(patch) };
  if (patch.core_movement_id !== undefined) cols.core_movement_id = patch.core_movement_id;
  if (patch.movement_family_id !== undefined) cols.movement_family_id = patch.movement_family_id;
  if (patch.movement_category_id !== undefined)
    cols.movement_category_id = patch.movement_category_id;
  if (patch.skill_level !== undefined) cols.skill_level = patch.skill_level;
  if (patch.short_name !== undefined) cols.short_name = patch.short_name;
  if (patch.description !== undefined) cols.description = patch.description;
  if (patch.video_url !== undefined) cols.video_url = patch.video_url;
  if (patch.image_url !== undefined) cols.image_url = patch.image_url;

  if (patch.clear_custom_name) {
    if (!nextCore) {
      throw new CatalogInputError(
        'Cannot clear the custom name of an outlier — the engine only names rows attached to a core.',
      );
    }
    cols.name_is_custom = false; // recompute trigger column: engine renames
  } else if (patch.name !== undefined && patch.name !== null) {
    cols.name = patch.name.trim();
    cols.name_is_custom = true;
    // Deliberate: the slug is NOT re-probed on rename. Slugs are stable
    // identifiers for legacy readers (Stage 6 retires them); renames only
    // change the display name.
  }

  if (Object.keys(cols).length > 0) {
    const { error } = await withDeadlockRetry(() =>
      supabase.from('exercises').update(cols).eq('id', id).select('id').single(),
    );
    if (error) await mapAndThrow(error, errCtx); // PGRST116 -> not found/forbidden
  }

  // ── Phase 2: junction diffs ──
  const applyWithOrderRetry = async (
    table: 'exercise_equipment' | 'exercise_movement_styles',
    fkColumn: 'equipment_id' | 'movement_style_id',
    diff: JunctionDiff,
  ) => {
    try {
      await applyIdentityJunctionDiff(table, fkColumn, id, diff, 'insert-first', errCtx);
    } catch (err) {
      if (!(err instanceof CatalogTransientCollisionError)) throw err;
      // The union identity exists (an exact union-child): the opposite order
      // may still pass through a free subset. Both orders colliding
      // propagates CatalogTransientCollisionError from this second attempt.
      await applyIdentityJunctionDiff(table, fkColumn, id, diff, 'delete-first', errCtx);
    }
  };

  if (nextEquipmentIds !== undefined) {
    const diff = diffIds(await getCurrentEquipmentIds(), nextEquipmentIds);
    if (diff.toDelete.length > 0 || diff.toInsert.length > 0) {
      await applyWithOrderRetry('exercise_equipment', 'equipment_id', diff);
    }
  }

  if (nextStyleIds !== undefined) {
    // Diff against ALL current styles (identity and modifier alike): both live
    // in the junction, only identity members move the fingerprint.
    const { data: styleData, error: styleErr } = await supabase
      .from('exercise_movement_styles')
      .select('movement_style_id')
      .eq('exercise_id', id);
    if (styleErr) throw new Error(styleErr.message);
    const currentStyles = ((styleData ?? []) as { movement_style_id: string }[]).map(
      (r) => r.movement_style_id,
    );
    const diff = diffIds(currentStyles, nextStyleIds);
    if (diff.toDelete.length > 0 || diff.toInsert.length > 0) {
      await applyWithOrderRetry('exercise_movement_styles', 'movement_style_id', diff);
    }
  }

  if (
    patch.primary_muscle_region_ids !== undefined ||
    patch.secondary_muscle_region_ids !== undefined
  ) {
    const { data, error } = await supabase
      .from('exercise_muscle_regions')
      .select('muscle_region_id, is_primary')
      .eq('exercise_id', id);
    if (error) throw new Error(error.message);
    const currentRows = (data ?? []) as { muscle_region_id: string; is_primary: boolean }[];
    const currentPrimary = currentRows.filter((r) => r.is_primary).map((r) => r.muscle_region_id);
    const currentSecondary = currentRows
      .filter((r) => !r.is_primary)
      .map((r) => r.muscle_region_id);

    const nextPrimary =
      patch.primary_muscle_region_ids !== undefined
        ? dedupe(patch.primary_muscle_region_ids)
        : currentPrimary;
    const nextSecondary = (
      patch.secondary_muscle_region_ids !== undefined
        ? dedupe(patch.secondary_muscle_region_ids)
        : currentSecondary
    ).filter((m) => !nextPrimary.includes(m));

    const desired = new Map<string, boolean>();
    for (const m of nextPrimary) desired.set(m, true);
    for (const m of nextSecondary) desired.set(m, false);
    const existing = new Map(currentRows.map((r) => [r.muscle_region_id, r.is_primary]));

    const toDelete = currentRows
      .filter((r) => !desired.has(r.muscle_region_id))
      .map((r) => r.muscle_region_id);
    const toInsert = [...desired].filter(([m]) => !existing.has(m));
    const toFlip = [...desired].filter(
      ([m, isPrimary]) => existing.has(m) && existing.get(m) !== isPrimary,
    );

    if (toDelete.length > 0) {
      const { error: delErr } = await withDeadlockRetry(() =>
        supabase
          .from('exercise_muscle_regions')
          .delete()
          .eq('exercise_id', id)
          .in('muscle_region_id', toDelete),
      );
      if (delErr) await mapAndThrow(delErr, errCtx);
    }
    if (toInsert.length > 0) {
      const { error: insErr } = await withDeadlockRetry(() =>
        supabase.from('exercise_muscle_regions').insert(
          toInsert.map(([muscle_region_id, is_primary]) => ({
            exercise_id: id,
            muscle_region_id,
            is_primary,
          })),
        ),
      );
      if (insErr) await mapAndThrow(insErr, errCtx);
    }
    for (const [muscle_region_id, is_primary] of toFlip) {
      const { error: flipErr } = await withDeadlockRetry(() =>
        supabase
          .from('exercise_muscle_regions')
          .update({ is_primary })
          .eq('exercise_id', id)
          .eq('muscle_region_id', muscle_region_id),
      );
      if (flipErr) await mapAndThrow(flipErr, errCtx);
    }
  }

  if (patch.goal_type_ids !== undefined) {
    const nextGoals = dedupe(patch.goal_type_ids);
    const { data, error } = await supabase
      .from('exercise_goal_types')
      .select('goal_type_id')
      .eq('exercise_id', id);
    if (error) throw new Error(error.message);
    const diff = diffIds(
      ((data ?? []) as { goal_type_id: string }[]).map((r) => r.goal_type_id),
      nextGoals,
    );
    if (diff.toDelete.length > 0) {
      const { error: delErr } = await withDeadlockRetry(() =>
        supabase
          .from('exercise_goal_types')
          .delete()
          .eq('exercise_id', id)
          .in('goal_type_id', diff.toDelete),
      );
      if (delErr) await mapAndThrow(delErr, errCtx);
    }
    if (diff.toInsert.length > 0) {
      const { error: insErr } = await withDeadlockRetry(() =>
        supabase
          .from('exercise_goal_types')
          .insert(diff.toInsert.map((goal_type_id) => ({ exercise_id: id, goal_type_id }))),
      );
      if (insErr) await mapAndThrow(insErr, errCtx);
    }
  }

  if (patch.scoring_type_ids !== undefined) {
    // Scoring types are identity-inert (no recompute trigger): plain diff.
    const nextScoring = dedupe(patch.scoring_type_ids);
    const { data, error } = await supabase
      .from('exercise_scoring_types')
      .select('scoring_type_id')
      .eq('exercise_id', id);
    if (error) throw new Error(error.message);
    const diff = diffIds(
      ((data ?? []) as { scoring_type_id: string }[]).map((r) => r.scoring_type_id),
      nextScoring,
    );
    if (diff.toDelete.length > 0) {
      const { error: delErr } = await withDeadlockRetry(() =>
        supabase
          .from('exercise_scoring_types')
          .delete()
          .eq('exercise_id', id)
          .in('scoring_type_id', diff.toDelete),
      );
      if (delErr) await mapAndThrow(delErr, errCtx);
    }
    if (diff.toInsert.length > 0) {
      const { error: insErr } = await withDeadlockRetry(() =>
        supabase
          .from('exercise_scoring_types')
          .insert(diff.toInsert.map((scoring_type_id) => ({ exercise_id: id, scoring_type_id }))),
      );
      if (insErr) await mapAndThrow(insErr, errCtx);
    }
  }

  // ── Phase 3: legacy-compat columns, AFTER the junctions they mirror (I2) ──
  // These columns fire no recompute (not in the trigger's column list).
  const compat: Record<string, unknown> = {};
  if (nextEquipmentIds !== undefined) {
    const names = await fetchEquipmentNames(nextEquipmentIds);
    compat.equipment_types = names.length > 0 ? names : null;
    compat.requires_weight = deriveRequiresWeight(names);
  }
  if (patch.goal_type_ids !== undefined) {
    compat.goal_type_id = dedupe(patch.goal_type_ids)[0] ?? null; // legacy single
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

  const finalRow = await fetchRow(id);
  alarmOnFingerprintDrift(finalRow, finalFingerprint);
  return finalRow;
}

// ── Edit prefill ────────────────────────────────────────────────────────────

/** A catalog row plus every junction the wizard edits, in input-shaped form. */
export interface CatalogExerciseDetail extends CatalogExerciseRow {
  equipment_ids: string[];
  movement_style_ids: string[];
  scoring_type_ids: string[];
  goal_type_ids: string[];
  primary_muscle_region_ids: string[];
  secondary_muscle_region_ids: string[];
  /** Display name of the core movement (null for cores' self-ref and outliers). */
  core_movement_name: string | null;
}

/**
 * One fetch that loads a row and its junctions for the edit wizard: the shape
 * mirrors Create/Update input, so a round-trip (fetch → patch → update) needs
 * no re-mapping.
 */
export async function fetchCatalogExerciseDetail(id: string): Promise<CatalogExerciseDetail> {
  const { data, error } = await supabase
    .from('exercises')
    .select(
      `${ROW_COLUMNS}, ` +
        // Column-as-relation embed: the M2O direction of a self-join must be
        // named by the FK COLUMN (a bare table/constraint hint resolves to
        // the reverse, one-to-many "children" side on this PostgREST).
        'core_movement:core_movement_id(name), ' +
        'exercise_equipment(equipment_id), ' +
        'exercise_movement_styles(movement_style_id), ' +
        'exercise_scoring_types(scoring_type_id), ' +
        'exercise_goal_types(goal_type_id), ' +
        'exercise_muscle_regions(muscle_region_id, is_primary)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new CatalogNotFoundOrForbiddenError(id);
  const row = data as unknown as CatalogExerciseRow & {
    core_movement: { name: string } | null;
    exercise_equipment: { equipment_id: string }[];
    exercise_movement_styles: { movement_style_id: string }[];
    exercise_scoring_types: { scoring_type_id: string }[];
    exercise_goal_types: { goal_type_id: string }[];
    exercise_muscle_regions: { muscle_region_id: string; is_primary: boolean }[];
  };
  const {
    core_movement,
    exercise_equipment,
    exercise_movement_styles,
    exercise_scoring_types,
    exercise_goal_types,
    exercise_muscle_regions,
    ...columns
  } = row;
  return {
    ...(columns as CatalogExerciseRow),
    // A core self-references, so its own name comes back: report null there.
    core_movement_name:
      !(columns as CatalogExerciseRow).is_core && core_movement ? core_movement.name : null,
    equipment_ids: (exercise_equipment ?? []).map((r) => r.equipment_id),
    movement_style_ids: (exercise_movement_styles ?? []).map((r) => r.movement_style_id),
    scoring_type_ids: (exercise_scoring_types ?? []).map((r) => r.scoring_type_id),
    goal_type_ids: (exercise_goal_types ?? []).map((r) => r.goal_type_id),
    primary_muscle_region_ids: (exercise_muscle_regions ?? [])
      .filter((r) => r.is_primary)
      .map((r) => r.muscle_region_id),
    secondary_muscle_region_ids: (exercise_muscle_regions ?? [])
      .filter((r) => !r.is_primary)
      .map((r) => r.muscle_region_id),
  };
}

// ── Wild aliases ────────────────────────────────────────────────────────────

/** Per-alias outcome of addWildAliases — the row exists either way. */
export interface WildAliasResult {
  written: string[];
  failed: string[];
}

/**
 * Attach user-typed ("wild") aliases to an exercise. Normalization goes
 * through the DB's normalize_alias so the abbreviation dictionary stays
 * single-source; a normalized collision (the alias already names something)
 * is skipped silently — first owner keeps the name.
 *
 * Every alias is ATTEMPTED: one failure never blocks the rest. Failures are
 * collected (and logged) rather than thrown — the exercise was already
 * created, so the caller's job is to tell the user which aliases missed,
 * not to fail the save.
 */
export async function addWildAliases(
  exerciseId: string,
  aliases: string[],
): Promise<WildAliasResult> {
  const cleaned = dedupe(aliases.map((a) => a.trim()).filter((a) => a.length > 0));
  const written: string[] = [];
  const failed: string[] = [];
  for (const alias of cleaned) {
    try {
      const { data: normalized, error: normError } = await supabase.rpc('normalize_alias', {
        raw: alias,
      });
      if (normError) throw new Error(normError.message);
      if (!normalized) continue; // nothing left after normalization: not a failure
      const { error } = await supabase
        .from('exercise_aliases')
        .upsert(
          {
            exercise_id: exerciseId,
            alias,
            alias_normalized: normalized,
            kind: 'wild',
            source: 'curation',
          },
          { onConflict: 'alias_normalized', ignoreDuplicates: true },
        );
      if (error) throw new Error(error.message);
      written.push(alias);
    } catch (err) {
      console.error(
        `front door: wild alias '${alias}' failed for ${exerciseId}:`,
        err instanceof Error ? err.message : String(err),
      );
      failed.push(alias);
    }
  }
  return { written, failed };
}
