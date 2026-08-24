-- A second, broader net for the complete-portion backfill.
--
-- Written while chasing a delivered meal that still scored as a partial one.
-- 20260812120000's join turned out to be FINE — it had already flagged every
-- delivered meal, and this migration reports 0 rows on that data. The real
-- fault was on the client: one screen transcribed the score input by hand
-- instead of using the shared builder, so it never passed the flag through.
--
-- Kept rather than deleted because the net is genuinely wider than the
-- original and costs nothing: the delivery writer stamps an unambiguous notes
-- string that nothing else in the app produces, which catches a meal whose
-- concept links were later rearranged. The original concept-link route stays
-- as the second arm, for a meal whose notes were edited instead.
--
-- Idempotent (setting true twice is setting true), and it only ever sets the
-- flag ON — a meal you deliberately unflag by hand is not re-flagged, because
-- the WHERE clause excludes rows that already have the value.
DO $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.meals m
  SET is_complete_portion = true
  WHERE m.is_complete_portion = false
    AND (
      m.notes LIKE 'Delivered ready to eat%'
      OR (
        m.prep_minutes = 0
        AND EXISTS (
          SELECT 1
          FROM public.meal_items mi
          JOIN public.food_concept_links l ON l.saved_food_id = mi.saved_food_id
          JOIN public.food_concepts c ON c.id = l.concept_id
          WHERE mi.meal_id = m.id
            AND c.user_id = m.user_id
            AND c.slug LIKE 'meal-%'
        )
      )
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'complete-portion backfill: % meal(s) flagged', v_updated;
END $$;
