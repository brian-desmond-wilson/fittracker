-- Seed Program Instances for Project Mass
-- This migration creates test program instances to demonstrate the program history feature

-- Get the Project Mass program ID (from previous seed)
DO $$
DECLARE
  v_program_id UUID;
  v_user_id UUID;
  v_instance_1_id UUID;
  v_instance_2_id UUID;
BEGIN
  -- Get the Project Mass program template ID
  SELECT id INTO v_program_id
  FROM program_templates
  WHERE slug = 'project-mass';

  -- Get the first user (you'll need to replace this with actual user ID)
  -- For now, we'll use a placeholder that you can update after running
  SELECT id INTO v_user_id
  FROM auth.users
  LIMIT 1;

  -- Only proceed if we found both program and user
  IF v_program_id IS NOT NULL AND v_user_id IS NOT NULL THEN

    -- Insert first instance: "Summer Build 2024" (Completed)
    INSERT INTO program_instances (
      user_id,
      program_id,
      instance_name,
      start_date,
      expected_end_date,
      actual_end_date,
      current_week,
      current_day,
      status,
      workouts_completed,
      total_workouts
    ) VALUES (
      v_user_id,
      v_program_id,
      'Summer Build 2024',
      '2024-06-01',
      '2024-09-08',
      '2024-09-08',
      14,  -- Completed all weeks
      6,   -- Completed all days
      'completed',
      84,  -- 14 weeks * 6 days/week
      84
    ) RETURNING id INTO v_instance_1_id;

    -- Insert second instance: "Project Mass - Take 1" (Incomplete)
    INSERT INTO program_instances (
      user_id,
      program_id,
      instance_name,
      start_date,
      expected_end_date,
      actual_end_date,
      current_week,
      current_day,
      status,
      workouts_completed,
      total_workouts
    ) VALUES (
      v_user_id,
      v_program_id,
      'Project Mass - Take 1',
      '2024-01-15',
      '2024-04-22',
      NULL,  -- Not completed
      10,    -- Stopped at week 10
      3,     -- Stopped at day 3
      'paused',  -- Using 'paused' instead of 'incomplete'
      55,    -- 65% of 84 workouts
      84
    ) RETURNING id INTO v_instance_2_id;

    RAISE NOTICE 'Created program instances:';
    RAISE NOTICE '  - Summer Build 2024: %', v_instance_1_id;
    RAISE NOTICE '  - Project Mass - Take 1: %', v_instance_2_id;
    RAISE NOTICE 'For user: %', v_user_id;

  ELSE
    RAISE NOTICE 'Could not find program_id or user_id. Skipping instance creation.';
    RAISE NOTICE '  program_id: %', v_program_id;
    RAISE NOTICE '  user_id: %', v_user_id;
  END IF;

END $$;

-- Add a comment explaining this data
COMMENT ON TABLE program_instances IS 'Stores user program instances. Sample data includes "Summer Build 2024" (completed) and "Project Mass - Take 1" (incomplete).';
