// Data access for Nutrition OS Phase 1 (house pattern: domain query module).
import { supabase } from "../supabase";
import type { WeighIn } from "../rampProgress";
import type {
  CalorieRampLevel,
  ConceptRating,
  FoodConcept,
  NutritionConstraints,
  NutritionVendor,
} from "@/src/types/nutrition-preferences";

export interface NutritionPreferencesData {
  concepts: FoodConcept[];
  constraints: NutritionConstraints | null;
  vendors: NutritionVendor[];
  rampLevels: CalorieRampLevel[];
}

export async function fetchNutritionPreferences(): Promise<NutritionPreferencesData> {
  const [concepts, constraints, vendors, rampLevels] = await Promise.all([
    supabase.from("food_concepts").select("*").order("name"),
    supabase.from("nutrition_constraints").select("*").maybeSingle(),
    supabase.from("nutrition_vendors").select("*").order("display_order"),
    supabase.from("calorie_ramp_levels").select("*").order("level"),
  ]);
  const errors = [
    concepts.error,
    constraints.error,
    vendors.error,
    rampLevels.error,
  ].filter((e) => e !== null);
  if (errors.length > 0) {
    // A double failure is worth knowing about even though only the first
    // error is thrown.
    errors.slice(1).forEach((e) => console.error("fetchNutritionPreferences:", e));
    throw errors[0];
  }
  return {
    concepts: (concepts.data ?? []) as FoodConcept[],
    constraints: (constraints.data ?? null) as NutritionConstraints | null,
    vendors: (vendors.data ?? []) as NutritionVendor[],
    rampLevels: (rampLevels.data ?? []) as CalorieRampLevel[],
  };
}

export type ConceptPatch = Partial<
  Pick<
    FoodConcept,
    "rating" | "requires_small_pieces" | "prep_intensive" | "form_note" | "notes" | "name"
  >
>;

export async function updateConcept(id: string, patch: ConceptPatch): Promise<void> {
  let payload: ConceptPatch & { slug?: string } = patch;
  if (patch.name !== undefined) {
    const slug = slugify(patch.name);
    if (!slug) {
      throw new Error("Name must contain at least one letter or number.");
    }
    // Renaming without re-deriving the slug leaves it stale, which can
    // confusingly collide with a later, genuinely-new concept of the old name.
    payload = { ...patch, slug };
  }
  const { error } = await supabase.from("food_concepts").update(payload).eq("id", id);
  if (error) throw error;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function createConcept(
  userId: string,
  name: string,
  rating: ConceptRating
): Promise<void> {
  const slug = slugify(name);
  if (!slug) {
    throw new Error("Name must contain at least one letter or number.");
  }
  const { error } = await supabase
    .from("food_concepts")
    .insert({ user_id: userId, name: name.trim(), slug, rating });
  if (error) throw error;
}

export async function deleteConcept(id: string): Promise<void> {
  const { error } = await supabase.from("food_concepts").delete().eq("id", id);
  if (error) throw error;
}

export type ConstraintsPatch = Partial<
  Omit<NutritionConstraints, "id" | "user_id" | "created_at" | "updated_at">
>;

export async function updateConstraints(
  id: string,
  patch: ConstraintsPatch
): Promise<void> {
  const { error } = await supabase.from("nutrition_constraints").update(patch).eq("id", id);
  if (error) throw error;
}

export async function updateVendor(
  id: string,
  patch: Partial<Pick<NutritionVendor, "name" | "app_url" | "is_active">>
): Promise<void> {
  const { error } = await supabase.from("nutrition_vendors").update(patch).eq("id", id);
  if (error) throw error;
}

/**
 * Atomically activates a ramp level and syncs the owner's profiles targets.
 * Delegates to a Postgres function so the level and targets cannot diverge.
 */
export async function changeRampLevel(
  targetLevelId: string,
  todayLocalDate: string
): Promise<void> {
  const { error } = await supabase.rpc("set_active_ramp_level", {
    p_level_id: targetLevelId,
    p_today: todayLocalDate,
  });
  if (error) throw error;
}

export async function fetchRecentWeighIns(
  sinceLocalDate: string
): Promise<WeighIn[]> {
  const { data, error } = await supabase
    .from("weight_logs")
    .select("date, weight_lbs")
    .gte("date", sinceLocalDate)
    .order("date");
  if (error) throw error;
  return data ?? [];
}

// Narrow projection of `calorie_ramp_levels` for consumers that only need to
// find the active level and derive the next one (e.g. RampHomeBanner) —
// unlike `fetchNutritionPreferences`, which legitimately needs the full
// dataset (concepts, constraints, vendors) for NutritionPreferencesScreen.
// Purely additive: does not change `fetchNutritionPreferences` or any other
// existing export in this module.
export interface RampLevelSummary {
  level: number;
  name: string;
  is_active: boolean;
  started_at: string | null;
}

export async function fetchRampLevels(): Promise<RampLevelSummary[]> {
  const { data, error } = await supabase
    .from("calorie_ramp_levels")
    .select("level, name, is_active, started_at")
    .order("level");
  if (error) throw error;
  return (data ?? []) as RampLevelSummary[];
}
