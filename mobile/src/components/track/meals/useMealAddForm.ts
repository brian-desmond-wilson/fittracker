import { useState, Dispatch, SetStateAction } from "react";
import { MealType, SavedFood } from "@/src/types/track";

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
    reset,
    fillFromChip,
  };
}
