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

export type RepSchemeType = 'descending' | 'fixed_rounds' | 'chipper' | 'ascending' | 'distance' | 'custom';

export type SkillLevel = 'Beginner' | 'Intermediate' | 'Advanced';

export type MeasurementType = 'REPS' | 'TIME' | 'DISTANCE' | 'LOAD' | 'CALORIES' | 'QUALITY' | 'HEIGHT';

export type ScalingType = 'progression' | 'regression' | 'lateral';

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

// ============================================================================
// NEW REFERENCE TABLES (from migrations)
// ============================================================================

export interface MovementFamily {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  created_at: string;
}

export interface PlaneOfMotion {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  created_at: string;
}

export interface LoadPosition {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  created_at: string;
}

export interface Stance {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  created_at: string;
}

export interface RangeDepth {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  created_at: string;
}

export interface MovementStyle {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  created_at: string;
}

export interface Symmetry {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  created_at: string;
}

export interface MuscleRegion {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  created_at: string;
}

export interface ExerciseMuscleRegion {
  id: string;
  exercise_id: string;
  muscle_region_id: string;
  is_primary: boolean;
  created_at: string;
}

export interface MovementMeasurementProfile {
  id: string;
  exercise_id: string | null;
  variation_option_id: string | null;
  measurement_type: MeasurementType;
  unit_primary: string;
  unit_secondary: string | null;
  min_value: number | null;
  max_value: number | null;
  precision: number;
  is_default: boolean;
  created_at: string;
}

export interface ExerciseStandard {
  id: string;
  exercise_id: string | null;
  variation_option_id: string | null;

  // Range of Motion Standards
  rom_description: string | null;
  rom_start_position: string | null;
  rom_end_position: string | null;
  rom_key_checkpoints: string[] | null;

  // Setup and Execution
  setup_cues: string[] | null;
  execution_cues: string[] | null;
  breathing_pattern: string | null;

  // Standards and Faults
  common_faults: string[] | null;
  no_rep_conditions: string[] | null;
  judging_notes: string | null;

  // Competition Standards
  competition_standard: string | null;
  is_official_standard: boolean;

  // Metadata
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface MovementScalingLink {
  id: string;
  from_exercise_id: string;
  from_variation_option_id: string | null;
  to_exercise_id: string;
  to_variation_option_id: string | null;
  scaling_type: ScalingType;
  difficulty_delta: number | null;
  description: string | null;
  prerequisites: string[] | null;
  display_order: number | null;
  created_at: string;
  created_by: string | null;
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

  // NEW: Movement metadata (from Migration 2)
  movement_family_id: string | null;
  plane_of_motion_id: string | null;
  skill_level: SkillLevel | null;
  short_name: string | null;
  aliases: string[] | null;

  // Equipment metadata
  requires_weight: boolean;
  requires_distance: boolean;
  equipment_types: string[] | null;

  // Categorization
  category: string | null;
  muscle_groups: string[] | null; // DEPRECATED: Use exercise_muscle_regions junction table
  equipment: string[] | null; // DEPRECATED: Use equipment_types

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

  // NEW: Movement metadata overrides (from Migration 7)
  movement_family_id: string | null;
  plane_of_motion_id: string | null;
  load_position_id: string | null;
  stance_id: string | null;
  range_depth_id: string | null;
  movement_style_id: string | null;
  symmetry_id: string | null;
  skill_level: SkillLevel | null;
  short_name: string | null;
  aliases: string[] | null;
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

  // For Time specific fields
  rep_scheme_type: RepSchemeType | null;
  rep_scheme: string | null;

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

  // Rx scaling - Gender split for weights
  rx_reps: number | null;
  rx_weight_lbs: number | null; // DEPRECATED: Use gender-specific fields
  rx_weight_men_lbs: number | null;
  rx_weight_women_lbs: number | null;
  rx_distance: number | null; // DEPRECATED: Use rx_distance_value and rx_distance_unit
  rx_distance_value: number | null;
  rx_distance_unit: string | null;
  rx_time: number | null;
  rx_movement_variation: string | null;
  rx_alternative_exercise_id: string | null;
  rx_alternative_exercise_name: string | null;

  // L2 scaling - Gender split for weights
  l2_reps: number | null;
  l2_weight_lbs: number | null; // DEPRECATED: Use gender-specific fields
  l2_weight_men_lbs: number | null;
  l2_weight_women_lbs: number | null;
  l2_distance: number | null; // DEPRECATED: Use l2_distance_value and l2_distance_unit
  l2_distance_value: number | null;
  l2_distance_unit: string | null;
  l2_time: number | null;
  l2_movement_variation: string | null;
  l2_alternative_exercise_id: string | null;
  l2_alternative_exercise_name: string | null;

  // L1 scaling - Gender split for weights
  l1_reps: number | null;
  l1_weight_lbs: number | null; // DEPRECATED: Use gender-specific fields
  l1_weight_men_lbs: number | null;
  l1_weight_women_lbs: number | null;
  l1_distance: number | null; // DEPRECATED: Use l1_distance_value and l1_distance_unit
  l1_distance_value: number | null;
  l1_distance_unit: string | null;
  l1_time: number | null;
  l1_movement_variation: string | null;
  l1_alternative_exercise_id: string | null;
  l1_alternative_exercise_name: string | null;

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

// Extended Exercise type with all new metadata relations
export interface ExerciseWithDetails extends Exercise {
  // Existing relations
  variations?: (ExerciseVariation & {
    variation_option?: VariationOption & {
      category?: VariationCategory;
    };
  })[];
  goal_type?: GoalType;
  movement_category?: MovementCategory;
  scoring_types?: ScoringType[];

  // NEW: Movement metadata relations
  movement_family?: MovementFamily;
  plane_of_motion?: PlaneOfMotion;

  // NEW: Muscle targeting (normalized)
  muscle_regions?: (ExerciseMuscleRegion & {
    muscle_region?: MuscleRegion;
  })[];

  // NEW: Measurement profiles
  measurement_profiles?: MovementMeasurementProfile[];

  // NEW: Standards
  standards?: ExerciseStandard[];

  // NEW: Progressions and regressions
  progressions?: (MovementScalingLink & {
    to_exercise?: Exercise;
  })[];
  regressions?: (MovementScalingLink & {
    to_exercise?: Exercise;
  })[];
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

  // For Time specific fields
  rep_scheme_type?: RepSchemeType;
  rep_scheme?: string;

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

  // Rx scaling - Gender split for weights
  rx_reps?: number;
  rx_weight_men_lbs?: number;
  rx_weight_women_lbs?: number;
  rx_distance?: number;
  rx_distance_value?: number;
  rx_distance_unit?: string;
  rx_time?: number;
  rx_movement_variation?: string;
  rx_alternative_exercise_id?: string;
  rx_alternative_exercise_name?: string;

  // L2 scaling - Gender split for weights
  l2_reps?: number;
  l2_weight_men_lbs?: number;
  l2_weight_women_lbs?: number;
  l2_distance?: number;
  l2_distance_value?: number;
  l2_distance_unit?: string;
  l2_time?: number;
  l2_movement_variation?: string;
  l2_alternative_exercise_id?: string;
  l2_alternative_exercise_name?: string;

  // L1 scaling - Gender split for weights
  l1_reps?: number;
  l1_weight_men_lbs?: number;
  l1_weight_women_lbs?: number;
  l1_distance?: number;
  l1_distance_value?: number;
  l1_distance_unit?: string;
  l1_time?: number;
  l1_movement_variation?: string;
  l1_alternative_exercise_id?: string;
  l1_alternative_exercise_name?: string;

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

  // NEW: Core movement metadata
  movement_family_id?: string;
  plane_of_motion_id?: string;
  skill_level?: SkillLevel;
  short_name?: string;
  aliases?: string[];

  // NEW: Movement attributes
  load_position_id?: string;
  stance_id?: string;
  range_depth_id?: string;
  movement_style_id?: string;
  symmetry_id?: string;

  // Media
  video_url?: string;
  image_url?: string;

  // Ownership
  is_movement: true;
  is_official: false;
  created_by: string;

  // Relations
  variation_option_ids?: string[];
  scoring_type_ids?: string[];
  muscle_region_ids?: string[];
  primary_muscle_region_ids?: string[];
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
