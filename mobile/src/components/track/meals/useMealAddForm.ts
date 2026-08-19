import { useState, Dispatch, SetStateAction } from "react";
import { BeverageKind, MealType, SavedFood } from "@/src/types/track";
import { beverageCountsAsMealDefault } from "@/src/types/meal-library";
import type { MealSourceKind } from "@/src/lib/mealLibraryView";

// Bundles the manual "Log Meal" form field state so the screen doesn't carry a
// dozen loose useState hooks. Behavior is unchanged from the inline version.
export interface MealAddFormState {
  selectedDate: Date;
  setSelectedDate: Dispatch<SetStateAction<Date>>;
  showDatePicker: boolean;
  setShowDatePicker: Dispatch<SetStateAction<boolean>>;
  mealType: MealType;
  setMealType: Dispatch<SetStateAction<MealType>>;
  mealName: string;
  setMealName: Dispatch<SetStateAction<string>>;
  calories: string;
  setCalories: Dispatch<SetStateAction<string>>;
  protein: string;
  setProtein: Dispatch<SetStateAction<string>>;
  carbs: string;
  setCarbs: Dispatch<SetStateAction<string>>;
  fats: string;
  setFats: Dispatch<SetStateAction<string>>;
  sugars: string;
  setSugars: Dispatch<SetStateAction<string>>;
  sodiumMg: string;
  setSodiumMg: Dispatch<SetStateAction<string>>;
  fiberG: string;
  setFiberG: Dispatch<SetStateAction<string>>;
  // "Keep this for next time" — save the typed thing to the Meal Library as
  // well as logging it, so it can be searched and re-logged on another day.
  keep: boolean;
  setKeep: Dispatch<SetStateAction<boolean>>;
  keepSourceKind: MealSourceKind;
  setKeepSourceKind: Dispatch<SetStateAction<MealSourceKind>>;
  keepSourceName: string;
  setKeepSourceName: Dispatch<SetStateAction<string>>;
  // Beverage mode. `bevKinds` is what the drink is (multi-select);
  // `bevCountsAsMeal` is what it does to the day. The switch follows the tags
  // (weight-gain ⇒ meal) until the owner flips it by hand, after which the
  // hand answer sticks — that's the `null = follow the tags` encoding.
  bevKinds: BeverageKind[];
  toggleBevKind: (kind: BeverageKind) => void;
  bevCountsOverride: boolean | null;
  setBevCountsOverride: Dispatch<SetStateAction<boolean | null>>;
  /** The switch's current answer: the override when set, else the tags'. */
  bevCountsAsMeal: boolean;
  // Reset to defaults, dating the form to `base` (the viewing date).
  reset: (base: Date) => void;
  // Quick-fill name + macros from a recent-food chip.
  fillFromChip: (food: SavedFood) => void;
}

export function useMealAddForm(): MealAddFormState {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [mealName, setMealName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fats, setFats] = useState("");
  const [sugars, setSugars] = useState("");
  const [sodiumMg, setSodiumMg] = useState("");
  const [fiberG, setFiberG] = useState("");
  const [keep, setKeep] = useState(false);
  // "Bought out" leads because the keep switch exists for the spontaneous
  // purchase — a gym shake, a restaurant plate. A home recipe worth keeping
  // goes through the meal builder, where it can carry its ingredients.
  const [keepSourceKind, setKeepSourceKind] = useState<MealSourceKind>("out");
  const [keepSourceName, setKeepSourceName] = useState("");
  const [bevKinds, setBevKinds] = useState<BeverageKind[]>([]);
  const [bevCountsOverride, setBevCountsOverride] = useState<boolean | null>(null);

  const toggleBevKind = (kind: BeverageKind) =>
    setBevKinds((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind],
    );

  const reset = (base: Date) => {
    setSelectedDate(base);
    setMealType("breakfast");
    setMealName("");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFats("");
    setSugars("");
    setSodiumMg("");
    setFiberG("");
    setKeep(false);
    setKeepSourceKind("out");
    setKeepSourceName("");
    setBevKinds([]);
    setBevCountsOverride(null);
  };

  const fillFromChip = (food: SavedFood) => {
    setMealName(food.name);
    setCalories(food.calories?.toString() || "");
    setProtein(food.protein?.toString() || "");
    setCarbs(food.carbs?.toString() || "");
    setFats(food.fats?.toString() || "");
    setSugars(food.sugars?.toString() || "");
  };

  return {
    selectedDate,
    setSelectedDate,
    showDatePicker,
    setShowDatePicker,
    mealType,
    setMealType,
    mealName,
    setMealName,
    calories,
    setCalories,
    protein,
    setProtein,
    carbs,
    setCarbs,
    fats,
    setFats,
    sugars,
    setSugars,
    sodiumMg,
    setSodiumMg,
    fiberG,
    setFiberG,
    bevKinds,
    toggleBevKind,
    bevCountsOverride,
    setBevCountsOverride,
    bevCountsAsMeal: bevCountsOverride ?? beverageCountsAsMealDefault(bevKinds),
    keep,
    setKeep,
    keepSourceKind,
    setKeepSourceKind,
    keepSourceName,
    setKeepSourceName,
    reset,
    fillFromChip,
  };
}
