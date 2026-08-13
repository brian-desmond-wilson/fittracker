import { brianScoreInputFor } from "../mealScoreInput";
import type { FoodConcept } from "@/src/types/nutrition-preferences";
import type { MealItemWithFood, MealWithItems } from "@/src/types/meal-library";
import type { SavedFood } from "@/src/types/track";

// ── fixtures ───────────────────────────────────────────────────────────────
// Every boolean and number below is deliberately DISTINCT from its neighbours
// (small_pieces_ok true vs requires_small_pieces false vs prep_intensive true;
// prep_minutes 7 vs servings 2 vs calories 250 vs protein 30) so that sourcing
// a field from the wrong sibling changes the output. Same-valued fixtures
// would let a swapped rename pass.

function food(over: Partial<SavedFood> = {}): SavedFood {
  return {
    id: "f1", user_id: "u", name: "Food", brand: null, barcode: null,
    calories: 250, protein: 30, carbs: 20, fats: 8, sugars: 3,
    sodium_mg: 400, fiber_g: 2, serving_size: null,
    image_primary_url: null, image_front_url: null, image_back_url: null,
    is_favorite: false, user_corrected: false, auto_scaled: false,
    created_at: "2026-07-29T00:00:00Z", updated_at: "2026-07-29T00:00:00Z",
    ...over,
  };
}

function item(over: Partial<MealItemWithFood> = {}): MealItemWithFood {
  return {
    id: "i1", user_id: "u", meal_id: "m1", saved_food_id: "f1",
    servings: 2, display_order: 0, small_pieces_ok: true,
    created_at: "2026-07-29T00:00:00Z",
    savedFood: food(),
    ...over,
  };
}

function meal(over: Partial<MealWithItems> = {}): MealWithItems {
  return {
    id: "m1", user_id: "u", name: "Meal", slug: "meal",
    category: "lunch", categories: ["lunch"], role: "bridge", default_meal_type: null,
    prep_minutes: 7, taste_override: "like", is_complete_portion: false, notes: null,
    is_favorite: false, source_kind: "home", source_name: null, archived_at: null,
    created_at: "2026-07-29T00:00:00Z", updated_at: "2026-07-29T00:00:00Z",
    items: [item()],
    ...over,
  };
}

function concept(over: Partial<FoodConcept> = {}): FoodConcept {
  return {
    id: "c1", user_id: "u", name: "Concept", slug: "concept",
    rating: "love", requires_small_pieces: false, prep_intensive: true,
    form_note: null, notes: null,
    created_at: "2026-07-29T00:00:00Z", updated_at: "2026-07-29T00:00:00Z",
    ...over,
  };
}

// ── tests ──────────────────────────────────────────────────────────────────

describe("brianScoreInputFor", () => {
  it("maps every meal- and item-level field to its camelCase target", () => {
    const input = brianScoreInputFor(
      meal(),
      new Map([["f1", ["c1"]]]),
      new Map([["c1", concept()]]),
    );
    expect(input).toEqual({
      prepMinutes: 7,
      role: "bridge",
      tasteOverride: "like",
      completePortion: false,
      items: [
        {
          calories: 250,
          protein: 30,
          servings: 2,
          smallPiecesOk: true,
          concepts: [
            { rating: "love", requiresSmallPieces: false, prepIntensive: true },
          ],
        },
      ],
    });
  });

  it("does not confuse the two item-level booleans with each other", () => {
    // small_pieces_ok=false / requires_small_pieces=true is the exact inverse
    // of the fixture above, so a swap of either rename flips a value here.
    const input = brianScoreInputFor(
      meal({ items: [item({ small_pieces_ok: false })] }),
      new Map([["f1", ["c1"]]]),
      new Map([["c1", concept({ requires_small_pieces: true, prep_intensive: false })]]),
    );
    expect(input.items[0].smallPiecesOk).toBe(false);
    expect(input.items[0].concepts[0].requiresSmallPieces).toBe(true);
    expect(input.items[0].concepts[0].prepIntensive).toBe(false);
  });

  it("keeps calories and protein on their own fields", () => {
    const input = brianScoreInputFor(
      meal({ items: [item({ savedFood: food({ calories: 111, protein: 22 }) })] }),
      new Map(),
      new Map(),
    );
    expect(input.items[0].calories).toBe(111);
    expect(input.items[0].protein).toBe(22);
  });

  it("passes a null role and a null taste override straight through", () => {
    const input = brianScoreInputFor(
      meal({ role: null, taste_override: null }),
      new Map(),
      new Map(),
    );
    expect(input.role).toBeNull();
    expect(input.tasteOverride).toBeNull();
  });

  it("gives a food with NO concept links an empty concepts array", () => {
    // The map has no key for "f1" at all — fetchMealLibrary only inserts keys
    // it saw a link row for. Without the `?? []` this throws.
    const input = brianScoreInputFor(meal(), new Map(), new Map([["c1", concept()]]));
    expect(input.items[0].concepts).toEqual([]);
  });

  it("drops a link pointing at a concept id that is not in conceptsById", () => {
    const input = brianScoreInputFor(
      meal(),
      new Map([["f1", ["c1", "missing", "c2"]]]),
      new Map([
        ["c1", concept({ id: "c1", rating: "love" })],
        ["c2", concept({ id: "c2", rating: "dislike" })],
      ]),
    );
    // The dangling id is dropped, the surviving two are kept IN ORDER — not
    // replaced by an undefined hole, and not truncated at the gap.
    expect(input.items[0].concepts.map((c) => c.rating)).toEqual([
      "love",
      "dislike",
    ]);
  });

  it("drops every concept when all of a food's links dangle", () => {
    const input = brianScoreInputFor(
      meal(),
      new Map([["f1", ["gone"]]]),
      new Map(),
    );
    expect(input.items[0].concepts).toEqual([]);
  });

  it("maps items in order and resolves each food's own links", () => {
    const input = brianScoreInputFor(
      meal({
        items: [
          item({ id: "i1", saved_food_id: "f1", servings: 1 }),
          item({ id: "i2", saved_food_id: "f2", servings: 3 }),
        ],
      }),
      new Map([
        ["f1", ["c1"]],
        ["f2", ["c2"]],
      ]),
      new Map([
        ["c1", concept({ id: "c1", rating: "never" })],
        ["c2", concept({ id: "c2", rating: "neutral" })],
      ]),
    );
    expect(input.items.map((i) => i.servings)).toEqual([1, 3]);
    expect(input.items.map((i) => i.concepts[0].rating)).toEqual([
      "never",
      "neutral",
    ]);
  });

  it("handles an item-less meal", () => {
    const input = brianScoreInputFor(meal({ items: [] }), new Map(), new Map());
    expect(input.items).toEqual([]);
  });
});
