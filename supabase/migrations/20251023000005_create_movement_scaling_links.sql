-- Migration: Create Movement Scaling Links Table
-- Description: Implements progression/regression system for movements
-- Links movements together in scaling chains (e.g., Pike Walk → Wall Walk → Handstand Walk)

-- ============================================================================
-- 1. CREATE MOVEMENT_SCALING_LINKS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS movement_scaling_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source movement (the movement being scaled from)
  from_exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  from_variation_option_id UUID REFERENCES variation_options(id) ON DELETE CASCADE,

  -- Target movement (the progression or regression)
  to_exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  to_variation_option_id UUID REFERENCES variation_options(id) ON DELETE CASCADE,

  -- Scaling relationship
  scaling_type TEXT NOT NULL CHECK (scaling_type IN ('progression', 'regression', 'lateral')),
  difficulty_delta INTEGER, -- Relative difficulty change (-3 = much easier, 0 = similar, +3 = much harder)

  -- Metadata
  description TEXT, -- Why this is a good progression/regression
  prerequisites TEXT[], -- Skills/movements that should be mastered first
  display_order INTEGER, -- Order in progression chain

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Prevent duplicate links
  UNIQUE(from_exercise_id, from_variation_option_id, to_exercise_id, to_variation_option_id, scaling_type),

  -- Prevent self-referential links
  CHECK (from_exercise_id != to_exercise_id OR from_variation_option_id IS DISTINCT FROM to_variation_option_id)
);

CREATE INDEX idx_scaling_links_from_exercise ON movement_scaling_links(from_exercise_id);
CREATE INDEX idx_scaling_links_to_exercise ON movement_scaling_links(to_exercise_id);
CREATE INDEX idx_scaling_links_from_variation ON movement_scaling_links(from_variation_option_id);
CREATE INDEX idx_scaling_links_to_variation ON movement_scaling_links(to_variation_option_id);
CREATE INDEX idx_scaling_links_type ON movement_scaling_links(scaling_type);
CREATE INDEX idx_scaling_links_difficulty ON movement_scaling_links(difficulty_delta);

-- ============================================================================
-- 2. ADD COMMON PROGRESSION CHAINS
-- ============================================================================

-- Handstand Progressions: Pike Walk → Wall Walk → Handstand Walk
DO $$
DECLARE
  pike_walk_id UUID;
  wall_walk_id UUID;
  handstand_walk_id UUID;
BEGIN
  -- Get exercise IDs
  SELECT id INTO pike_walk_id FROM exercises WHERE name ILIKE '%pike%walk%' LIMIT 1;
  SELECT id INTO wall_walk_id FROM exercises WHERE name ILIKE '%wall%walk%' LIMIT 1;
  SELECT id INTO handstand_walk_id FROM exercises WHERE name ILIKE '%handstand%walk%' LIMIT 1;

  -- Pike Walk → Wall Walk (progression)
  IF pike_walk_id IS NOT NULL AND wall_walk_id IS NOT NULL THEN
    INSERT INTO movement_scaling_links (
      from_exercise_id, to_exercise_id, scaling_type, difficulty_delta,
      description, display_order
    )
    VALUES (
      pike_walk_id, wall_walk_id, 'progression', 1,
      'Wall walks build shoulder strength and body awareness for inverted positions',
      1
    )
    ON CONFLICT DO NOTHING;

    -- Reverse regression
    INSERT INTO movement_scaling_links (
      from_exercise_id, to_exercise_id, scaling_type, difficulty_delta,
      description, display_order
    )
    VALUES (
      wall_walk_id, pike_walk_id, 'regression', -1,
      'Pike walks are a simpler inversion movement for building shoulder awareness',
      1
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Wall Walk → Handstand Walk (progression)
  IF wall_walk_id IS NOT NULL AND handstand_walk_id IS NOT NULL THEN
    INSERT INTO movement_scaling_links (
      from_exercise_id, to_exercise_id, scaling_type, difficulty_delta,
      description, prerequisites, display_order
    )
    VALUES (
      wall_walk_id, handstand_walk_id, 'progression', 2,
      'Handstand walks require balance and strength from wall walks plus freestanding handstand holds',
      ARRAY['60-second handstand hold', 'Wall walk proficiency'],
      2
    )
    ON CONFLICT DO NOTHING;

    -- Reverse regression
    INSERT INTO movement_scaling_links (
      from_exercise_id, to_exercise_id, scaling_type, difficulty_delta,
      description, display_order
    )
    VALUES (
      handstand_walk_id, wall_walk_id, 'regression', -2,
      'Wall walks provide support and are more accessible than freestanding handstand walks',
      1
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Pull-up Progressions: Ring Row → Jumping Pull-up → Banded Pull-up → Strict Pull-up → Chest-to-Bar → Weighted Pull-up
DO $$
DECLARE
  ring_row_id UUID;
  jumping_pullup_id UUID;
  banded_pullup_id UUID;
  strict_pullup_id UUID;
  ctb_id UUID;
BEGIN
  SELECT id INTO ring_row_id FROM exercises WHERE name ILIKE '%ring%row%' LIMIT 1;
  SELECT id INTO jumping_pullup_id FROM exercises WHERE name ILIKE '%jumping%pull%' LIMIT 1;
  SELECT id INTO banded_pullup_id FROM exercises WHERE name ILIKE '%banded%pull%' LIMIT 1;
  SELECT id INTO strict_pullup_id FROM exercises WHERE name = 'Strict Pull-up' OR (name ILIKE '%pull%up%' AND name ILIKE '%strict%') LIMIT 1;
  SELECT id INTO ctb_id FROM exercises WHERE name ILIKE '%chest%to%bar%' LIMIT 1;

  -- Ring Row → Jumping Pull-up
  IF ring_row_id IS NOT NULL AND jumping_pullup_id IS NOT NULL THEN
    INSERT INTO movement_scaling_links (
      from_exercise_id, to_exercise_id, scaling_type, difficulty_delta,
      description, display_order
    )
    VALUES (
      ring_row_id, jumping_pullup_id, 'progression', 1,
      'Jumping pull-ups introduce the vertical pulling pattern with assistance',
      1
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Jumping Pull-up → Banded Pull-up
  IF jumping_pullup_id IS NOT NULL AND banded_pullup_id IS NOT NULL THEN
    INSERT INTO movement_scaling_links (
      from_exercise_id, to_exercise_id, scaling_type, difficulty_delta,
      description, display_order
    )
    VALUES (
      jumping_pullup_id, banded_pullup_id, 'progression', 1,
      'Bands provide consistent assistance throughout the range of motion',
      2
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Banded Pull-up → Strict Pull-up
  IF banded_pullup_id IS NOT NULL AND strict_pullup_id IS NOT NULL THEN
    INSERT INTO movement_scaling_links (
      from_exercise_id, to_exercise_id, scaling_type, difficulty_delta,
      description, prerequisites, display_order
    )
    VALUES (
      banded_pullup_id, strict_pullup_id, 'progression', 2,
      'Strict pull-ups require full bodyweight control without assistance',
      ARRAY['5+ banded pull-ups with light band', 'Negative pull-ups'],
      3
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Strict Pull-up → Chest-to-Bar
  IF strict_pullup_id IS NOT NULL AND ctb_id IS NOT NULL THEN
    INSERT INTO movement_scaling_links (
      from_exercise_id, to_exercise_id, scaling_type, difficulty_delta,
      description, prerequisites, display_order
    )
    VALUES (
      strict_pullup_id, ctb_id, 'progression', 1,
      'Chest-to-bar requires greater pulling strength and range of motion',
      ARRAY['10+ strict pull-ups'],
      4
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Squat Progressions: Air Squat → Goblet Squat → Front Squat → Back Squat
DO $$
DECLARE
  air_squat_id UUID;
  goblet_squat_id UUID;
  front_squat_id UUID;
  back_squat_id UUID;
BEGIN
  SELECT id INTO air_squat_id FROM exercises WHERE name = 'Air Squat' LIMIT 1;
  SELECT id INTO goblet_squat_id FROM exercises WHERE name ILIKE '%goblet%squat%' LIMIT 1;
  SELECT id INTO front_squat_id FROM exercises WHERE name = 'Front Squat' LIMIT 1;
  SELECT id INTO back_squat_id FROM exercises WHERE name = 'Back Squat' LIMIT 1;

  -- Air Squat → Goblet Squat
  IF air_squat_id IS NOT NULL AND goblet_squat_id IS NOT NULL THEN
    INSERT INTO movement_scaling_links (
      from_exercise_id, to_exercise_id, scaling_type, difficulty_delta,
      description, display_order
    )
    VALUES (
      air_squat_id, goblet_squat_id, 'progression', 1,
      'Goblet squats add external load while maintaining upright torso position',
      1
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Goblet Squat → Front Squat
  IF goblet_squat_id IS NOT NULL AND front_squat_id IS NOT NULL THEN
    INSERT INTO movement_scaling_links (
      from_exercise_id, to_exercise_id, scaling_type, difficulty_delta,
      description, prerequisites, display_order
    )
    VALUES (
      goblet_squat_id, front_squat_id, 'progression', 1,
      'Front squats increase load capacity and require better front rack mobility',
      ARRAY['Comfortable front rack position', 'Air squat proficiency'],
      2
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Front Squat → Back Squat (lateral - not necessarily harder, just different)
  IF front_squat_id IS NOT NULL AND back_squat_id IS NOT NULL THEN
    INSERT INTO movement_scaling_links (
      from_exercise_id, to_exercise_id, scaling_type, difficulty_delta,
      description, display_order
    )
    VALUES (
      front_squat_id, back_squat_id, 'lateral', 0,
      'Back squats allow heavier loads but require less thoracic mobility',
      3
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Air Squat → Front Squat (direct progression)
  IF air_squat_id IS NOT NULL AND front_squat_id IS NOT NULL THEN
    INSERT INTO movement_scaling_links (
      from_exercise_id, to_exercise_id, scaling_type, difficulty_delta,
      description, display_order
    )
    VALUES (
      air_squat_id, front_squat_id, 'progression', 2,
      'Front squats add barbell loading to the squat pattern',
      4
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Push-up Progressions: Elevated Push-up → Regular Push-up → Ring Push-up → Deficit Push-up
DO $$
DECLARE
  elevated_id UUID;
  regular_id UUID;
  ring_id UUID;
  deficit_id UUID;
BEGIN
  SELECT id INTO elevated_id FROM exercises WHERE name ILIKE '%elevated%push%up%' OR name ILIKE '%incline%push%up%' LIMIT 1;
  SELECT id INTO regular_id FROM exercises WHERE name = 'Push-up' LIMIT 1;
  SELECT id INTO ring_id FROM exercises WHERE name ILIKE '%ring%push%up%' LIMIT 1;
  SELECT id INTO deficit_id FROM exercises WHERE name ILIKE '%deficit%push%up%' LIMIT 1;

  -- Elevated → Regular
  IF elevated_id IS NOT NULL AND regular_id IS NOT NULL THEN
    INSERT INTO movement_scaling_links (
      from_exercise_id, to_exercise_id, scaling_type, difficulty_delta,
      description, display_order
    )
    VALUES (
      elevated_id, regular_id, 'progression', 1,
      'Regular push-ups require more strength with hands at same level as feet',
      1
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Regular → Ring Push-up
  IF regular_id IS NOT NULL AND ring_id IS NOT NULL THEN
    INSERT INTO movement_scaling_links (
      from_exercise_id, to_exercise_id, scaling_type, difficulty_delta,
      description, prerequisites, display_order
    )
    VALUES (
      regular_id, ring_id, 'progression', 2,
      'Ring push-ups add instability requiring greater shoulder stabilization',
      ARRAY['15+ strict push-ups', 'Ring support hold'],
      2
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Regular → Deficit Push-up
  IF regular_id IS NOT NULL AND deficit_id IS NOT NULL THEN
    INSERT INTO movement_scaling_links (
      from_exercise_id, to_exercise_id, scaling_type, difficulty_delta,
      description, display_order
    )
    VALUES (
      regular_id, deficit_id, 'progression', 1,
      'Deficit push-ups increase range of motion and strength demand',
      3
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- 3. ADD COMMENTS
-- ============================================================================

COMMENT ON TABLE movement_scaling_links IS 'Links movements in progression/regression/lateral scaling chains';
COMMENT ON COLUMN movement_scaling_links.from_exercise_id IS 'Source movement in the scaling relationship';
COMMENT ON COLUMN movement_scaling_links.from_variation_option_id IS 'Optional: specific variation of source movement';
COMMENT ON COLUMN movement_scaling_links.to_exercise_id IS 'Target movement (progression, regression, or lateral alternative)';
COMMENT ON COLUMN movement_scaling_links.to_variation_option_id IS 'Optional: specific variation of target movement';
COMMENT ON COLUMN movement_scaling_links.scaling_type IS 'Type of relationship: progression (harder), regression (easier), or lateral (similar difficulty)';
COMMENT ON COLUMN movement_scaling_links.difficulty_delta IS 'Relative difficulty change: negative = easier, 0 = similar, positive = harder';
COMMENT ON COLUMN movement_scaling_links.description IS 'Why this is a good progression/regression/alternative';
COMMENT ON COLUMN movement_scaling_links.prerequisites IS 'Skills or movements that should be mastered before attempting the target movement';
COMMENT ON COLUMN movement_scaling_links.display_order IS 'Order in the progression chain for UI display';
