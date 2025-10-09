import { NutritionLog } from "@/types/database";
import { formatTime } from "@/lib/utils";

interface NutritionListProps {
  meals: NutritionLog[];
}

const mealTypeEmoji: Record<string, string> = {
  breakfast: "🌅",
  lunch: "☀️",
  dinner: "🌙",
  snack: "🍿",
};

export function NutritionList({ meals }: NutritionListProps) {
  // Group meals by type
  const groupedMeals = meals.reduce((acc, meal) => {
    if (!acc[meal.meal_type]) {
      acc[meal.meal_type] = [];
    }
    acc[meal.meal_type].push(meal);
    return acc;
  }, {} as Record<string, NutritionLog[]>);

  return (
    <div className="space-y-4">
      {Object.entries(groupedMeals).map(([mealType, mealsList]) => (
        <div key={mealType} className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide flex items-center gap-2">
            <span>{mealTypeEmoji[mealType]}</span>
            <span>{mealType}</span>
          </h3>
          <div className="space-y-2">
            {mealsList.map((meal) => (
              <div
                key={meal.id}
                className="bg-gray-900 rounded-lg p-4 border border-gray-800"
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium text-white">{meal.food_name}</h4>
                  <span className="text-xs text-gray-500">
                    {formatTime(meal.logged_at)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                  {meal.calories && (
                    <span className="font-medium text-orange-400">
                      {meal.calories} cal
                    </span>
                  )}
                  {meal.protein_g && (
                    <span>
                      <span className="text-gray-500">Protein:</span>{" "}
                      {meal.protein_g}g
                    </span>
                  )}
                  {meal.carbs_g && (
                    <span>
                      <span className="text-gray-500">Carbs:</span> {meal.carbs_g}g
                    </span>
                  )}
                  {meal.fat_g && (
                    <span>
                      <span className="text-gray-500">Fat:</span> {meal.fat_g}g
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
