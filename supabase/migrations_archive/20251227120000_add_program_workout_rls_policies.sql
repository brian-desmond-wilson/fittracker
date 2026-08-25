-- Add INSERT, UPDATE, DELETE policies for program_workouts table
-- Users can only modify workouts for programs they created

-- INSERT policy: Users can add workouts to their own programs
CREATE POLICY "Users can insert workouts into own programs"
ON "public"."program_workouts"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "public"."program_templates"
    WHERE "program_templates"."id" = "program_workouts"."program_id"
    AND "program_templates"."creator_id" = auth.uid()
  )
);

-- UPDATE policy: Users can update workouts in their own programs
CREATE POLICY "Users can update workouts in own programs"
ON "public"."program_workouts"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM "public"."program_templates"
    WHERE "program_templates"."id" = "program_workouts"."program_id"
    AND "program_templates"."creator_id" = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "public"."program_templates"
    WHERE "program_templates"."id" = "program_workouts"."program_id"
    AND "program_templates"."creator_id" = auth.uid()
  )
);

-- DELETE policy: Users can delete workouts from their own programs
CREATE POLICY "Users can delete workouts from own programs"
ON "public"."program_workouts"
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM "public"."program_templates"
    WHERE "program_templates"."id" = "program_workouts"."program_id"
    AND "program_templates"."creator_id" = auth.uid()
  )
);

-- Add INSERT, UPDATE, DELETE policies for program_workout_exercises table
-- Users can only modify exercises for workouts in programs they created

-- INSERT policy: Users can add exercises to workouts in their own programs
CREATE POLICY "Users can insert exercises into own program workouts"
ON "public"."program_workout_exercises"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "public"."program_workouts" pw
    JOIN "public"."program_templates" pt ON pt.id = pw.program_id
    WHERE pw.id = "program_workout_exercises"."program_workout_id"
    AND pt.creator_id = auth.uid()
  )
);

-- UPDATE policy: Users can update exercises in workouts in their own programs
CREATE POLICY "Users can update exercises in own program workouts"
ON "public"."program_workout_exercises"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM "public"."program_workouts" pw
    JOIN "public"."program_templates" pt ON pt.id = pw.program_id
    WHERE pw.id = "program_workout_exercises"."program_workout_id"
    AND pt.creator_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "public"."program_workouts" pw
    JOIN "public"."program_templates" pt ON pt.id = pw.program_id
    WHERE pw.id = "program_workout_exercises"."program_workout_id"
    AND pt.creator_id = auth.uid()
  )
);

-- DELETE policy: Users can delete exercises from workouts in their own programs
CREATE POLICY "Users can delete exercises from own program workouts"
ON "public"."program_workout_exercises"
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM "public"."program_workouts" pw
    JOIN "public"."program_templates" pt ON pt.id = pw.program_id
    WHERE pw.id = "program_workout_exercises"."program_workout_id"
    AND pt.creator_id = auth.uid()
  )
);
