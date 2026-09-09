-- Straight-Leg: identity movement style, same axis as Butterfly.
-- Lets "Straight Leg Sit-Up" (and future straight-leg variants) carry a real
-- identity attribute instead of a kept custom name, giving it a fingerprint
-- distinct from the core and its siblings.
-- Band 14 matches Butterfly/Crush so the fragment composes as
-- "Straight-Leg Sit-Up" (after Weighted at 10, e.g. "Weighted Straight-Leg Sit-Up").

INSERT INTO public.movement_styles (name, description, category, display_order, is_identity, name_fragment, name_order)
SELECT 'Straight-Leg',
       'Performed with the legs held straight rather than bent.',
       'Execution Control',
       (SELECT COALESCE(max(display_order), 0) + 1 FROM public.movement_styles),
       true, 'Straight-Leg', 14
 WHERE NOT EXISTS (SELECT 1 FROM public.movement_styles WHERE name = 'Straight-Leg');
