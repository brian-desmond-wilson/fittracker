import { supabase } from "@/src/lib/supabase";
import {
  MealTemplate,
  MealTemplateItem,
  MealTemplateWithItems,
  MealType,
  SavedFood,
} from "@/src/types/track";

function localDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * List all templates for the current user, with items + saved_foods joined.
 */
export async function listMealTemplates(): Promise<MealTemplateWithItems[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: templates, error: tErr } = await supabase
    .from("meal_templates")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (tErr) throw tErr;
  if (!templates || templates.length === 0) return [];

  const templateIds = templates.map((t: MealTemplate) => t.id);
  const { data: items, error: iErr } = await supabase
    .from("meal_template_items")
    .select("*, savedFood:saved_foods(*)")
    .in("template_id", templateIds)
    .order("display_order", { ascending: true });
  if (iErr) throw iErr;

  return templates.map((t: MealTemplate) => {
    const tplItems = (items ?? []).filter(
      (it: any) => it.template_id === t.id
    ) as Array<MealTemplateItem & { savedFood: SavedFood }>;

    const totals = tplItems.reduce(
      (acc, it) => {
        const f = it.savedFood;
        if (!f) return acc;
        const s = Number(it.servings);
        return {
          calories: acc.calories + (f.calories ?? 0) * s,
          protein: acc.protein + (f.protein ?? 0) * s,
          carbs: acc.carbs + (f.carbs ?? 0) * s,
          fats: acc.fats + (f.fats ?? 0) * s,
          sugars: acc.sugars + (f.sugars ?? 0) * s,
          sodium_mg: acc.sodium_mg + (f.sodium_mg ?? 0) * s,
          fiber_g: acc.fiber_g + (f.fiber_g ?? 0) * s,
        };
      },
      { calories: 0, protein: 0, carbs: 0, fats: 0, sugars: 0, sodium_mg: 0, fiber_g: 0 }
    );

    return { ...t, items: tplItems, totals } as MealTemplateWithItems;
  });
}

export async function createMealTemplate(input: {
  name: string;
  default_meal_type: MealType | null;
  notes: string | null;
  items: Array<{ saved_food_id: string; servings: number }>;
}): Promise<MealTemplateWithItems> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: tpl, error: tErr } = await supabase
    .from("meal_templates")
    .insert({
      user_id: user.id,
      name: input.name.trim(),
      default_meal_type: input.default_meal_type,
      notes: input.notes,
    })
    .select()
    .single();
  if (tErr) throw tErr;

  if (input.items.length > 0) {
    const rows = input.items.map((it, idx) => ({
      template_id: tpl.id,
      saved_food_id: it.saved_food_id,
      servings: it.servings,
      display_order: idx,
    }));
    const { error: iErr } = await supabase
      .from("meal_template_items")
      .insert(rows);
    if (iErr) throw iErr;
  }

  // Re-fetch with items
  const all = await listMealTemplates();
  return all.find((t) => t.id === tpl.id) ?? { ...tpl, items: [], totals: {
    calories: 0, protein: 0, carbs: 0, fats: 0, sugars: 0, sodium_mg: 0, fiber_g: 0,
  }};
}

export async function deleteMealTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("meal_templates").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Log a template: inserts one meal_log row per template item, all on
 * the same date + meal_type, tagged with meal_template_id.
 */
export async function logMealTemplate(
  template: MealTemplateWithItems,
  opts: { date?: string; mealType: MealType }
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const date = opts.date ?? localDate();
  const loggedAt = new Date().toISOString();

  const rows = template.items.map((it) => {
    const f = it.savedFood;
    const s = Number(it.servings);
    return {
      user_id: user.id,
      date,
      meal_type: opts.mealType,
      name: f.name,
      calories: f.calories != null ? Math.round(f.calories * s) : null,
      protein: f.protein != null ? Math.round(f.protein * s * 10) / 10 : null,
      carbs: f.carbs != null ? Math.round(f.carbs * s * 10) / 10 : null,
      fats: f.fats != null ? Math.round(f.fats * s * 10) / 10 : null,
      sugars: f.sugars != null ? Math.round(f.sugars * s * 10) / 10 : null,
      sodium_mg: f.sodium_mg != null ? Math.round(f.sodium_mg * s) : null,
      fiber_g: f.fiber_g != null ? Math.round(f.fiber_g * s * 10) / 10 : null,
      saved_food_id: f.id,
      meal_template_id: template.id,
      servings: s,
      uses_inventory: false,
      inventory_items: null,
      logged_at: loggedAt,
    };
  });

  if (rows.length === 0) return;
  const { error } = await supabase.from("meal_logs").insert(rows);
  if (error) throw error;
}
