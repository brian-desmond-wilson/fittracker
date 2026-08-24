-- Migration: Create Muscle Regions Normalization System
-- Description: Creates muscle_regions reference table and exercise_muscle_regions junction table
-- Migrates data from exercises.muscle_groups[] array to normalized structure

-- ============================================================================
-- 1. CREATE MUSCLE_REGIONS REFERENCE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS muscle_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed muscle regions (20 common regions + compound groups)
INSERT INTO muscle_regions (name, description, display_order) VALUES
  ('Quads', 'Quadriceps (front thigh)', 1),
  ('Hamstrings', 'Hamstrings (back thigh)', 2),
  ('Glutes', 'Gluteus maximus, medius, minimus', 3),
  ('Calves', 'Gastrocnemius and soleus', 4),
  ('Hip Flexors', 'Iliopsoas and rectus femoris', 5),
  ('Chest', 'Pectoralis major and minor', 6),
  ('Back', 'Latissimus dorsi, rhomboids, traps', 7),
  ('Shoulders', 'Deltoids (anterior, lateral, posterior)', 8),
  ('Triceps', 'Triceps brachii', 9),
  ('Biceps', 'Biceps brachii', 10),
  ('Forearms', 'Wrist flexors and extensors', 11),
  ('Core', 'Rectus abdominis, transverse abdominis', 12),
  ('Obliques', 'Internal and external obliques', 13),
  ('Lower Back', 'Erector spinae, multifidus', 14),
  ('Upper Back', 'Trapezius, rhomboids', 15),
  ('Lats', 'Latissimus dorsi', 16),
  ('Posterior Chain', 'Hamstrings, glutes, lower back (compound)', 17),
  ('Hip Abductors', 'Gluteus medius, TFL', 18),
  ('Hip Adductors', 'Adductor magnus, longus, brevis', 19),
  ('Full Body', 'Compound movements engaging entire body', 20);

CREATE INDEX idx_muscle_regions_display_order ON muscle_regions(display_order);

-- ============================================================================
-- 2. CREATE EXERCISE_MUSCLE_REGIONS JUNCTION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS exercise_muscle_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  muscle_region_id UUID NOT NULL REFERENCES muscle_regions(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT TRUE, -- true = primary target, false = secondary/synergist
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exercise_id, muscle_region_id)
);

CREATE INDEX idx_exercise_muscle_regions_exercise ON exercise_muscle_regions(exercise_id);
CREATE INDEX idx_exercise_muscle_regions_muscle ON exercise_muscle_regions(muscle_region_id);
CREATE INDEX idx_exercise_muscle_regions_primary ON exercise_muscle_regions(is_primary);

-- ============================================================================
-- 3. MIGRATE DATA FROM muscle_groups[] ARRAY
-- ============================================================================

-- Function to parse and migrate muscle_groups array to junction table
DO $$
DECLARE
  exercise_record RECORD;
  muscle_group_text TEXT;
  muscle_region_record RECORD;
BEGIN
  -- Loop through all exercises that have muscle_groups
  FOR exercise_record IN
    SELECT id, muscle_groups
    FROM exercises
    WHERE muscle_groups IS NOT NULL AND array_length(muscle_groups, 1) > 0
  LOOP
    -- Loop through each muscle group in the array
    FOR muscle_group_text IN
      SELECT UNNEST(exercise_record.muscle_groups)
    LOOP
      -- Try to find matching muscle region (case-insensitive, fuzzy match)
      SELECT id INTO muscle_region_record
      FROM muscle_regions
      WHERE LOWER(name) = LOWER(muscle_group_text)
         OR LOWER(name) LIKE '%' || LOWER(muscle_group_text) || '%'
         OR LOWER(muscle_group_text) LIKE '%' || LOWER(name) || '%'
      LIMIT 1;

      -- If match found, insert into junction table
      IF muscle_region_record.id IS NOT NULL THEN
        INSERT INTO exercise_muscle_regions (exercise_id, muscle_region_id, is_primary)
        VALUES (exercise_record.id, muscle_region_record.id, TRUE)
        ON CONFLICT (exercise_id, muscle_region_id) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================================
-- 4. ADD DEFAULT MUSCLE REGIONS FOR KNOWN MOVEMENTS
-- ============================================================================

-- Squats → Quads, Glutes, Hamstrings (primary)
INSERT INTO exercise_muscle_regions (exercise_id, muscle_region_id, is_primary)
SELECT e.id, mr.id, TRUE
FROM exercises e
CROSS JOIN muscle_regions mr
WHERE e.name ILIKE '%squat%'
  AND mr.name IN ('Quads', 'Glutes', 'Hamstrings')
ON CONFLICT (exercise_id, muscle_region_id) DO NOTHING;

-- Deadlifts → Posterior Chain (primary)
INSERT INTO exercise_muscle_regions (exercise_id, muscle_region_id, is_primary)
SELECT e.id, mr.id, TRUE
FROM exercises e
CROSS JOIN muscle_regions mr
WHERE e.name ILIKE '%deadlift%'
  AND mr.name = 'Posterior Chain'
ON CONFLICT (exercise_id, muscle_region_id) DO NOTHING;

-- Presses → Shoulders, Triceps, Chest
INSERT INTO exercise_muscle_regions (exercise_id, muscle_region_id, is_primary)
SELECT e.id, mr.id, TRUE
FROM exercises e
CROSS JOIN muscle_regions mr
WHERE e.name ILIKE '%press%'
  AND mr.name IN ('Shoulders', 'Triceps', 'Chest')
ON CONFLICT (exercise_id, muscle_region_id) DO NOTHING;

-- Pull-ups → Back, Lats, Biceps
INSERT INTO exercise_muscle_regions (exercise_id, muscle_region_id, is_primary)
SELECT e.id, mr.id, TRUE
FROM exercises e
CROSS JOIN muscle_regions mr
WHERE e.name ILIKE '%pull%'
  AND mr.name IN ('Back', 'Lats', 'Biceps')
ON CONFLICT (exercise_id, muscle_region_id) DO NOTHING;

-- Toes-to-Bar, Core movements → Core, Hip Flexors
INSERT INTO exercise_muscle_regions (exercise_id, muscle_region_id, is_primary)
SELECT e.id, mr.id, TRUE
FROM exercises e
CROSS JOIN muscle_regions mr
WHERE (e.name ILIKE '%toes%to%bar%' OR e.name ILIKE '%core%' OR e.name ILIKE '%sit%up%')
  AND mr.name IN ('Core', 'Hip Flexors')
ON CONFLICT (exercise_id, muscle_region_id) DO NOTHING;

-- Monostructural movements → Full Body
INSERT INTO exercise_muscle_regions (exercise_id, muscle_region_id, is_primary)
SELECT e.id, mr.id, TRUE
FROM exercises e
CROSS JOIN muscle_regions mr
WHERE (e.name ILIKE '%run%' OR e.name = 'Row' OR e.name ILIKE '%bike%' OR e.name ILIKE '%ski%')
  AND mr.name = 'Full Body'
ON CONFLICT (exercise_id, muscle_region_id) DO NOTHING;

-- ============================================================================
-- 5. ADD COMMENTS
-- ============================================================================

COMMENT ON TABLE muscle_regions IS 'Reference table for muscle groups and body regions';
COMMENT ON TABLE exercise_muscle_regions IS 'Junction table mapping exercises to targeted muscle regions';
COMMENT ON COLUMN exercise_muscle_regions.is_primary IS 'TRUE if primary target, FALSE if secondary/synergist muscle';
COMMENT ON COLUMN exercises.muscle_groups IS 'DEPRECATED: Use exercise_muscle_regions junction table instead';
