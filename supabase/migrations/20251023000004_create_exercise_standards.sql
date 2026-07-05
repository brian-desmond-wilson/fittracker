-- Migration: Create Exercise Standards Table
-- Description: Comprehensive movement standards for ROM, setup, execution, faults, and judging
-- Refactors and extends the existing movement_standards table

-- ============================================================================
-- 1. CREATE EXERCISE_STANDARDS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS exercise_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID REFERENCES exercises(id) ON DELETE CASCADE,
  variation_option_id UUID REFERENCES variation_options(id) ON DELETE CASCADE,

  -- Range of Motion Standards
  rom_description TEXT,
  rom_start_position TEXT,
  rom_end_position TEXT,
  rom_key_checkpoints TEXT[],

  -- Setup and Execution
  setup_cues TEXT[],
  execution_cues TEXT[],
  breathing_pattern TEXT,

  -- Standards and Faults
  common_faults TEXT[],
  no_rep_conditions TEXT[],
  judging_notes TEXT,

  -- Competition Standards
  competition_standard TEXT, -- Official CrossFit competition standard if applicable
  is_official_standard BOOLEAN DEFAULT FALSE,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  UNIQUE(exercise_id, variation_option_id),
  CHECK (exercise_id IS NOT NULL OR variation_option_id IS NOT NULL)
);

CREATE INDEX idx_exercise_standards_exercise ON exercise_standards(exercise_id);
CREATE INDEX idx_exercise_standards_variation ON exercise_standards(variation_option_id);
CREATE INDEX idx_exercise_standards_official ON exercise_standards(is_official_standard);
CREATE INDEX idx_exercise_standards_created_by ON exercise_standards(created_by);

-- ============================================================================
-- 2. MIGRATE DATA FROM EXISTING MOVEMENT_STANDARDS TABLE
-- ============================================================================

-- Skip migration from old movement_standards table as it has a different structure
-- Old table is WOD-specific, new table is exercise-specific

-- ============================================================================
-- 3. ADD DEFAULT STANDARDS FOR OFFICIAL MOVEMENTS
-- ============================================================================

-- Air Squat
INSERT INTO exercise_standards (
  exercise_id,
  rom_description,
  rom_start_position,
  rom_end_position,
  rom_key_checkpoints,
  setup_cues,
  execution_cues,
  common_faults,
  no_rep_conditions,
  is_official_standard
)
SELECT
  e.id,
  'Full depth squat with hips descending below parallel (hip crease below top of knee)',
  'Standing upright with feet shoulder-width apart, toes slightly out',
  'Bottom position with hip crease below knee, then return to full standing extension',
  ARRAY['Hips below parallel', 'Full hip and knee extension at top', 'Weight in heels'],
  ARRAY['Feet shoulder-width apart', 'Toes slightly out', 'Chest up', 'Core engaged'],
  ARRAY['Break at hips and knees simultaneously', 'Knees track over toes', 'Keep chest up', 'Drive through heels'],
  ARRAY['Knees caving in', 'Heels lifting', 'Forward torso lean', 'Incomplete hip extension'],
  ARRAY['Hip crease not below parallel', 'Incomplete hip/knee extension at top'],
  TRUE
FROM exercises e
WHERE e.name = 'Air Squat'
ON CONFLICT (exercise_id, variation_option_id) DO NOTHING;

-- Pull-up (Strict)
INSERT INTO exercise_standards (
  exercise_id,
  rom_description,
  rom_start_position,
  rom_end_position,
  rom_key_checkpoints,
  setup_cues,
  execution_cues,
  common_faults,
  no_rep_conditions,
  is_official_standard
)
SELECT
  e.id,
  'Strict pull-up from full hang to chin over bar',
  'Full arm extension at bottom (dead hang)',
  'Chin clearly over the bar at top',
  ARRAY['Full arm extension at bottom', 'Chin over bar at top', 'No kipping or swinging'],
  ARRAY['Grip slightly wider than shoulders', 'Arms fully extended', 'Engage shoulders (depress scapula)'],
  ARRAY['Pull chest to bar', 'Keep core tight', 'Avoid excessive swing', 'Control descent'],
  ARRAY['Insufficient ROM at top', 'Not reaching full extension at bottom', 'Excessive kipping'],
  ARRAY['Chin not over bar', 'Arms not fully extended at bottom', 'Kipping in strict pull-ups'],
  TRUE
FROM exercises e
WHERE e.name ILIKE '%pull%up%' AND e.name ILIKE '%strict%'
ON CONFLICT (exercise_id, variation_option_id) DO NOTHING;

-- Push-up
INSERT INTO exercise_standards (
  exercise_id,
  rom_description,
  rom_start_position,
  rom_end_position,
  rom_key_checkpoints,
  setup_cues,
  execution_cues,
  common_faults,
  no_rep_conditions,
  is_official_standard
)
SELECT
  e.id,
  'Chest and thighs touch ground simultaneously, then push to full arm extension',
  'Plank position with hands under shoulders, body in straight line',
  'Arms fully extended at top with body in straight line',
  ARRAY['Chest and thighs touch ground together', 'Full arm extension at top', 'Neutral spine throughout'],
  ARRAY['Hands under shoulders', 'Body in straight line', 'Core engaged', 'Feet together'],
  ARRAY['Lower with control', 'Chest and thighs touch simultaneously', 'Push through full ROM', 'Maintain rigid torso'],
  ARRAY['Sagging hips', 'Piking hips up', 'Incomplete ROM', 'Head dropping'],
  ARRAY['Chest or thighs not touching ground', 'Arms not fully extended at top', 'Broken body line (sagging/piking)'],
  TRUE
FROM exercises e
WHERE e.name = 'Push-up'
ON CONFLICT (exercise_id, variation_option_id) DO NOTHING;

-- Deadlift
INSERT INTO exercise_standards (
  exercise_id,
  rom_description,
  rom_start_position,
  rom_end_position,
  rom_key_checkpoints,
  setup_cues,
  execution_cues,
  common_faults,
  no_rep_conditions,
  is_official_standard
)
SELECT
  e.id,
  'Lift barbell from ground to full standing position with hips and knees fully extended',
  'Barbell on ground, hands gripping bar, shoulders over bar, back flat',
  'Standing upright with full hip and knee extension, shoulders back',
  ARRAY['Flat back throughout', 'Full hip and knee extension at top', 'Controlled descent'],
  ARRAY['Feet hip-width apart', 'Grip outside knees', 'Shoulders over bar', 'Flat back', 'Chest up'],
  ARRAY['Drive through heels', 'Keep bar close to body', 'Extend hips and knees together', 'Lock out at top'],
  ARRAY['Rounded back', 'Bar drifting away from body', 'Incomplete hip extension', 'Dropping bar'],
  ARRAY['Incomplete hip/knee extension at top', 'Rounded back during lift'],
  TRUE
FROM exercises e
WHERE e.name = 'Deadlift'
ON CONFLICT (exercise_id, variation_option_id) DO NOTHING;

-- Box Jump
INSERT INTO exercise_standards (
  exercise_id,
  rom_description,
  rom_start_position,
  rom_end_position,
  rom_key_checkpoints,
  setup_cues,
  execution_cues,
  common_faults,
  no_rep_conditions,
  is_official_standard
)
SELECT
  e.id,
  'Jump from ground to box, achieving full hip and knee extension on top of box',
  'Standing facing box at appropriate distance',
  'Standing on top of box with full hip and knee extension',
  ARRAY['Full hip and knee extension on box', 'Both feet on box', 'Controlled landing'],
  ARRAY['Start 6-12 inches from box', 'Athletic stance', 'Arms ready to swing'],
  ARRAY['Swing arms back', 'Explosive jump', 'Land softly with both feet', 'Stand to full extension'],
  ARRAY['Incomplete extension on box', 'Stepping down instead of jumping', 'Landing with one foot first'],
  ARRAY['Hips and knees not fully extended on top of box', 'Jumping off box instead of stepping down'],
  TRUE
FROM exercises e
WHERE e.name ILIKE '%box jump%'
ON CONFLICT (exercise_id, variation_option_id) DO NOTHING;

-- Wall Ball
INSERT INTO exercise_standards (
  exercise_id,
  rom_description,
  rom_start_position,
  rom_end_position,
  rom_key_checkpoints,
  setup_cues,
  execution_cues,
  common_faults,
  no_rep_conditions,
  judging_notes,
  is_official_standard
)
SELECT
  e.id,
  'Squat to full depth with med ball, then throw ball to hit target at specified height',
  'Standing with med ball in front rack position',
  'Ball hits target, athlete catches ball in front rack and repeats',
  ARRAY['Full depth squat (hip crease below knee)', 'Ball hits target', 'Continuous movement'],
  ARRAY['Hold ball in front rack', 'Elbows under ball', 'Feet shoulder-width', 'Face target'],
  ARRAY['Descend to full depth', 'Drive through heels', 'Throw ball to target', 'Catch and repeat'],
  ARRAY['Insufficient squat depth', 'Ball missing target', 'Pressing ball instead of throwing'],
  ARRAY['Hip crease not below parallel in squat', 'Ball does not hit target height/area'],
  'Rep counts when ball hits target. Must re-throw if ball misses target.',
  TRUE
FROM exercises e
WHERE e.name ILIKE '%wall ball%'
ON CONFLICT (exercise_id, variation_option_id) DO NOTHING;

-- Toes-to-Bar
INSERT INTO exercise_standards (
  exercise_id,
  rom_description,
  rom_start_position,
  rom_end_position,
  rom_key_checkpoints,
  setup_cues,
  execution_cues,
  common_faults,
  no_rep_conditions,
  is_official_standard
)
SELECT
  e.id,
  'From full hang, bring both feet up to touch bar between hands',
  'Full arm extension hanging from bar',
  'Both feet simultaneously touch bar between hands, then return to full hang',
  ARRAY['Full arm extension at start', 'Both feet touch bar together', 'Contact between hands', 'Return to full extension'],
  ARRAY['Grip shoulder-width or slightly wider', 'Start in full hang', 'Engage shoulders'],
  ARRAY['Kip or strict', 'Bring feet to bar between hands', 'Both feet touch simultaneously', 'Control descent'],
  ARRAY['Feet not touching bar', 'Feet touching outside hands', 'Not returning to full extension'],
  ARRAY['Both feet must make contact with bar simultaneously', 'Contact must be between hands', 'Must return to full arm extension'],
  TRUE
FROM exercises e
WHERE e.name ILIKE '%toes%to%bar%'
ON CONFLICT (exercise_id, variation_option_id) DO NOTHING;

-- ============================================================================
-- 4. CREATE TRIGGER FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_exercise_standards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exercise_standards_updated_at
  BEFORE UPDATE ON exercise_standards
  FOR EACH ROW
  EXECUTE FUNCTION update_exercise_standards_updated_at();

-- ============================================================================
-- 5. ADD COMMENTS
-- ============================================================================

COMMENT ON TABLE exercise_standards IS 'Comprehensive movement standards including ROM, setup, execution, faults, and judging criteria';
COMMENT ON COLUMN exercise_standards.rom_description IS 'Overall description of required range of motion';
COMMENT ON COLUMN exercise_standards.rom_start_position IS 'Description of proper starting position';
COMMENT ON COLUMN exercise_standards.rom_end_position IS 'Description of proper ending/completion position';
COMMENT ON COLUMN exercise_standards.rom_key_checkpoints IS 'Array of key ROM checkpoints that must be achieved';
COMMENT ON COLUMN exercise_standards.setup_cues IS 'Array of setup and positioning cues';
COMMENT ON COLUMN exercise_standards.execution_cues IS 'Array of cues for proper movement execution';
COMMENT ON COLUMN exercise_standards.breathing_pattern IS 'Recommended breathing pattern for the movement';
COMMENT ON COLUMN exercise_standards.common_faults IS 'Array of common movement faults to watch for';
COMMENT ON COLUMN exercise_standards.no_rep_conditions IS 'Array of conditions that result in no-rep (rep does not count)';
COMMENT ON COLUMN exercise_standards.judging_notes IS 'Additional notes for judging in competition context';
COMMENT ON COLUMN exercise_standards.competition_standard IS 'Official competition standard reference (e.g., CrossFit Games rulebook)';
COMMENT ON COLUMN exercise_standards.is_official_standard IS 'True if this follows official CrossFit/competition standards';
