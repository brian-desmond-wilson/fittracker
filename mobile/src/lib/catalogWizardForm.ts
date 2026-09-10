// Pure form logic for the catalog wizard (CatalogItemWizard).
//
// Extracted from the component so the two decisions that have bitten before
// are unit-testable at lib level:
//   1. payload construction — what exactly createCatalogExercise /
//      updateCatalogExercise receive for each form state (the old Exercise
//      wizard silently dropped half its form on this step), and
//   2. core inheritance — which fields a freshly PICKED core pre-fills.
//      Inheritance is applied by the wizard ONLY on an explicit core
//      pick/change signal from Step 1, never on a step mount: an edit's
//      prefilled core, or navigating back to Step 2, must not clobber saved
//      classification with the core's values.
import type {
  CreateCatalogExerciseInput,
  UpdateCatalogExercisePatch,
} from './supabase/frontDoor';
import type { SkillLevel } from '../types/crossfit';

export type CatalogItemKind = 'core' | 'derivation' | 'outlier';

export interface WizardFormData {
  // Step 1: identity kind + naming
  kind: CatalogItemKind;
  core_movement_id: string | null;
  core_movement_name: string; // for display in the picker
  /** Derivations default to engine naming; this toggle reveals the field. */
  use_custom_name: boolean;
  name: string;
  short_name: string;
  aliases: string[];
  description: string;
  video_url: string;
  image_url: string;

  // Step 2: classification
  modality_id: string | null;
  movement_family_id: string | null;
  goal_type_ids: string[];
  skill_level: SkillLevel | null;
  muscle_region_ids: string[];
  primary_muscle_region_ids: string[];
  scoring_type_ids: string[];

  // Step 3: identity attributes (one FK column each — single-select)
  load_position_id: string | null;
  stance_id: string | null;
  range_depth_id: string | null;
  symmetry_id: string | null;
  grip_orientation_id: string | null;
  grip_width_id: string | null;
  bench_angle_id: string | null;
  direction_id: string | null;
  support_position_id: string | null;
  arm_position_id: string | null;
  variant_label_id: string | null;
  equipment_ids: string[];
  /**
   * ALL movement styles on the row. Step 3 renders only identity styles as
   * pills; modifier styles loaded by an edit ride along untouched so the
   * update diff never drops them.
   */
  movement_style_ids: string[];
}

export const EMPTY_WIZARD_FORM: WizardFormData = {
  kind: 'derivation',
  core_movement_id: null,
  core_movement_name: '',
  use_custom_name: false,
  name: '',
  short_name: '',
  aliases: [],
  description: '',
  video_url: '',
  image_url: '',
  modality_id: null,
  movement_family_id: null,
  goal_type_ids: [],
  skill_level: null,
  muscle_region_ids: [],
  primary_muscle_region_ids: [],
  scoring_type_ids: [],
  load_position_id: null,
  stance_id: null,
  range_depth_id: null,
  symmetry_id: null,
  grip_orientation_id: null,
  grip_width_id: null,
  bench_angle_id: null,
  direction_id: null,
  support_position_id: null,
  arm_position_id: null,
  variant_label_id: null,
  equipment_ids: [],
  movement_style_ids: [],
};

/** Cores and outliers always carry a name; derivations only when toggled. */
export function wantsCustomName(form: WizardFormData): boolean {
  return form.kind !== 'derivation' || form.use_custom_name;
}

/** Everything create and update share, straight from the form. */
function sharedFields(form: WizardFormData) {
  return {
    core_movement_id: form.kind === 'derivation' ? form.core_movement_id : null,
    load_position_id: form.load_position_id,
    stance_id: form.stance_id,
    range_depth_id: form.range_depth_id,
    symmetry_id: form.symmetry_id,
    grip_orientation_id: form.grip_orientation_id,
    grip_width_id: form.grip_width_id,
    bench_angle_id: form.bench_angle_id,
    direction_id: form.direction_id,
    support_position_id: form.support_position_id,
    arm_position_id: form.arm_position_id,
    // G4: only ever a picker choice from the core's own vocabulary.
    variant_label_id: form.kind === 'derivation' ? form.variant_label_id : null,
    equipment_ids: form.equipment_ids,
    movement_style_ids: form.movement_style_ids,
    scoring_type_ids: form.scoring_type_ids,
    goal_type_ids: form.goal_type_ids,
    primary_muscle_region_ids: form.primary_muscle_region_ids,
    secondary_muscle_region_ids: form.muscle_region_ids.filter(
      (m) => !form.primary_muscle_region_ids.includes(m),
    ),
    movement_family_id: form.movement_family_id,
    movement_category_id: form.modality_id,
    skill_level: form.skill_level,
    short_name: form.short_name.trim() || null,
    description: form.description.trim() || null,
    video_url: form.video_url.trim() || null,
    image_url: form.image_url.trim() || null,
  };
}

/** The exact createCatalogExercise input for this form state. */
export function buildCreateInput(
  form: WizardFormData,
  isMovement: boolean,
  userId: string,
): CreateCatalogExerciseInput {
  return {
    ...sharedFields(form),
    name: wantsCustomName(form) ? form.name.trim() : null,
    is_core: form.kind === 'core',
    is_movement: isMovement,
    created_by: userId,
  };
}

/**
 * The exact updateCatalogExercise patch for this form state.
 * - A core row never patches core_movement_id (the DB trigger owns the
 *   self-reference; is_core itself is not editable).
 * - Naming: custom name in force -> write it; custom naming switched OFF on
 *   a row that HAD one -> clear_custom_name hands naming back to the engine;
 *   otherwise leave the name columns untouched.
 */
export function buildUpdatePatch(
  form: WizardFormData,
  editWasCustomNamed: boolean,
): UpdateCatalogExercisePatch {
  const patch: UpdateCatalogExercisePatch = { ...sharedFields(form) };
  if (form.kind === 'core') {
    delete patch.core_movement_id;
  }
  if (wantsCustomName(form)) {
    patch.name = form.name.trim();
  } else if (editWasCustomNamed) {
    patch.clear_custom_name = true;
  }
  return patch;
}

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

// ── Core inheritance ────────────────────────────────────────────────────────

/** The classification a core movement hands down to a fresh derivation. */
export interface CoreClassification {
  movement_family_id: string | null;
  movement_category_id: string | null;
  skill_level: SkillLevel | null;
  /** From the exercise_goal_types junction (legacy single column only as fallback). */
  goal_type_ids: string[];
  scoring_type_ids: string[];
  muscle_region_ids: string[];
  primary_muscle_region_ids: string[];
}

/** Fields the user may override without the next inheritance re-clobbering. */
export type OverridableInheritField = 'skill_level' | 'scoring_type_ids';

/**
 * What picking THIS core pre-fills, honoring the user's explicit overrides.
 * Pure: the wizard decides WHEN (only on an explicit pick/change from
 * Step 1), this decides WHAT.
 */
export function computeCoreInheritance(
  core: CoreClassification,
  overridden: ReadonlySet<OverridableInheritField>,
): { updates: Partial<WizardFormData>; inherited: string[] } {
  const updates: Partial<WizardFormData> = {};
  const inherited: string[] = [];

  if (core.movement_family_id) {
    updates.movement_family_id = core.movement_family_id;
    inherited.push('movement_family_id');
  }
  if (core.movement_category_id) {
    updates.modality_id = core.movement_category_id;
    inherited.push('modality_id');
  }
  if (core.goal_type_ids.length > 0) {
    updates.goal_type_ids = core.goal_type_ids;
    inherited.push('goal_type_ids');
  }
  if (core.muscle_region_ids.length > 0) {
    updates.muscle_region_ids = core.muscle_region_ids;
    updates.primary_muscle_region_ids = core.primary_muscle_region_ids;
    inherited.push('muscle_region_ids');
  }
  if (core.skill_level && !overridden.has('skill_level')) {
    updates.skill_level = core.skill_level;
    inherited.push('skill_level');
  }
  if (core.scoring_type_ids.length > 0 && !overridden.has('scoring_type_ids')) {
    updates.scoring_type_ids = core.scoring_type_ids;
    inherited.push('scoring_type_ids');
  }

  return { updates, inherited };
}
