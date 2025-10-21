// CrossFit System Types
// Generated from Supabase schema

// ============================================================================
// REFERENCE TYPES
// ============================================================================

export type GoalTypeName =
  | 'MetCon'
  | 'Strength'
  | 'Skill'
  | 'Mobility'
  | 'Stretching'
  | 'Recovery'
  | 'Cool-Down';

export type ScalingLevel = 'Rx' | 'L2' | 'L1';

export type WODFormatName = 'AMRAP' | 'EMOM' | 'For Time' | 'Chipper' | 'Tabata';

export type WODCategoryName = 'All' | 'Daily WOD' | 'Heroes' | 'The Girls';

export type ClassPartType = 'WOD' | 'Strength' | 'Skill' | 'Warm-up' | 'Cool-down' | 'Accessory';

export type VariationCategoryName = 'Position' | 'Stance' | 'Equipment' | 'Style';

export type MovementCategoryName = 'Weightlifting' | 'Gymnastics' | 'Monostructural' | 'Recovery';

export type ScoringTypeName = 'Reps' | 'Rounds' | 'Weight' | 'Time' | 'Distance' | 'Calories' | 'Height' | 'None';

// ============================================================================
// DATABASE TABLE TYPES
// ============================================================================

export interface GoalType {
  id: string;
  name: GoalTypeName;
  description: string | null;
  display_order: number;
  created_at: string;
}

export interface MovementCategory {
  id: string;
  name: MovementCategoryName;
  description: string | null;
  display_order: number;
  created_at: string;
}

export interface ScoringType {
  id: string;
  name: ScoringTypeName;
  description: string | null;
  display_order: number;
  created_at: string;
}

export interface ExerciseScoringType {
  id: string;
  exercise_id: string;
  scoring_type_id: string;
  created_at: string;
}

export interface Exercise {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  full_name: string | null;
  slug: string;
  description: string | null;

  // CrossFit-specific
  is_movement: boolean;
  goal_type_id: string | null;
  movement_category_id: string | null;

  // Categorization
  category: string | null;
  muscle_groups: string[] | null;
  equipment: string[] | null;

  // Media
  demo_video_url: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  image_url: string | null;

  // Instructions
  setup_instructions: string | null;
  execution_cues: string[] | null;
  common_mistakes: string[] | null;

  // Ownership (hybrid approach)
  is_official: boolean;
  created_by: string | null;
}

export interface VariationCategory {
  id: string;
  name: VariationCategoryName;
  description: string | null;
  display_order: number;
  created_at: string;
}

export interface VariationOption {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  display_order: number;
  created_at: string;
}

export interface ExerciseVariation {
  id: string;
  exercise_id: string;
  variation_option_id: string;
  created_at: string;
}

export interface WODFormat {
  id: string;
  name: WODFormatName;
  description: string | null;
  created_at: string;
}

export interface WODCategory {
  id: string;
  name: WODCategoryName;
  description: string | null;
  display_order: number;
  created_at: string;
}

export interface WOD {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;

  // Basic info
  name: string;
  description: string | null;

  // WOD structure
  format_id: string;
  category_id: string;
  time_cap_minutes: number | null;

  // Score types (can have multiple)
  score_type_time: boolean;
  score_type_rounds: boolean;
  score_type_reps: boolean;
  score_type_load: boolean;
  score_type_distance: boolean;
  score_type_calories: boolean;

  // Notes
  notes: string | null;
}

export interface WODScalingLevel {
  id: string;
  wod_id: string;
  level_name: ScalingLevel;
  description: string | null;
  created_at: string;
}

export interface WODMovement {
  id: string;
  wod_id: string;
  exercise_id: string;
  movement_order: number;

  // Scaling options per movement
  rx_reps: number | null;
  rx_weight_lbs: number | null;
  rx_distance: number | null;
  rx_time: number | null;
  rx_movement_variation: string | null;

  l2_reps: number | null;
  l2_weight_lbs: number | null;
  l2_distance: number | null;
  l2_time: number | null;
  l2_movement_variation: string | null;

  l1_reps: number | null;
  l1_weight_lbs: number | null;
  l1_distance: number | null;
  l1_time: number | null;
  l1_movement_variation: string | null;

  // Notes
  notes: string | null;
  created_at: string;
}

export interface MovementStandard {
  id: string;
  wod_movement_id: string;
  scaling_level: ScalingLevel;
  standard_name: string; // e.g., "strict", "kipping", "touch-and-go"
  is_active: boolean;
  created_at: string;
}

export interface Class {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;

  // Class info
  class_date: string; // ISO date string
  name: string;
  duration_minutes: number;

  // Notes
  notes: string | null;
}

export interface ClassPart {
  id: string;
  class_id: string;
  part_order: number;

  // Part type
  part_type: ClassPartType;
  part_name: string | null;

  // Link to WOD template (if applicable)
  wod_id: string | null;

  // OR custom content
  custom_description: string | null;
  duration_minutes: number | null;

  created_at: string;
}

// ============================================================================
// EXTENDED TYPES WITH RELATIONS (for UI components)
// ============================================================================

export interface ExerciseWithVariations extends Exercise {
  variations?: (ExerciseVariation & {
    variation_option?: VariationOption & {
      category?: VariationCategory;
    };
  })[];
  goal_type?: GoalType;
  movement_category?: MovementCategory;
  scoring_types?: ScoringType[];
}

export interface WODMovementWithDetails extends WODMovement {
  exercise?: Exercise;
  standards?: MovementStandard[];
}

export interface WODWithDetails extends WOD {
  format?: WODFormat;
  category?: WODCategory;
  movements?: WODMovementWithDetails[];
  scaling_levels?: WODScalingLevel[];
}

export interface ClassPartWithDetails extends ClassPart {
  wod?: WODWithDetails;
}

export interface ClassWithDetails extends Class {
  parts?: ClassPartWithDetails[];
}

// ============================================================================
// HELPER TYPES FOR FORMS
// ============================================================================

export interface CreateWODInput {
  name: string;
  description?: string;
  format_id: string;
  category_id: string;
  time_cap_minutes?: number;
  score_type_time?: boolean;
  score_type_rounds?: boolean;
  score_type_reps?: boolean;
  score_type_load?: boolean;
  score_type_distance?: boolean;
  score_type_calories?: boolean;
  notes?: string;
  scaling_levels?: { level: string; description?: string }[];
  movements?: CreateWODMovementInput[];
}

export interface CreateWODMovementInput {
  exercise_id: string;
  movement_order: number;
  rx_reps?: number;
  rx_weight_lbs?: number;
  rx_distance?: number;
  rx_time?: number;
  rx_movement_variation?: string;
  l2_reps?: number;
  l2_weight_lbs?: number;
  l2_distance?: number;
  l2_time?: number;
  l2_movement_variation?: string;
  l1_reps?: number;
  l1_weight_lbs?: number;
  l1_distance?: number;
  l1_time?: number;
  l1_movement_variation?: string;
  notes?: string;
}

export interface CreateClassInput {
  class_date: string;
  name: string;
  duration_minutes?: number;
  notes?: string;
}

export interface CreateClassPartInput {
  part_order: number;
  part_type: ClassPartType;
  part_name?: string;
  wod_id?: string;
  custom_description?: string;
  duration_minutes?: number;
}

export interface CreateExerciseInput {
  name: string;
  description?: string;
  is_movement?: boolean;
  goal_type_id?: string;
  category?: string;
  muscle_groups?: string[];
  equipment?: string[];
  demo_video_url?: string;
  thumbnail_url?: string;
  setup_instructions?: string;
  execution_cues?: string[];
  common_mistakes?: string[];
}

export interface CreateMovementInput {
  name: string;
  full_name?: string;
  description?: string;
  goal_type_id: string;
  movement_category_id: string;
  video_url?: string;
  image_url?: string;
  is_movement: true;
  is_official: false;
  created_by: string;
  variation_option_ids?: string[];
  scoring_type_ids?: string[];
}

export interface VariationOptionWithCategory extends VariationOption {
  category: VariationCategory;
}

// ============================================================================
// UI DISPLAY HELPERS
// ============================================================================

export interface MovementFilter {
  category: 'All' | 'Oly lifts' | 'Gymnastics' | 'Cardio';
  searchQuery: string;
}

export interface WODFilter {
  category: WODCategoryName;
  searchQuery: string;
}

export interface ClassListItem {
  id: string;
  class_date: string;
  name: string;
  wod_preview: string; // e.g., "12-min For Time → 6-min EMOM"
}

// Helper function type for building variation names
export type BuildVariationName = (
  coreMovement: string,
  variations: VariationOption[]
) => string;
