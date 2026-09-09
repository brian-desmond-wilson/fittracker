import { supabase } from '../supabase';
import { generateUniqueSlug } from './frontDoor';
import type {
  GoalType,
  Exercise,
  ExerciseWithVariations,
  ExerciseWithDetails,
  VariationCategory,
  VariationOption,
  VariationOptionWithCategory,
  WODFormat,
  WODCategory,
  WOD,
  WODWithDetails,
  WODScalingLevel,
  WODMovement,
  MovementStandard,
  Class,
  ClassWithDetails,
  ClassPart,
  CreateWODInput,
  CreateClassInput,
  CreateMovementInput,
  UpdateWODInput,
  UpdateClassInput,
  MovementCategory,
  ScoringType,
  MovementFamily,
  PlaneOfMotion,
  LoadPosition,
  Stance,
  RangeDepth,
  MovementStyle,
  Symmetry,
  MuscleRegion,
  ExerciseStandard,
  MovementMeasurementProfile,
  MovementScalingLink,
} from '../../types/crossfit';

// ============================================================================
// REFERENCE DATA (Goal Types, Formats, Categories)
// ============================================================================

/**
 * Fetch all goal types (MetCon, Strength, Skill, etc.)
 */
export async function fetchGoalTypes(): Promise<GoalType[]> {
  const { data, error } = await supabase
    .from('goal_types')
    .select('*')
    .order('display_order');

  if (error) {
    console.error('Error fetching goal types:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch all WOD formats (AMRAP, EMOM, For Time, etc.)
 */
export async function fetchWODFormats(): Promise<WODFormat[]> {
  const { data, error } = await supabase
    .from('wod_formats')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching WOD formats:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch all WOD categories (All, Daily WOD, Heroes, The Girls)
 */
export async function fetchWODCategories(): Promise<WODCategory[]> {
  const { data, error } = await supabase
    .from('wod_categories')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching WOD categories:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch all variation categories (Position, Stance, Equipment, Style)
 */
export async function fetchVariationCategories(): Promise<VariationCategory[]> {
  const { data, error } = await supabase
    .from('variation_categories')
    .select(`
      *,
      options:variation_options(*)
    `)
    .order('name');

  if (error) {
    console.error('Error fetching variation categories:', error);
    throw error;
  }

  return data || [];
}

// ============================================================================
// NEW REFERENCE TABLES (Movement Metadata)
// ============================================================================

/**
 * Fetch all movement families (Squat, Hinge, Press, Pull, etc.)
 */
export async function fetchMovementFamilies() {
  const { data, error } = await supabase
    .from('movement_families')
    .select('*')
    .order('display_order');

  if (error) {
    console.error('Error fetching movement families:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch all planes of motion (Sagittal, Frontal, Transverse, Multi)
 */
export async function fetchPlanesOfMotion() {
  const { data, error } = await supabase
    .from('planes_of_motion')
    .select('*')
    .order('display_order');

  if (error) {
    console.error('Error fetching planes of motion:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch all load positions (BackRack, FrontRack, Overhead, etc.)
 */
export async function fetchLoadPositions() {
  const { data, error } = await supabase
    .from('load_positions')
    .select('*')
    .order('display_order');

  if (error) {
    console.error('Error fetching load positions:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch all stances (Standard, Wide/Sumo, Split, Single-Leg, etc.)
 */
export async function fetchStances() {
  const { data, error } = await supabase
    .from('stances')
    .select('*')
    .order('display_order');

  if (error) {
    console.error('Error fetching stances:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch all range depths (Full, Parallel, ATG, etc.)
 */
export async function fetchRangeDepths() {
  const { data, error } = await supabase
    .from('range_depths')
    .select('*')
    .order('display_order');

  if (error) {
    console.error('Error fetching range depths:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch all movement styles (Standard, Pause, Tempo, Strict, Kipping, etc.)
 */
export async function fetchMovementStyles() {
  const { data, error } = await supabase
    .from('movement_styles')
    .select('*')
    .order('display_order');

  if (error) {
    console.error('Error fetching movement styles:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch all equipment
 */
export async function fetchEquipment() {
  const { data, error } = await supabase
    .from('equipment')
    .select('*')
    .order('category, name');

  if (error) {
    console.error('Error fetching equipment:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch all symmetries (Bilateral, Unilateral, Alternating, Offset)
 */
export async function fetchSymmetries() {
  const { data, error } = await supabase
    .from('symmetries')
    .select('*')
    .order('display_order');

  if (error) {
    console.error('Error fetching symmetries:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch all muscle regions (Quads, Hamstrings, Chest, Back, etc.)
 */
export async function fetchMuscleRegions() {
  const { data, error } = await supabase
    .from('muscle_regions')
    .select('*')
    .order('display_order');

  if (error) {
    console.error('Error fetching muscle regions:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch all directions (movement-model identity attribute dictionary)
 */
export async function fetchDirections() {
  const { data, error } = await supabase
    .from('directions')
    .select('*')
    .order('display_order');

  if (error) {
    console.error('Error fetching directions:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch all support positions (movement-model identity attribute dictionary)
 */
export async function fetchSupportPositions() {
  const { data, error } = await supabase
    .from('support_positions')
    .select('*')
    .order('display_order');

  if (error) {
    console.error('Error fetching support positions:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch all arm positions (movement-model identity attribute dictionary)
 */
export async function fetchArmPositions() {
  const { data, error } = await supabase
    .from('arm_positions')
    .select('*')
    .order('display_order');

  if (error) {
    console.error('Error fetching arm positions:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch all bench angles (movement-model identity attribute dictionary)
 */
export async function fetchBenchAngles() {
  const { data, error } = await supabase
    .from('bench_angles')
    .select('*')
    .order('display_order');

  if (error) {
    console.error('Error fetching bench angles:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch all grips. Two categories in one dictionary: 'Orientation'
 * (Pronated, Supinated, …) and 'Width' (Close, Standard, Wide) — the row
 * columns they feed are grip_orientation_id / grip_width_id.
 */
export async function fetchGrips() {
  const { data, error } = await supabase
    .from('grips')
    .select('*')
    .order('category')
    .order('display_order');

  if (error) {
    console.error('Error fetching grips:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch the variant labels scoped to one core movement (guardrail G4: the
 * variant vocabulary is core-scoped and closed — never free text).
 */
export async function fetchVariantLabels(coreMovementId: string) {
  const { data, error } = await supabase
    .from('variant_labels')
    .select('*')
    .eq('core_movement_id', coreMovementId)
    .order('name_order')
    .order('name_fragment');

  if (error) {
    console.error('Error fetching variant labels:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch the family × modality truth table (movement_family_modalities) —
 * which movement families are legal for each modality. Replaces the old
 * hardcoded name map in the wizard.
 */
export async function fetchFamilyModalities() {
  const { data, error } = await supabase
    .from('movement_family_modalities')
    .select('movement_family_id, movement_category_id');

  if (error) {
    console.error('Error fetching family modalities:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch the classification a core movement hands down to a new derivation
 * (wizard inheritance). Goals come from the exercise_goal_types junction;
 * the legacy single goal_type_id column is only a fallback for rows whose
 * junction was never backfilled.
 */
export async function fetchCoreClassification(coreId: string) {
  const { data, error } = await supabase
    .from('exercises')
    .select(
      'movement_family_id, movement_category_id, skill_level, goal_type_id, ' +
        'exercise_goal_types(goal_type_id), ' +
        'exercise_scoring_types(scoring_type_id), ' +
        'exercise_muscle_regions(muscle_region_id, is_primary)',
    )
    .eq('id', coreId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching core classification:', error);
    throw error;
  }
  if (!data) return null;

  const row = data as any;
  const junctionGoals = (row.exercise_goal_types ?? []).map((g: any) => g.goal_type_id);
  const muscles = row.exercise_muscle_regions ?? [];
  return {
    movement_family_id: row.movement_family_id ?? null,
    movement_category_id: row.movement_category_id ?? null,
    skill_level: row.skill_level ?? null,
    goal_type_ids:
      junctionGoals.length > 0 ? junctionGoals : row.goal_type_id ? [row.goal_type_id] : [],
    scoring_type_ids: (row.exercise_scoring_types ?? []).map((s: any) => s.scoring_type_id),
    muscle_region_ids: muscles.map((m: any) => m.muscle_region_id),
    primary_muscle_region_ids: muscles
      .filter((m: any) => m.is_primary)
      .map((m: any) => m.muscle_region_id),
  };
}

/**
 * Search CORE movements only (is_core rows) — the wizard's core picker.
 * Matches name or an exercise_aliases row (the legacy aliases-array filter
 * is gone), alphabetical.
 */
export async function searchCoreMovements(query: string) {
  const cleaned = cleanSearchTerm(query);
  if (!cleaned) return [];

  let builder = supabase
    .from('exercises')
    .select('id, name, short_name, image_url, is_core')
    .eq('is_core', true);

  builder = await applyNameOrAliasMatch(builder, cleaned);

  const { data, error } = await builder.order('name');

  if (error) {
    console.error('Error searching core movements:', error);
    throw error;
  }

  return data || [];
}

// ============================================================================
// MOVEMENTS (Exercises)
// ============================================================================

/**
 * Classification-driven list filter (Stage 5, Task 3). Both catalog tabs'
 * pills resolve to one of these and the WHERE clause runs server-side —
 * no more client-side name-substring buckets.
 */
export interface CatalogListFilter {
  /** movement_categories.id — the modality pills (Weightlifting, ...). */
  categoryId?: string;
  /** The "Cores" pill: hierarchy roots only (is_core = true). */
  coresOnly?: boolean;
  /**
   * fetchAllExercises/searchAllExercises only: keep is_movement = true rows
   * in the result. The Exercises tab omits this (the tab split is real);
   * whole-catalog pickers (the workout wizard's exercise search) pass true.
   */
  includeMovements?: boolean;
}

let movementCategoryIdsPromise: Promise<Map<string, string>> | null = null;

/**
 * Modality dictionary as name -> id, resolved once per session. The pills are
 * fixed copy ("Weightlifting", "Gymnastics", ...) but the ids belong to the
 * dictionary, so they are looked up rather than hardcoded.
 */
export function resolveMovementCategoryIds(): Promise<Map<string, string>> {
  if (!movementCategoryIdsPromise) {
    movementCategoryIdsPromise = fetchMovementCategories()
      .then((categories) => new Map(categories.map((c) => [c.name, c.id])))
      .catch((error) => {
        movementCategoryIdsPromise = null; // retry next call
        throw error;
      });
  }
  return movementCategoryIdsPromise;
}

// Loosely typed on purpose: the supabase client is untyped, and the builder
// generic here would prove nothing about column names anyway.
function applyCatalogFilter(query: any, filter?: CatalogListFilter): any {
  if (filter?.categoryId) query = query.eq('movement_category_id', filter.categoryId);
  if (filter?.coresOnly) query = query.eq('is_core', true);
  return query;
}

/**
 * PostgREST .or() grammar characters are stripped from the term so a typed
 * comma or paren cannot 400 into silent "no results".
 */
function cleanSearchTerm(raw: string): string {
  return raw.replace(/[,()\[\]{}"\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Exercise ids whose alias matches the term — the first leg of alias-aware
 * search. exercise_aliases holds every kind (generated, display, short,
 * wild), so "Pullups" finds Pull-Up without the model's help.
 */
async function searchAliasExerciseIds(term: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('exercise_aliases')
    .select('exercise_id')
    .ilike('alias', `%${term}%`)
    .limit(200);

  if (error) {
    // Alias matching is an enhancement on top of name matching — degrade to
    // name-only rather than failing the whole search.
    console.error('Error searching exercise aliases:', error);
    return [];
  }

  return [...new Set((data ?? []).map((row) => row.exercise_id as string))];
}

/**
 * Match name OR alias, server-side. PostgREST's or-with-embedded-filter is
 * fiddly, so this runs two round trips: alias table first for ids, then
 * `name ilike OR id in (...)` on exercises — fine at catalog scale (~300
 * rows). The term must already be cleaned (cleanSearchTerm).
 */
async function applyNameOrAliasMatch(query: any, cleaned: string): Promise<any> {
  // Under 2 characters the alias leg is skipped: a one-letter term matches
  // hundreds of alias rows, and the resulting id.in.(...) list risks blowing
  // the URL length for no relevance gain. Name-only until the term narrows.
  if (cleaned.length < 2) {
    return query.ilike('name', `%${cleaned}%`);
  }
  const aliasIds = await searchAliasExerciseIds(cleaned);
  if (aliasIds.length === 0) {
    return query.ilike('name', `%${cleaned}%`);
  }
  return query.or(`name.ilike.%${cleaned}%,id.in.(${aliasIds.join(',')})`);
}

/**
 * Fetch all movements (exercises with is_movement = true),
 * optionally narrowed by a classification filter (server-side).
 */
export async function fetchMovements(filter?: CatalogListFilter): Promise<ExerciseWithVariations[]> {
  let query = supabase
    .from('exercises')
    .select(`
      *,
      goal_type:goal_types(*),
      movement_category:movement_categories(*),
      variations:exercise_variations(
        *,
        variation_option:variation_options(
          *,
          category:variation_categories(*)
        )
      ),
      scoring_types:exercise_scoring_types(
        scoring_type:scoring_types(*)
      )
    `)
    .eq('is_movement', true)
    .order('name');

  query = applyCatalogFilter(query, filter);

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching movements:', error);
    throw error;
  }

  // Build full_name for each exercise (e.g., "Front Squat + Pause + Barbell")
  const movements = (data || []).map((exercise) => {
    const variationNames = exercise.variations
      ?.map((v: any) => v.variation_option?.name)
      .filter(Boolean) || [];

    const full_name = variationNames.length > 0
      ? `${exercise.name} + ${variationNames.join(' + ')}`
      : exercise.name;

    // Flatten scoring_types
    const scoringTypes = exercise.scoring_types
      ?.map((st: any) => st.scoring_type)
      .filter(Boolean) || [];

    return {
      ...exercise,
      full_name,
      scoring_types: scoringTypes,
    };
  });

  return movements;
}

/**
 * Search movements by name OR alias (exercise_aliases), scoped to
 * is_movement = true, optionally narrowed by a classification filter.
 */
export async function searchMovements(
  query: string,
  filter?: CatalogListFilter
): Promise<ExerciseWithVariations[]> {
  const cleaned = cleanSearchTerm(query);
  if (!cleaned) return [];

  let builder = supabase
    .from('exercises')
    .select(`
      *,
      goal_type:goal_types(*),
      movement_category:movement_categories(*),
      variations:exercise_variations(
        *,
        variation_option:variation_options(
          *,
          category:variation_categories(*)
        )
      ),
      scoring_types:exercise_scoring_types(
        scoring_type:scoring_types(*)
      )
    `)
    .eq('is_movement', true);

  builder = applyCatalogFilter(builder, filter);
  builder = await applyNameOrAliasMatch(builder, cleaned);

  const { data, error } = await builder.order('name').limit(20);

  if (error) {
    console.error('Error searching movements:', error);
    throw error;
  }

  // Build full_name for search results
  const movements = (data || []).map((exercise) => {
    const variationNames = exercise.variations
      ?.map((v: any) => v.variation_option?.name)
      .filter(Boolean) || [];

    const full_name = variationNames.length > 0
      ? `${exercise.name} + ${variationNames.join(' + ')}`
      : exercise.name;

    // Flatten scoring_types
    const scoringTypes = exercise.scoring_types
      ?.map((st: any) => st.scoring_type)
      .filter(Boolean) || [];

    return {
      ...exercise,
      full_name,
      scoring_types: scoringTypes,
    };
  });

  return movements;
}

// ============================================================================
// Exercises tab reads — the NON-movement side of the catalog
// ============================================================================

/**
 * Fetch exercises for the Exercises tab: is_movement = true rows are
 * EXCLUDED (Stage 5, Task 3 — the tab split is real now; movements live in
 * the Movements tab only). Optionally narrowed by a classification filter.
 */
export async function fetchAllExercises(filter?: CatalogListFilter): Promise<ExerciseWithVariations[]> {
  let query = supabase
    .from('exercises')
    .select(`
      *,
      goal_type:goal_types(*),
      movement_category:movement_categories(*),
      variations:exercise_variations(
        *,
        variation_option:variation_options(
          *,
          category:variation_categories(*)
        )
      ),
      scoring_types:exercise_scoring_types(
        scoring_type:scoring_types(*)
      )
    `)
    .order('name');

  if (!filter?.includeMovements) {
    // not.is.true rather than eq.false so a NULL is_movement row (the column
    // is nullable) still lands on this side of the split.
    query = query.not('is_movement', 'is', true);
  }
  query = applyCatalogFilter(query, filter);

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching all exercises:', error);
    throw error;
  }

  // Build full_name for each exercise (e.g., "Front Squat + Pause + Barbell")
  const exercises = (data || []).map((exercise) => {
    const variationNames = exercise.variations
      ?.map((v: any) => v.variation_option?.name)
      .filter(Boolean) || [];

    const full_name = variationNames.length > 0
      ? `${exercise.name} + ${variationNames.join(' + ')}`
      : exercise.name;

    // Flatten scoring_types
    const scoringTypes = exercise.scoring_types
      ?.map((st: any) => st.scoring_type)
      .filter(Boolean) || [];

    return {
      ...exercise,
      full_name,
      scoring_types: scoringTypes,
    };
  });

  return exercises;
}

/**
 * Search exercises by name OR alias (exercise_aliases) for the Exercises tab:
 * is_movement = true rows are excluded unless the filter says otherwise
 * (whole-catalog pickers pass includeMovements).
 */
export async function searchAllExercises(
  query: string,
  filter?: CatalogListFilter
): Promise<ExerciseWithVariations[]> {
  const cleaned = cleanSearchTerm(query);
  if (!cleaned) return [];

  let builder = supabase
    .from('exercises')
    .select(`
      *,
      goal_type:goal_types(*),
      movement_category:movement_categories(*),
      variations:exercise_variations(
        *,
        variation_option:variation_options(
          *,
          category:variation_categories(*)
        )
      ),
      scoring_types:exercise_scoring_types(
        scoring_type:scoring_types(*)
      )
    `);

  if (!filter?.includeMovements) {
    builder = builder.not('is_movement', 'is', true);
  }
  builder = applyCatalogFilter(builder, filter);
  builder = await applyNameOrAliasMatch(builder, cleaned);

  const { data, error } = await builder.order('name').limit(50);

  if (error) {
    console.error('Error searching all exercises:', error);
    throw error;
  }

  // Build full_name for search results
  const exercises = (data || []).map((exercise) => {
    const variationNames = exercise.variations
      ?.map((v: any) => v.variation_option?.name)
      .filter(Boolean) || [];

    const full_name = variationNames.length > 0
      ? `${exercise.name} + ${variationNames.join(' + ')}`
      : exercise.name;

    // Flatten scoring_types
    const scoringTypes = exercise.scoring_types
      ?.map((st: any) => st.scoring_type)
      .filter(Boolean) || [];

    return {
      ...exercise,
      full_name,
      scoring_types: scoringTypes,
    };
  });

  return exercises;
}

/**
 * Create a new exercise (non-movement)
 * Sets is_movement: false to distinguish from CrossFit movements
 */
export async function createExercise(input: CreateMovementInput): Promise<string> {
  try {
    // Generate unique slug
    const slug = await generateUniqueSlug(input.name);

    // Determine requires_weight based on equipment
    // Weighted equipment: Barbell, Dumbbell, Kettlebell, Med Ball, Plate, Sandbag
    const weightedEquipment = ['Barbell', 'Dumbbell', 'Kettlebell', 'Med Ball', 'Plate', 'Sandbag'];
    const requiresWeight = input.equipment_types?.some(eq =>
      weightedEquipment.some(weighted => eq.toLowerCase().includes(weighted.toLowerCase()))
    ) || false;

    // Determine requires_distance based on scoring types
    let requiresDistance = false;
    if (input.scoring_type_ids && input.scoring_type_ids.length > 0) {
      // Fetch scoring types to check if "Distance" is included
      const scoringTypes = await fetchScoringTypes();
      const distanceScoringType = scoringTypes.find(st => st.name === 'Distance');
      if (distanceScoringType) {
        requiresDistance = input.scoring_type_ids.includes(distanceScoringType.id);
      }
    }

    // 1. Insert the exercise
    const exerciseData: any = {
      name: input.name,
      description: input.description,
      slug,
      goal_type_id: input.goal_type_id || (input.goal_type_ids && input.goal_type_ids.length > 0 ? input.goal_type_ids[0] : null), // Legacy: use first goal type
      movement_category_id: input.movement_category_id,

      // Movement Hierarchy
      is_core: input.is_core || false,
      ...(input.parent_exercise_id && { parent_exercise_id: input.parent_exercise_id }),

      // Core movement metadata (only include if provided)
      ...(input.movement_family_id && { movement_family_id: input.movement_family_id }),
      ...(input.plane_of_motion_id && { plane_of_motion_id: input.plane_of_motion_id }), // Legacy
      ...((!input.plane_of_motion_id && input.plane_of_motion_ids && input.plane_of_motion_ids.length > 0) && { plane_of_motion_id: input.plane_of_motion_ids[0] }), // Set first as legacy value
      ...(input.skill_level && { skill_level: input.skill_level }),
      ...(input.short_name && { short_name: input.short_name }),
      ...(input.aliases && input.aliases.length > 0 && { aliases: input.aliases }),

      // Movement attributes (only include if provided)
      ...(input.load_position_id && { load_position_id: input.load_position_id }), // Legacy
      ...((!input.load_position_id && input.load_position_ids && input.load_position_ids.length > 0) && { load_position_id: input.load_position_ids[0] }), // Set first as legacy value
      ...(input.stance_id && { stance_id: input.stance_id }), // Legacy
      ...((!input.stance_id && input.stance_ids && input.stance_ids.length > 0) && { stance_id: input.stance_ids[0] }), // Set first as legacy value
      ...(input.range_depth_id && { range_depth_id: input.range_depth_id }),
      ...(input.movement_style_id && { movement_style_id: input.movement_style_id }),
      ...(input.symmetry_id && { symmetry_id: input.symmetry_id }),

      // Equipment
      ...(input.equipment_types && input.equipment_types.length > 0 && { equipment_types: input.equipment_types }),
      requires_weight: requiresWeight,
      requires_distance: requiresDistance,

      // Media
      ...(input.video_url && { video_url: input.video_url }),
      ...(input.image_url && { image_url: input.image_url }),

      // Ownership - KEY DIFFERENCE: is_movement is false for exercises
      is_movement: false,
      is_official: false,
      created_by: input.created_by,
    };

    const { data: exercise, error: exerciseError } = await supabase
      .from('exercises')
      .insert(exerciseData)
      .select('id')
      .single();

    if (exerciseError) {
      console.error('Error creating exercise:', exerciseError);
      throw exerciseError;
    }

    // 2. Insert goal types (if any)
    if (input.goal_type_ids && input.goal_type_ids.length > 0) {
      const goalTypeInserts = input.goal_type_ids.map(goalTypeId => ({
        exercise_id: exercise.id,
        goal_type_id: goalTypeId,
      }));

      const { error: goalTypeError } = await supabase
        .from('exercise_goal_types')
        .insert(goalTypeInserts);

      if (goalTypeError) {
        console.error('Error inserting exercise goal types:', goalTypeError);
        throw goalTypeError;
      }
    }

    // 3. Insert planes of motion (if any)
    if (input.plane_of_motion_ids && input.plane_of_motion_ids.length > 0) {
      const planeInserts = input.plane_of_motion_ids.map(planeId => ({
        exercise_id: exercise.id,
        plane_of_motion_id: planeId,
      }));

      const { error: planeError } = await supabase
        .from('exercise_planes_of_motion')
        .insert(planeInserts);

      if (planeError) {
        console.error('Error inserting exercise planes of motion:', planeError);
        throw planeError;
      }
    }

    // 4. Insert load positions (if any)
    if (input.load_position_ids && input.load_position_ids.length > 0) {
      const loadPositionInserts = input.load_position_ids.map(loadPositionId => ({
        exercise_id: exercise.id,
        load_position_id: loadPositionId,
      }));

      const { error: loadPositionError } = await supabase
        .from('exercise_load_positions')
        .insert(loadPositionInserts);

      if (loadPositionError) {
        console.error('Error inserting exercise load positions:', loadPositionError);
        throw loadPositionError;
      }
    }

    // 5. Insert stances (if any)
    if (input.stance_ids && input.stance_ids.length > 0) {
      const stanceInserts = input.stance_ids.map(stanceId => ({
        exercise_id: exercise.id,
        stance_id: stanceId,
      }));

      const { error: stanceError } = await supabase
        .from('exercise_stances')
        .insert(stanceInserts);

      if (stanceError) {
        console.error('Error inserting exercise stances:', stanceError);
        throw stanceError;
      }
    }

    // 6. Insert variation options (if any)
    if (input.variation_option_ids && input.variation_option_ids.length > 0) {
      const variationInserts = input.variation_option_ids.map(optionId => ({
        exercise_id: exercise.id,
        variation_option_id: optionId,
      }));

      const { error: variationError } = await supabase
        .from('exercise_variations')
        .insert(variationInserts);

      if (variationError) {
        console.error('Error inserting exercise variations:', variationError);
        throw variationError;
      }
    }

    // 7. Insert scoring types (if any)
    if (input.scoring_type_ids && input.scoring_type_ids.length > 0) {
      const scoringInserts = input.scoring_type_ids.map(scoringTypeId => ({
        exercise_id: exercise.id,
        scoring_type_id: scoringTypeId,
      }));

      const { error: scoringError } = await supabase
        .from('exercise_scoring_types')
        .insert(scoringInserts);

      if (scoringError) {
        console.error('Error inserting exercise scoring types:', scoringError);
        throw scoringError;
      }
    }

    // 8. Insert muscle regions (if any)
    if (input.muscle_region_ids && input.muscle_region_ids.length > 0) {
      const muscleInserts = input.muscle_region_ids.map(regionId => ({
        exercise_id: exercise.id,
        muscle_region_id: regionId,
        is_primary: input.primary_muscle_region_ids?.includes(regionId) || false,
      }));

      const { error: muscleError } = await supabase
        .from('exercise_muscle_regions')
        .insert(muscleInserts);

      if (muscleError) {
        console.error('Error inserting exercise muscle regions:', muscleError);
        throw muscleError;
      }
    }

    // 9. Insert movement styles (if any)
    if (input.movement_style_ids && input.movement_style_ids.length > 0) {
      const styleInserts = input.movement_style_ids.map(styleId => ({
        exercise_id: exercise.id,
        movement_style_id: styleId,
      }));

      const { error: styleError } = await supabase
        .from('exercise_movement_styles')
        .insert(styleInserts);

      if (styleError) {
        console.error('Error inserting exercise movement styles:', styleError);
        throw styleError;
      }
    }

    return exercise.id;
  } catch (error) {
    console.error('Error in createExercise:', error);
    throw error;
  }
}

/**
 * Fetch a single movement by ID with all variations
 */
export async function fetchMovementById(movementId: string): Promise<ExerciseWithVariations | null> {
  const { data, error } = await supabase
    .from('exercises')
    .select(`
      *,
      goal_type:goal_types(*),
      variations:exercise_variations(
        *,
        variation_option:variation_options(
          *,
          category:variation_categories(*)
        )
      )
    `)
    .eq('id', movementId)
    .eq('is_movement', true)
    .single();

  if (error) {
    console.error('Error fetching movement:', error);
    throw error;
  }

  // Build full_name
  const variationNames = data.variations
    ?.map((v: any) => v.variation_option?.name)
    .filter(Boolean) || [];

  const full_name = variationNames.length > 0
    ? `${data.name} + ${variationNames.join(' + ')}`
    : data.name;

  return {
    ...data,
    full_name,
  };
}

// ============================================================================
// MOVEMENT CREATION & MANAGEMENT
// ============================================================================

/**
 * Fetch all movement categories (Weightlifting, Gymnastics, Monostructural, Recovery)
 */
export async function fetchMovementCategories(): Promise<MovementCategory[]> {
  const { data, error } = await supabase
    .from('movement_categories')
    .select('*')
    .order('display_order');

  if (error) {
    console.error('Error fetching movement categories:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch all scoring types (Reps, Rounds, Weight, Time, Distance, Calories, Height, None)
 */
export async function fetchScoringTypes(): Promise<ScoringType[]> {
  const { data, error } = await supabase
    .from('scoring_types')
    .select('*')
    .order('display_order');

  if (error) {
    console.error('Error fetching scoring types:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch all variation options grouped by category
 */
export async function fetchVariationOptions(): Promise<VariationOptionWithCategory[]> {
  const { data, error } = await supabase
    .from('variation_options')
    .select(`
      *,
      category:variation_categories(*)
    `)
    .order('display_order');

  if (error) {
    console.error('Error fetching variation options:', error);
    throw error;
  }

  // Sort by category display_order in JavaScript since we can't do it in the query
  const sorted = (data || []).sort((a, b) => {
    const categoryOrder = (a.category?.display_order || 0) - (b.category?.display_order || 0);
    if (categoryOrder !== 0) return categoryOrder;
    return (a.display_order || 0) - (b.display_order || 0);
  });

  return sorted;
}

// createVariationOption is gone (Stage 5, Task 3): the unified wizard (Task 2)
// removed its last callers, and the app must not MINT variation options — the
// existing rows render read-only on the detail page until Stage 6 drops them.
// fetchMovementWithAttributes went with it (zero callers since Task 2).

// Tier is a STORED column now (Stage 5, Task 3). The engine that owns every
// exercise write (Stages 1-4) maintains `exercises.tier` — 0 for cores, 1+ for
// derivations, NULL for outliers — so the client-side hierarchy walker
// (movementTier.ts), the whole-table tier map, and the per-row
// `get_movement_tier` RPC call are all gone. Nothing is computed client-side.

/** One rung of a detail page's ancestor chain. */
export interface AncestorRow {
  id: string;
  name: string;
  is_core: boolean;
  tier: number;
  parent_exercise_id: string | null;
}

/**
 * Ancestors of one exercise, immediate parent first hop, root (core) first in
 * the returned array.
 *
 * Bounded iterative walk instead of the old whole-table fetch: the DB caps
 * hierarchy depth at 4 (validate_movement_depth), so at most 4 single-row
 * lookups replace reading all ~300 rows to draw a two-item tree. Tier comes
 * from the stored column on each rung.
 */
export async function fetchAncestors(parentId: string): Promise<AncestorRow[]> {
  const ancestors: AncestorRow[] = [];
  const walked = new Set<string>();
  let currentId: string | null = parentId;

  while (currentId && !walked.has(currentId) && ancestors.length < 4) {
    walked.add(currentId);
    // Explicit annotation: the untyped client would otherwise make `data`'s
    // type circular through `currentId` (TS7022).
    const { data, error }: {
      data: (Omit<AncestorRow, 'tier'> & { tier: number | null }) | null;
      error: unknown;
    } = await supabase
      .from('exercises')
      .select('id, name, is_core, tier, parent_exercise_id')
      .eq('id', currentId)
      .single();

    if (error || !data) {
      if (error) console.error('Error fetching ancestor:', error);
      break;
    }

    ancestors.unshift({
      id: data.id,
      name: data.name,
      is_core: data.is_core,
      tier: data.tier ?? 0,
      parent_exercise_id: data.parent_exercise_id,
    });
    currentId = data.is_core ? null : data.parent_exercise_id;
  }

  return ancestors;
}

// generateUniqueSlug moved to the front-door module (Stage 5, Task 1) — the
// collision-probing behavior is unchanged; this legacy module now shares the
// single implementation. (See imports at the top of this file.)
// createMovement was the Movements-tab wizard's writer. The unified wizard
// (Stage 5, Task 2) saves through the front door (frontDoor.createCatalogExercise)
// exclusively, so the function is gone — the front door is the ONLY insert
// path for the exercises catalog.

// ============================================================================
// WODs (Workout of the Day Templates)
// ============================================================================

/**
 * Fetch all WODs with optional category filter
 */
export async function fetchWODs(categoryId?: string): Promise<WODWithDetails[]> {
  let query = supabase
    .from('wods')
    .select(`
      *,
      format:wod_formats(*),
      category:wod_categories(*),
      scaling_levels:wod_scaling_levels(*),
      movements:wod_movements(
        *,
        exercise:exercises!wod_movements_exercise_id_fkey(*)
      )
    `)
    .order('name');

  if (categoryId) {
    query = query.eq('category_id', categoryId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching WODs:', error);
    throw error;
  }

  return data || [];
}

/**
 * Search WODs by name
 */
export async function searchWODs(query: string): Promise<WODWithDetails[]> {
  const { data, error } = await supabase
    .from('wods')
    .select(`
      *,
      format:wod_formats(*),
      category:wod_categories(*),
      scaling_levels:wod_scaling_levels(*),
      movements:wod_movements(
        *,
        exercise:exercises!wod_movements_exercise_id_fkey(*)
      )
    `)
    .ilike('name', `%${query}%`)
    .order('name')
    .limit(20);

  if (error) {
    console.error('Error searching WODs:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch a single WOD by ID with all details
 */
export async function fetchWODById(wodId: string): Promise<WODWithDetails | null> {
  const { data, error } = await supabase
    .from('wods')
    .select(`
      *,
      format:wod_formats(*),
      category:wod_categories(*),
      scaling_levels:wod_scaling_levels(*),
      movements:wod_movements(
        *,
        exercise:exercises!wod_movements_exercise_id_fkey(
          *,
          movement_category:movement_categories(*),
          goal_type:goal_types(*),
          muscle_regions:exercise_muscle_regions(
            is_primary,
            muscle_region:muscle_regions(name)
          )
        ),
        rx_alternative_exercise:exercises!wod_movements_rx_alternative_exercise_id_fkey(
          *,
          movement_category:movement_categories(*),
          goal_type:goal_types(*),
          muscle_regions:exercise_muscle_regions(
            is_primary,
            muscle_region:muscle_regions(name)
          )
        ),
        l2_alternative_exercise:exercises!wod_movements_l2_alternative_exercise_id_fkey(
          *,
          movement_category:movement_categories(*),
          goal_type:goal_types(*),
          muscle_regions:exercise_muscle_regions(
            is_primary,
            muscle_region:muscle_regions(name)
          )
        ),
        l1_alternative_exercise:exercises!wod_movements_l1_alternative_exercise_id_fkey(
          *,
          movement_category:movement_categories(*),
          goal_type:goal_types(*),
          muscle_regions:exercise_muscle_regions(
            is_primary,
            muscle_region:muscle_regions(name)
          )
        ),
        standards:movement_standards(*)
      )
    `)
    .eq('id', wodId)
    .single();

  if (error) {
    console.error('Error fetching WOD:', error);
    throw error;
  }

  return data;
}

/**
 * Create a new WOD template
 */
export async function createWOD(userId: string, input: CreateWODInput): Promise<WOD | null> {
  try {
    // Create the WOD
    const { data: wod, error: wodError } = await supabase
      .from('wods')
      .insert({
        user_id: userId,
        name: input.name,
        description: input.description,
        format_id: input.format_id,
        category_id: input.category_id,

        // For Time specific fields (new)
        rep_scheme_type: input.rep_scheme_type,
        rep_scheme: input.rep_scheme,

        time_cap_minutes: input.time_cap_minutes,
        notes: input.notes,
        score_type_time: input.score_type_time,
        score_type_rounds: input.score_type_rounds,
        score_type_reps: input.score_type_reps,
        score_type_load: input.score_type_load,
        score_type_distance: input.score_type_distance,
        score_type_calories: input.score_type_calories,
      })
      .select()
      .single();

    if (wodError || !wod) {
      console.error('Error creating WOD:', wodError);
      return null;
    }

    // Create scaling levels if provided
    if (input.scaling_levels && input.scaling_levels.length > 0) {
      const scalingLevelsToInsert = input.scaling_levels.map((level) => ({
        wod_id: wod.id,
        level: level.level,
        description: level.description,
      }));

      const { error: scalingError } = await supabase
        .from('wod_scaling_levels')
        .insert(scalingLevelsToInsert);

      if (scalingError) {
        console.error('Error creating scaling levels:', scalingError);
      }
    }

    // Create movements if provided
    if (input.movements && input.movements.length > 0) {
      const movementsToInsert = input.movements.map((movement, index) => ({
        wod_id: wod.id,
        exercise_id: movement.exercise_id,
        movement_order: index,

        // Rx - Gender split weights (new)
        rx_reps: movement.rx_reps,
        rx_weight_men_lbs: movement.rx_weight_men_lbs,
        rx_weight_women_lbs: movement.rx_weight_women_lbs,
        rx_distance_value: movement.rx_distance_value,
        rx_distance_unit: movement.rx_distance_unit,
        rx_time: movement.rx_time,
        rx_movement_variation: movement.rx_movement_variation,
        rx_alternative_exercise_id: movement.rx_alternative_exercise_id,
        rx_alternative_exercise_name: movement.rx_alternative_exercise_name,

        // L2 - Gender split weights (new)
        l2_reps: movement.l2_reps,
        l2_weight_men_lbs: movement.l2_weight_men_lbs,
        l2_weight_women_lbs: movement.l2_weight_women_lbs,
        l2_distance_value: movement.l2_distance_value,
        l2_distance_unit: movement.l2_distance_unit,
        l2_time: movement.l2_time,
        l2_movement_variation: movement.l2_movement_variation,
        l2_alternative_exercise_id: movement.l2_alternative_exercise_id,
        l2_alternative_exercise_name: movement.l2_alternative_exercise_name,

        // L1 - Gender split weights (new)
        l1_reps: movement.l1_reps,
        l1_weight_men_lbs: movement.l1_weight_men_lbs,
        l1_weight_women_lbs: movement.l1_weight_women_lbs,
        l1_distance_value: movement.l1_distance_value,
        l1_distance_unit: movement.l1_distance_unit,
        l1_time: movement.l1_time,
        l1_movement_variation: movement.l1_movement_variation,
        l1_alternative_exercise_id: movement.l1_alternative_exercise_id,
        l1_alternative_exercise_name: movement.l1_alternative_exercise_name,

        notes: movement.notes,
      }));

      const { error: movementsError } = await supabase
        .from('wod_movements')
        .insert(movementsToInsert);

      if (movementsError) {
        console.error('Error creating WOD movements:', movementsError);
      }
    }

    // Trigger WOD image generation asynchronously (don't wait for it)
    // This happens in the background so it doesn't block the save operation
    generateWODImage(wod.id, input, userId).catch((err) => {
      console.error('Background image generation failed:', err);
      // Silent failure - image generation failed flag will be set in the function
    });

    return wod;
  } catch (error) {
    console.error('Error in createWOD:', error);
    return null;
  }
}

/**
 * Generate a WOD image using Gemini API via Supabase Edge Function
 * This runs asynchronously and doesn't block WOD creation
 */
async function generateWODImage(
  wodId: string,
  wodInput: CreateWODInput,
  userId: string
): Promise<void> {
  try {
    console.log('generateWODImage - wodInput.movements:', JSON.stringify(wodInput.movements, null, 2));

    // Import the prompt building function
    const { buildWODImagePrompt } = await import('../gemini');

    // Get format name for better prompt
    const formats = await fetchWODFormats();
    const format = formats.find(f => f.id === wodInput.format_id);

    // Names for the prompt, in one query rather than one per movement.
    const movementIds = (wodInput.movements || []).map((m) => m.exercise_id);
    const { data: named, error: namesError } = movementIds.length > 0
      ? await supabase.from('exercises').select('id, name').in('id', movementIds)
      : { data: [], error: null };

    if (namesError) {
      console.error('Failed to fetch movement names:', namesError);
    }
    const nameById = new Map(
      ((named ?? []) as Array<{ id: string; name: string }>).map((e) => [e.id, e.name]),
    );
    // Order follows the WOD's own movement order, and an id the query didn't
    // return still takes a slot — the prompt reads better with a placeholder
    // than with a movement silently missing.
    const movements = movementIds.map((id) => ({ name: nameById.get(id) || 'Movement' }));
    console.log('Fetched movement names:', movements.map(m => m.name).join(', '));

    // Build prompt from WOD data
    const prompt = buildWODImagePrompt({
      wodName: wodInput.name,
      formatName: format?.name || 'For Time',
      movements,
      timeCap: wodInput.time_cap_minutes,
      repScheme: wodInput.rep_scheme,
    });

    // Call Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('generate-wod-image', {
      body: {
        wodId,
        prompt,
        userId,
      },
    });

    if (error) {
      console.error('Edge function error:', error);
      // Update WOD to mark image generation as failed
      await supabase
        .from('wods')
        .update({ image_generation_failed: true })
        .eq('id', wodId);
      throw error;
    }

    console.log('WOD image generated successfully:', data);
  } catch (error) {
    console.error('Failed to generate WOD image:', error);
    throw error;
  }
}

/**
 * Update an existing WOD template
 */
export async function updateWOD(wodId: string, updates: UpdateWODInput): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('wods')
      .update(updates)
      .eq('id', wodId);

    if (error) {
      console.error('Error updating WOD:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateWOD:', error);
    return false;
  }
}

/**
 * Delete a WOD template (cascades to delete scaling levels and movements)
 */
export async function deleteWOD(wodId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('wods')
      .delete()
      .eq('id', wodId);

    if (error) {
      console.error('Error deleting WOD:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteWOD:', error);
    return false;
  }
}

// ============================================================================
// CLASSES (Workout Sessions)
// ============================================================================

/**
 * Fetch all classes for a user
 */
export async function fetchClasses(userId: string): Promise<ClassWithDetails[]> {
  const { data, error } = await supabase
    .from('classes')
    .select(`
      *,
      parts:class_parts(
        *,
        wod:wods(
          *,
          format:wod_formats(*),
          category:wod_categories(*)
        )
      )
    `)
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching classes:', error);
    throw error;
  }

  return data || [];
}

/**
 * Search classes by name
 */
export async function searchClasses(userId: string, query: string): Promise<ClassWithDetails[]> {
  const { data, error } = await supabase
    .from('classes')
    .select(`
      *,
      parts:class_parts(
        *,
        wod:wods(
          *,
          format:wod_formats(*),
          category:wod_categories(*)
        )
      )
    `)
    .eq('user_id', userId)
    .ilike('name', `%${query}%`)
    .order('date', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error searching classes:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch a single class by ID with all parts
 */
export async function fetchClassById(classId: string): Promise<ClassWithDetails | null> {
  const { data, error } = await supabase
    .from('classes')
    .select(`
      *,
      parts:class_parts(
        *,
        wod:wods(
          *,
          format:wod_formats(*),
          category:wod_categories(*),
          movements:wod_movements(
            *,
            exercise:exercises!wod_movements_exercise_id_fkey(*)
          )
        )
      )
    `)
    .eq('id', classId)
    .single();

  if (error) {
    console.error('Error fetching class:', error);
    throw error;
  }

  return data;
}

/**
 * Create a new class
 */
export async function createClass(userId: string, input: CreateClassInput): Promise<Class | null> {
  try {
    // Create the class
    const { data: classData, error: classError } = await supabase
      .from('classes')
      .insert({
        user_id: userId,
        date: input.date,
        name: input.name,
        duration_minutes: input.duration_minutes || 60,
      })
      .select()
      .single();

    if (classError || !classData) {
      console.error('Error creating class:', classError);
      return null;
    }

    // Create class parts if provided
    if (input.parts && input.parts.length > 0) {
      const partsToInsert = input.parts.map((part, index) => ({
        class_id: classData.id,
        part_type: part.part_type,
        part_order: index,
        wod_id: part.wod_id,
        custom_description: part.custom_description,
      }));

      const { error: partsError } = await supabase
        .from('class_parts')
        .insert(partsToInsert);

      if (partsError) {
        console.error('Error creating class parts:', partsError);
      }
    }

    return classData;
  } catch (error) {
    console.error('Error in createClass:', error);
    return null;
  }
}

/**
 * Update an existing class
 */
export async function updateClass(classId: string, updates: UpdateClassInput): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('classes')
      .update(updates)
      .eq('id', classId);

    if (error) {
      console.error('Error updating class:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateClass:', error);
    return false;
  }
}

/**
 * Delete a class (cascades to delete all parts)
 */
export async function deleteClass(classId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('classes')
      .delete()
      .eq('id', classId);

    if (error) {
      console.error('Error deleting class:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteClass:', error);
    return false;
  }
}

// ============================================================================
// CLASS PARTS MANAGEMENT
// ============================================================================

/**
 * Add a new part to a class
 */
export async function addClassPart(
  classId: string,
  part: {
    part_type: string;
    wod_id?: string | null;
    custom_description?: string | null;
  }
): Promise<ClassPart | null> {
  try {
    // Get current max part_order
    const { data: existingParts } = await supabase
      .from('class_parts')
      .select('part_order')
      .eq('class_id', classId)
      .order('part_order', { ascending: false })
      .limit(1);

    const nextOrder = existingParts && existingParts.length > 0
      ? existingParts[0].part_order + 1
      : 0;

    const { data, error } = await supabase
      .from('class_parts')
      .insert({
        class_id: classId,
        part_type: part.part_type,
        part_order: nextOrder,
        wod_id: part.wod_id,
        custom_description: part.custom_description,
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding class part:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in addClassPart:', error);
    return null;
  }
}

/**
 * Update a class part
 */
export async function updateClassPart(
  partId: string,
  updates: {
    part_type?: string;
    wod_id?: string | null;
    custom_description?: string | null;
  }
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('class_parts')
      .update(updates)
      .eq('id', partId);

    if (error) {
      console.error('Error updating class part:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateClassPart:', error);
    return false;
  }
}

/**
 * Delete a class part
 */
export async function deleteClassPart(partId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('class_parts')
      .delete()
      .eq('id', partId);

    if (error) {
      console.error('Error deleting class part:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteClassPart:', error);
    return false;
  }
}

/**
 * Reorder class parts
 */
export async function reorderClassParts(
  classId: string,
  orderedPartIds: string[]
): Promise<boolean> {
  try {
    // Update each part with its new part_order
    const updates = orderedPartIds.map((partId, index) =>
      supabase
        .from('class_parts')
        .update({ part_order: index })
        .eq('id', partId)
        .eq('class_id', classId)
    );

    const results = await Promise.all(updates);

    // Check if any updates failed
    const hasError = results.some((result) => result.error);
    if (hasError) {
      console.error('Error reordering class parts');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in reorderClassParts:', error);
    return false;
  }
}

// ============================================================================
// EXERCISE STANDARDS, MEASUREMENT PROFILES, AND SCALING LINKS
// ============================================================================

/**
 * Fetch exercise standards for a specific exercise or variation
 */
export async function fetchExerciseStandards(
  exerciseId?: string,
  variationOptionId?: string
): Promise<ExerciseStandard[]> {
  let query = supabase
    .from('exercise_standards')
    .select('*')
    .order('created_at', { ascending: false });

  if (exerciseId) {
    query = query.eq('exercise_id', exerciseId);
  }

  if (variationOptionId) {
    query = query.eq('variation_option_id', variationOptionId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching exercise standards:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch measurement profiles for a specific exercise or variation
 */
export async function fetchMeasurementProfiles(
  exerciseId?: string,
  variationOptionId?: string
): Promise<MovementMeasurementProfile[]> {
  let query = supabase
    .from('movement_measurement_profiles')
    .select('*')
    .order('measurement_type');

  if (exerciseId) {
    query = query.eq('exercise_id', exerciseId);
  }

  if (variationOptionId) {
    query = query.eq('variation_option_id', variationOptionId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching measurement profiles:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch progressions for a specific exercise
 * Returns movements that are harder/more advanced
 */
export async function fetchMovementProgressions(
  exerciseId: string,
  variationOptionId?: string
): Promise<(MovementScalingLink & { to_exercise?: Exercise })[]> {
  let query = supabase
    .from('movement_scaling_links')
    .select(`
      *,
      to_exercise:exercises!movement_scaling_links_to_exercise_id_fkey(*)
    `)
    .eq('from_exercise_id', exerciseId)
    .eq('scaling_type', 'progression')
    .order('display_order');

  if (variationOptionId) {
    query = query.eq('from_variation_option_id', variationOptionId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching movement progressions:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch regressions for a specific exercise
 * Returns movements that are easier/more accessible
 */
export async function fetchMovementRegressions(
  exerciseId: string,
  variationOptionId?: string
): Promise<(MovementScalingLink & { to_exercise?: Exercise })[]> {
  let query = supabase
    .from('movement_scaling_links')
    .select(`
      *,
      to_exercise:exercises!movement_scaling_links_to_exercise_id_fkey(*)
    `)
    .eq('from_exercise_id', exerciseId)
    .eq('scaling_type', 'regression')
    .order('display_order');

  if (variationOptionId) {
    query = query.eq('from_variation_option_id', variationOptionId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching movement regressions:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch lateral alternatives for a specific exercise
 * Returns movements at similar difficulty level
 */
export async function fetchMovementAlternatives(
  exerciseId: string,
  variationOptionId?: string
): Promise<(MovementScalingLink & { to_exercise?: Exercise })[]> {
  let query = supabase
    .from('movement_scaling_links')
    .select(`
      *,
      to_exercise:exercises!movement_scaling_links_to_exercise_id_fkey(*)
    `)
    .eq('from_exercise_id', exerciseId)
    .eq('scaling_type', 'lateral')
    .order('display_order');

  if (variationOptionId) {
    query = query.eq('from_variation_option_id', variationOptionId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching movement alternatives:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch muscle regions targeted by an exercise
 */
export async function fetchExerciseMuscleRegions(exerciseId: string) {
  const { data, error } = await supabase
    .from('exercise_muscle_regions')
    .select(`
      *,
      muscle_region:muscle_regions(*)
    `)
    .eq('exercise_id', exerciseId)
    .order('is_primary', { ascending: false });

  if (error) {
    console.error('Error fetching exercise muscle regions:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch an exercise with full details including all metadata
 */
export async function fetchExerciseWithDetails(exerciseId: string): Promise<ExerciseWithDetails | null> {
  try {
    // Fetch base exercise data
    const { data: exercise, error: exerciseError } = await supabase
      .from('exercises')
      .select(`
        *,
        goal_type:goal_types(*),
        movement_category:movement_categories(*),
        movement_family:movement_families(*),
        plane_of_motion:planes_of_motion(*),
        variations:exercise_variations(
          *,
          variation_option:variation_options(
            *,
            category:variation_categories(*)
          )
        ),
        scoring_types:exercise_scoring_types(
          scoring_type:scoring_types(*)
        )
      `)
      .eq('id', exerciseId)
      .single();

    if (exerciseError || !exercise) {
      console.error('Error fetching exercise:', exerciseError);
      return null;
    }

    // Fetch additional metadata in parallel
    const [
      muscleRegions,
      measurementProfiles,
      standards,
      progressions,
      regressions,
    ] = await Promise.all([
      fetchExerciseMuscleRegions(exerciseId),
      fetchMeasurementProfiles(exerciseId),
      fetchExerciseStandards(exerciseId),
      fetchMovementProgressions(exerciseId),
      fetchMovementRegressions(exerciseId),
    ]);

    // Flatten scoring_types structure
    const flattenedScoringTypes = exercise.scoring_types?.map(
      (est: any) => est.scoring_type
    ).filter(Boolean) || [];

    return {
      ...exercise,
      scoring_types: flattenedScoringTypes,
      muscle_regions: muscleRegions,
      measurement_profiles: measurementProfiles,
      standards,
      progressions,
      regressions,
    } as ExerciseWithDetails;
  } catch (error) {
    console.error('Error in fetchExerciseWithDetails:', error);
    return null;
  }
}
