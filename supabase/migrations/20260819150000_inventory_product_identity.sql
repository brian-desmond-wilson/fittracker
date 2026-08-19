-- Stock learns which product it is an instance of.
-- Spec: docs/superpowers/specs/2026-08-19-product-identity-design.md
--
-- `food_inventory` carried its own copy of product identity (name, brand,
-- barcode, nutrition) and no reference to `saved_foods` — the two halves were
-- paired indirectly, by matching barcodes or by both linking to the same
-- concept. That indirection is how 15 stocked products ended up unreachable
-- from the meal builder.
--
-- This FK means IDENTITY: "this stock is a package of that product." It is not
-- substitution — substitution stays with concept links, which group different
-- products of the same ingredient type.
--
-- ON DELETE SET NULL: deleting a product must never delete stock. An orphaned
-- instance is repairable; a vanished shelf is not.
ALTER TABLE public.food_inventory
  ADD COLUMN IF NOT EXISTS saved_food_id uuid
    REFERENCES public.saved_foods(id) ON DELETE SET NULL;

-- The resolver's first tier reads "in-stock rows of THIS product".
CREATE INDEX IF NOT EXISTS idx_food_inventory_saved_food
  ON public.food_inventory (saved_food_id) WHERE saved_food_id IS NOT NULL;
