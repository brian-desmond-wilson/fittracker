// mobile/src/components/track/meals/library/MealBuilder.tsx
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert, ScrollView, Switch, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import type { FoodConcept, ConceptRating } from "@/src/types/nutrition-preferences";
import type {
  MealCategory, MealRole, MealWithItems,
} from "@/src/types/meal-library";
import { CATEGORY_LABELS, ROLE_LABELS } from "@/src/types/meal-library";
import type { SavedFood } from "@/src/types/track";
import { computeBrianScore } from "@/src/lib/mealScore";
import {
  DEFAULT_PREP_MINUTES, SERVING_STEP, parsePrepMinutes, snapServings,
} from "@/src/lib/mealBuilderInputs";
import { suggestConcepts } from "@/src/lib/conceptMatch";
import type { MealInput, MealItemInput } from "@/src/lib/supabase/mealLibrary";
import { lib, scoreChipStyle } from "./styles";

const CATEGORIES: MealCategory[] = ["breakfast", "lunch", "dinner", "snack", "shake", "emergency"];
const ROLES: MealRole[] = ["pre_workout", "post_workout", "bridge", "calorie_booster", "emergency_catchup"];
const RATINGS: ConceptRating[] = ["love", "like", "neutral", "dislike", "never"];

interface BuilderItem extends MealItemInput {
  savedFood: SavedFood;
}

interface MealBuilderProps {
  /** null = create */
  initial: MealWithItems | null;
  savedFoods: SavedFood[];
  conceptsById: Map<string, FoodConcept>;
  conceptIdsBySavedFoodId: Map<string, string[]>;
  saving: boolean;
  onSave: (input: MealInput) => void;
  onQuickLink: (savedFoodId: string, conceptId: string) => void;
}

export function MealBuilder({
  initial, savedFoods, conceptsById, conceptIdsBySavedFoodId, saving, onSave, onQuickLink,
}: MealBuilderProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<MealCategory>(initial?.category ?? "lunch");
  const [role, setRole] = useState<MealRole | null>(initial?.role ?? null);
  const [prepMinutes, setPrepMinutes] = useState(String(initial?.prep_minutes ?? DEFAULT_PREP_MINUTES));
  const [tasteOverride, setTasteOverride] = useState<ConceptRating | null>(
    initial?.taste_override ?? null,
  );
  const [items, setItems] = useState<BuilderItem[]>(
    initial?.items.map((it) => ({
      saved_food_id: it.saved_food_id,
      servings: it.servings,
      small_pieces_ok: it.small_pieces_ok,
      savedFood: it.savedFood,
    })) ?? [],
  );
  const [search, setSearch] = useState("");

  const conceptsFor = useCallback(
    (savedFoodId: string): FoodConcept[] =>
      (conceptIdsBySavedFoodId.get(savedFoodId) ?? [])
        .map((id) => conceptsById.get(id))
        .filter((c): c is FoodConcept => !!c),
    [conceptIdsBySavedFoodId, conceptsById],
  );

  // null = the field is blank (or not a number), which is NOT the same as 0.
  const enteredPrep = parsePrepMinutes(prepMinutes);
  const prep = enteredPrep ?? DEFAULT_PREP_MINUTES;
  const score = useMemo(
    () =>
      computeBrianScore({
        prepMinutes: prep,
        role,
        tasteOverride,
        items: items.map((it) => ({
          calories: it.savedFood.calories,
          protein: it.savedFood.protein,
          servings: it.servings,
          smallPiecesOk: it.small_pieces_ok,
          concepts: conceptsFor(it.saved_food_id).map((c) => ({
            rating: c.rating,
            requiresSmallPieces: c.requires_small_pieces,
            prepIntensive: c.prep_intensive,
          })),
        })),
      }),
    [prep, role, tasteOverride, items, conceptsFor],
  );

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const chosen = new Set(items.map((it) => it.saved_food_id));
    return savedFoods
      .filter((f) => !chosen.has(f.id) && f.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, savedFoods, items]);

  const addItem = (f: SavedFood) => {
    setItems((prev) => [
      ...prev,
      { saved_food_id: f.id, servings: 1, small_pieces_ok: false, savedFood: f },
    ]);
    setSearch("");
  };

  const setServings = (id: string, delta: number) =>
    setItems((prev) =>
      prev.map((it) =>
        it.saved_food_id === id
          ? { ...it, servings: snapServings(it.servings, delta) }
          : it,
      ),
    );

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert("Missing name", "Give the meal a name first.");
      return;
    }
    if (items.length === 0) {
      Alert.alert("No ingredients", "Add at least one saved food.");
      return;
    }
    onSave({
      name: name.trim(),
      category,
      role,
      default_meal_type: initial?.default_meal_type ?? null,
      prep_minutes: prep,
      taste_override: tasteOverride,
      notes: initial?.notes ?? null,
      items: items.map(({ savedFood: _sf, ...it }) => it),
    });
  };

  return (
    <ScrollView
      contentContainerStyle={{ paddingVertical: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={lib.card}>
        <TextInput
          style={lib.input}
          placeholder="Meal name (e.g. Korean Beef Bowl)"
          placeholderTextColor="#6B7280"
          value={name}
          onChangeText={setName}
        />
        <Text style={[lib.mutedText, { fontWeight: "700", marginTop: 12 }]}>Category</Text>
        <View style={[lib.row, { flexWrap: "wrap", marginTop: 8 }]}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c}
              style={[lib.chip, category === c && lib.chipActive]}
              onPress={() => setCategory(c)}
            >
              <Text style={[lib.chipText, category === c && lib.chipTextActive]}>
                {CATEGORY_LABELS[c]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[lib.mutedText, { fontWeight: "700", marginTop: 8 }]}>Role (optional)</Text>
        <View style={[lib.row, { flexWrap: "wrap", marginTop: 8 }]}>
          {ROLES.map((r) => (
            <TouchableOpacity
              key={r}
              style={[lib.chip, role === r && lib.chipActive]}
              onPress={() => setRole((prev) => (prev === r ? null : r))}
            >
              <Text style={[lib.chipText, role === r && lib.chipTextActive]}>
                {ROLE_LABELS[r]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[lib.mutedText, { fontWeight: "700", marginTop: 8 }]}>Prep minutes</Text>
        <TextInput
          style={lib.input}
          keyboardType="number-pad"
          value={prepMinutes}
          onChangeText={setPrepMinutes}
        />
        <Text style={[lib.mutedText, { fontWeight: "700", marginTop: 12 }]}>
          Taste override (whole meal)
        </Text>
        <View style={[lib.row, { flexWrap: "wrap", marginTop: 8 }]}>
          {RATINGS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[lib.chip, tasteOverride === r && lib.chipActive]}
              onPress={() => setTasteOverride((prev) => (prev === r ? null : r))}
            >
              <Text style={[lib.chipText, tasteOverride === r && lib.chipTextActive]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={lib.card}>
        <Text style={[lib.mutedText, { fontWeight: "700" }]}>Ingredients</Text>
        {items.map((it) => {
          const concepts = conceptsFor(it.saved_food_id);
          const needsSmallPieces = concepts.some((c) => c.requires_small_pieces);
          const unlinked = concepts.length === 0;
          const suggestion = unlinked
            ? suggestConcepts(it.savedFood.name, [...conceptsById.values()])[0]
            : undefined;
          return (
            <View key={it.saved_food_id} style={{ marginTop: 10 }}>
              <View style={lib.rowBetween}>
                <Text style={[lib.mutedText, { color: "#D1D5DB", flexShrink: 1 }]} numberOfLines={1}>
                  {it.savedFood.name}
                </Text>
                <View style={[lib.row, { gap: 10 }]}>
                  <TouchableOpacity onPress={() => setServings(it.saved_food_id, -SERVING_STEP)}>
                    <Text style={lib.headerAction}>−</Text>
                  </TouchableOpacity>
                  <Text style={lib.mutedText}>×{it.servings}</Text>
                  <TouchableOpacity onPress={() => setServings(it.saved_food_id, SERVING_STEP)}>
                    <Text style={lib.headerAction}>＋</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      setItems((prev) => prev.filter((p) => p.saved_food_id !== it.saved_food_id))
                    }
                  >
                    <Text style={lib.destructiveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {needsSmallPieces && (
                <View style={[lib.rowBetween, { marginTop: 4 }]}>
                  <Text style={lib.smallMuted}>Already in small pieces? (EoE)</Text>
                  <Switch
                    value={it.small_pieces_ok}
                    onValueChange={(v) =>
                      setItems((prev) =>
                        prev.map((p) =>
                          p.saved_food_id === it.saved_food_id
                            ? { ...p, small_pieces_ok: v }
                            : p,
                        ),
                      )
                    }
                  />
                </View>
              )}
              {suggestion && (
                <TouchableOpacity
                  style={[lib.chip, { alignSelf: "flex-start", marginTop: 6 }]}
                  onPress={() => onQuickLink(it.saved_food_id, suggestion.conceptId)}
                >
                  <Text style={lib.chipText}>
                    Link to “{conceptsById.get(suggestion.conceptId)?.name}” for scoring
                  </Text>
                </TouchableOpacity>
              )}
              {unlinked && !suggestion && (
                <Text style={[lib.smallMuted, { marginTop: 4 }]}>
                  Not linked to a rated concept — excluded from taste.
                </Text>
              )}
            </View>
          );
        })}
        <TextInput
          style={lib.input}
          placeholder="Search saved foods to add…"
          placeholderTextColor="#6B7280"
          value={search}
          onChangeText={setSearch}
        />
        {results.map((f) => (
          <TouchableOpacity key={f.id} style={{ paddingVertical: 8 }} onPress={() => addItem(f)}>
            <Text style={[lib.mutedText, { color: "#D1D5DB" }]}>
              ＋ {f.name}
              {f.calories != null ? `  ·  ${f.calories} cal` : ""}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={lib.card}>
        <View style={lib.rowBetween}>
          <Text style={lib.mutedText}>
            {Math.round(score.totalCalories)} cal · {Math.round(score.totalProtein)}g protein
          </Text>
          <View style={[lib.scoreChip, scoreChipStyle(score.score)]}>
            <Text style={lib.scoreChipText}>{score.score}</Text>
          </View>
        </View>
        {enteredPrep === null && (
          <Text style={[lib.smallMuted, { marginTop: 6 }]}>
            Prep time is blank — scored (and saved) as {DEFAULT_PREP_MINUTES} min.
          </Text>
        )}
        {score.approved && (
          <Text style={[lib.badgeText, { marginTop: 6 }]}>Meets the Brian Approved bar</Text>
        )}
      </View>

      <View style={{ marginHorizontal: 16 }}>
        <TouchableOpacity
          style={[lib.primaryButton, { opacity: saving ? 0.6 : 1 }]}
          disabled={saving}
          onPress={handleSave}
        >
          <Text style={lib.primaryButtonText}>
            {saving ? "Saving…" : initial ? "Save changes" : "Add to library"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
