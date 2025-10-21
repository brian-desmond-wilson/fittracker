import { supabase } from '../supabase';
import type {
  GoalType,
  Exercise,
  ExerciseWithVariations,
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
    .order('name');

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
// MOVEMENTS (Exercises)
// ============================================================================

/**
 * Fetch all movements (exercises with is_movement = true)
 * Optionally filter by goal type
 */
export async function fetchMovements(goalTypeId?: string): Promise<ExerciseWithVariations[]> {
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

  if (goalTypeId) {
    query = query.eq('goal_type_id', goalTypeId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching movements:', error);
    throw error;
  }

  // Build full_name for each exercise (e.g., "Front Squat + Pause + Barbell")
  const movements = (data || []).map((exercise) => {
    const variationNames = exercise.variations
      ?.map((v) => v.variation_option?.name)
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
 * Search movements by name or variation
 */
export async function searchMovements(query: string): Promise<ExerciseWithVariations[]> {
  const { data, error } = await supabase
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
    .ilike('name', `%${query}%`)
    .order('name')
    .limit(20);

  if (error) {
    console.error('Error searching movements:', error);
    throw error;
  }

  // Build full_name for search results
  const movements = (data || []).map((exercise) => {
    const variationNames = exercise.variations
      ?.map((v) => v.variation_option?.name)
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
    ?.map((v) => v.variation_option?.name)
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

/**
 * Create a new custom variation option
 * Returns the new variation option ID
 */
export async function createVariationOption(
  categoryId: string,
  name: string,
  description?: string
): Promise<string> {
  // Get the max display_order for this category
  const { data: maxOrder } = await supabase
    .from('variation_options')
    .select('display_order')
    .eq('category_id', categoryId)
    .order('display_order', { ascending: false })
    .limit(1)
    .single();

  const nextOrder = (maxOrder?.display_order || 0) + 1;

  const { data, error } = await supabase
    .from('variation_options')
    .insert({
      category_id: categoryId,
      name,
      description,
      display_order: nextOrder,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating variation option:', error);
    throw error;
  }

  return data.id;
}

/**
 * Create a new movement
 * Returns the created exercise ID
 */
export async function createMovement(input: CreateMovementInput): Promise<string> {
  try {
    // 1. Insert the exercise
    const { data: exercise, error: exerciseError } = await supabase
      .from('exercises')
      .insert({
        name: input.name,
        description: input.description,
        slug: input.name.toLowerCase().replace(/\s+/g, '-'),
        goal_type_id: input.goal_type_id,
        movement_category_id: input.movement_category_id,
        video_url: input.video_url,
        image_url: input.image_url,
        is_movement: true,
        is_official: false,
        created_by: input.created_by,
      })
      .select('id')
      .single();

    if (exerciseError) {
      console.error('Error creating exercise:', exerciseError);
      throw exerciseError;
    }

    // 2. Insert variation options (if any)
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

    // 3. Insert scoring types (if any)
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

    return exercise.id;
  } catch (error) {
    console.error('Error in createMovement:', error);
    throw error;
  }
}

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
        exercise:exercises(*)
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
        exercise:exercises(*)
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
        exercise:exercises(*),
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
        time_cap_minutes: input.time_cap_minutes,
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
        rx_reps: movement.rx_reps,
        rx_weight_lbs: movement.rx_weight_lbs,
        rx_movement_variation: movement.rx_movement_variation,
        l2_reps: movement.l2_reps,
        l2_weight_lbs: movement.l2_weight_lbs,
        l2_movement_variation: movement.l2_movement_variation,
        l1_reps: movement.l1_reps,
        l1_weight_lbs: movement.l1_weight_lbs,
        l1_movement_variation: movement.l1_movement_variation,
        notes: movement.notes,
      }));

      const { error: movementsError } = await supabase
        .from('wod_movements')
        .insert(movementsToInsert);

      if (movementsError) {
        console.error('Error creating WOD movements:', movementsError);
      }
    }

    return wod;
  } catch (error) {
    console.error('Error in createWOD:', error);
    return null;
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
            exercise:exercises(*)
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
        custom_content: part.custom_content,
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
    custom_content?: string | null;
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
        custom_content: part.custom_content,
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
    custom_content?: string | null;
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
