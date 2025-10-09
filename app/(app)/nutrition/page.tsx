import { createClient } from "@/lib/supabase/server";
import { BackgroundLogo } from "@/components/ui/background-logo";
import { StatCard } from "@/components/ui/stat-card";
import { NutritionList } from "@/components/nutrition/nutrition-list";
import { AddMealButton } from "@/components/nutrition/add-meal-button";
import { AddWaterButton } from "@/components/nutrition/add-water-button";
import { Apple, Flame, Droplets } from "lucide-react";
import { startOfDay, endOfDay } from "date-fns";

async function getTodayNutrition(userId: string) {
  const supabase = await createClient();
  const today = new Date();
  const startDate = startOfDay(today).toISOString();
  const endDate = endOfDay(today).toISOString();

  // Get today's nutrition
  const { data: meals } = await supabase
    .from("nutrition_logs")
    .select("*")
    .eq("user_id", userId)
    .gte("logged_at", startDate)
    .lte("logged_at", endDate)
    .order("logged_at", { ascending: false });

  // Get today's water
  const { data: water } = await supabase
    .from("water_logs")
    .select("amount_ml")
    .eq("user_id", userId)
    .gte("logged_at", startDate)
    .lte("logged_at", endDate);

  const totalCalories = meals?.reduce((sum, m) => sum + (m.calories || 0), 0) || 0;
  const totalProtein = meals?.reduce((sum, m) => sum + (m.protein_g || 0), 0) || 0;
  const totalCarbs = meals?.reduce((sum, m) => sum + (m.carbs_g || 0), 0) || 0;
  const totalFat = meals?.reduce((sum, m) => sum + (m.fat_g || 0), 0) || 0;
  const totalWaterMl = water?.reduce((sum, w) => sum + w.amount_ml, 0) || 0;

  return {
    meals: meals || [],
    totalCalories,
    totalProtein,
    totalCarbs,
    totalFat,
    waterLiters: (totalWaterMl / 1000).toFixed(1),
  };
}

export default async function NutritionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("target_calories")
    .eq("id", user.id)
    .single();

  const nutrition = await getTodayNutrition(user.id);

  return (
    <div className="relative min-h-screen">
      <BackgroundLogo />

      <div className="relative z-10 max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Nutrition</h1>
            <p className="text-gray-400 text-sm">Track your meals and hydration</p>
          </div>
          <div className="flex gap-2">
            <AddWaterButton />
            <AddMealButton />
          </div>
        </div>

        {/* Today's Summary */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Today's Total</h2>
          <div className="grid grid-cols-2 gap-4">
            <StatCard
              title="Calories"
              value={nutrition.totalCalories}
              subtitle={
                profile?.target_calories
                  ? `of ${profile.target_calories} goal`
                  : "No goal set"
              }
              icon={Flame}
              iconColor="text-orange-500"
            />
            <StatCard
              title="Water"
              value={`${nutrition.waterLiters}L`}
              subtitle="Stay hydrated"
              icon={Droplets}
              iconColor="text-blue-500"
            />
            <StatCard
              title="Protein"
              value={`${nutrition.totalProtein.toFixed(0)}g`}
              icon={Apple}
              iconColor="text-red-500"
            />
            <StatCard
              title="Carbs"
              value={`${nutrition.totalCarbs.toFixed(0)}g`}
              icon={Apple}
              iconColor="text-yellow-500"
            />
          </div>
        </div>

        {/* Meals List */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Today's Meals</h2>
          {nutrition.meals.length > 0 ? (
            <NutritionList meals={nutrition.meals} />
          ) : (
            <div className="bg-gray-900 rounded-2xl p-12 border border-gray-800 text-center">
              <Apple className="w-16 h-16 text-gray-700 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">
                No meals logged yet
              </h3>
              <p className="text-gray-400 mb-6">
                Start tracking your nutrition today
              </p>
              <AddMealButton />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
