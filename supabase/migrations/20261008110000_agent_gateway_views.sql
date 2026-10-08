-- Read views for the agent gateway (supabase/functions/agent-gateway).
-- The three inputs the coach needs that the raw tables don't answer on their
-- own: soreness per region per day, which equipment each gym has, and which
-- muscle regions a day's session trained. Each view flattens the joins the
-- app itself makes (see mobile/src/lib/supabase/daily.ts and capture.ts) so
-- the agent reads names, not ids. security_invoker keeps the underlying
-- tables' RLS in force for any non-service caller.

-- 1. Soreness: daily_checkin_soreness carries no date or user; both come
--    from the check-in it hangs off.
CREATE OR REPLACE VIEW public.agent_soreness WITH (security_invoker = true) AS
SELECT
  c.id          AS checkin_id,
  c.user_id,
  c.checkin_date,
  s.muscle_region_id,
  r.name        AS region,
  s.severity
FROM public.daily_checkin_soreness s
JOIN public.daily_checkins c ON c.id = s.checkin_id
JOIN public.muscle_regions r ON r.id = s.muscle_region_id;

-- 2. Per-gym equipment: the junction holds ids only.
CREATE OR REPLACE VIEW public.agent_gym_equipment WITH (security_invoker = true) AS
SELECT
  g.id          AS gym_profile_id,
  g.user_id,
  g.name        AS gym,
  g.location,
  g.preset,
  g.is_active,
  e.id          AS equipment_id,
  e.name        AS equipment,
  e.category
FROM public.gym_profile_equipment ge
JOIN public.gym_profiles g ON g.id = ge.gym_profile_id
JOIN public.equipment    e ON e.id = ge.equipment_id;

-- 3a. Exercise → muscle regions, by name.
CREATE OR REPLACE VIEW public.agent_exercise_muscles WITH (security_invoker = true) AS
SELECT
  em.exercise_id,
  x.name        AS exercise,
  em.muscle_region_id,
  r.name        AS region,
  em.is_primary
FROM public.exercise_muscle_regions em
JOIN public.exercises      x ON x.id = em.exercise_id
JOIN public.muscle_regions r ON r.id = em.muscle_region_id;

-- 3b. Session day → muscle regions. A composed day's items map through the
--     exercise; a served-whole block maps through the captured workout's own
--     muscle tags. One row per (session, source row, region).
CREATE OR REPLACE VIEW public.agent_session_muscles WITH (security_invoker = true) AS
SELECT
  gs.id           AS session_id,
  gs.user_id,
  gs.session_date,
  gs.status,
  gs.split_day,
  'exercise'::text AS via,
  i.exercise_id,
  NULL::uuid      AS captured_workout_id,
  em.muscle_region_id,
  r.name          AS region,
  em.is_primary
FROM public.generated_sessions gs
JOIN public.generated_session_items i  ON i.session_id = gs.id
JOIN public.exercise_muscle_regions em ON em.exercise_id = i.exercise_id
JOIN public.muscle_regions r           ON r.id = em.muscle_region_id
UNION ALL
SELECT
  gs.id,
  gs.user_id,
  gs.session_date,
  gs.status,
  gs.split_day,
  'workout'::text,
  NULL::uuid,
  b.captured_workout_id,
  wm.muscle_region_id,
  r.name,
  wm.is_primary
FROM public.generated_sessions gs
JOIN public.generated_session_blocks b   ON b.session_id = gs.id AND b.captured_workout_id IS NOT NULL AND NOT b.dismissed
JOIN public.captured_workout_muscles wm  ON wm.captured_workout_id = b.captured_workout_id
JOIN public.muscle_regions r             ON r.id = wm.muscle_region_id;
