import { MealType } from "@/src/types/track";

// Meal type metadata (order matters for the type selector and section ordering).
export const MEAL_TYPES: { value: MealType; label: string; color: string }[] = [
  { value: "breakfast", label: "Breakfast", color: "#F59E0B" },
  { value: "lunch", label: "Lunch", color: "#10B981" },
  { value: "dinner", label: "Dinner", color: "#3B82F6" },
  { value: "snack", label: "Snack", color: "#8B5CF6" },
  { value: "dessert", label: "Dessert", color: "#EC4899" },
];

// Order the logged-meals list groups the day's meals in.
export const MEAL_TYPE_ORDER: MealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "dessert",
];

// Local date in YYYY-MM-DD format (not UTC).
export const getLocalDateString = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getMealTypeColor = (type: MealType): string =>
  MEAL_TYPES.find((t) => t.value === type)?.color || "#6B7280";

export const getMealTypeLabel = (type: MealType): string =>
  MEAL_TYPES.find((t) => t.value === type)?.label || type;

// Time-of-day label for a logged meal timestamp (e.g. "8:05 AM").
export const formatLoggedTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

// Header label for the date navigator ("Today" / "Yesterday" / "Mon, Jul 5, 2026").
export const formatViewingDate = (viewingDate: Date): string => {
  const viewingDateStr = getLocalDateString(viewingDate);
  const todayStr = getLocalDateString(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday);

  if (viewingDateStr === todayStr) return "Today";
  if (viewingDateStr === yesterdayStr) return "Yesterday";
  return viewingDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// Nutrition-card label for the viewing date ("Today's Nutrition", etc.).
export const getNutritionLabel = (viewingDate: Date): string => {
  const viewingDateStr = getLocalDateString(viewingDate);
  const todayStr = getLocalDateString(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday);

  if (viewingDateStr === todayStr) return "Today's Nutrition";
  if (viewingDateStr === yesterdayStr) return "Yesterday's Nutrition";
  return `${viewingDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}'s Nutrition`;
};
