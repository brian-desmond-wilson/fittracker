import { createClient } from "@/lib/supabase/server";
import { BackgroundLogo } from "@/components/ui/background-logo";
import { StatCard } from "@/components/ui/stat-card";
import { Flame, Dumbbell, Droplets, TrendingDown } from "lucide-react";
import { startOfDay, endOfDay } from "date-fns";

async function getTodayStats(userId: string) {
  const supabase = await createClient();
  const today = new Date();
  const startDate = startOfDay(today).toISOString();
  const endDate = endOfDay(today).toISOString();

  // Get today's workouts
  const { data: workouts } = await supabase
    .from("workouts")
    .select("calories_burned, duration_minutes")
    .eq("user_id", userId)
    .gte("completed_at", startDate)
    .lte("completed_at", endDate);

  // Get today's nutrition
  const { data: nutrition } = await supabase
    .from("nutrition_logs")
    .select("calories")
    .eq("user_id", userId)
    .gte("logged_at", startDate)
    .lte("logged_at", endDate);

  // Get today's water
  const { data: water } = await supabase
    .from("water_logs")
    .select("amount_ml")
    .eq("user_id", userId)
    .gte("logged_at", startDate)
    .lte("logged_at", endDate);

  // Get latest weight
  const { data: latestWeight } = await supabase
    .from("weight_logs")
    .select("weight_kg")
    .eq("user_id", userId)
    .order("logged_at", { ascending: false })
    .limit(1)
    .single();

  const totalCaloriesBurned = workouts?.reduce((sum, w) => sum + (w.calories_burned || 0), 0) || 0;
  const totalWorkoutMinutes = workouts?.reduce((sum, w) => sum + (w.duration_minutes || 0), 0) || 0;
  const totalCaloriesConsumed = nutrition?.reduce((sum, n) => sum + (n.calories || 0), 0) || 0;
  const totalWaterMl = water?.reduce((sum, w) => sum + w.amount_ml, 0) || 0;

  return {
    caloriesBurned: totalCaloriesBurned,
    workoutMinutes: totalWorkoutMinutes,
    caloriesConsumed: totalCaloriesConsumed,
    waterLiters: (totalWaterMl / 1000).toFixed(1),
    currentWeight: latestWeight?.weight_kg || null,
    workoutCount: workouts?.length || 0,
  };
}

async function getRecentActivity(userId: string) {
  const supabase = await createClient();

  const { data: recentWorkouts } = await supabase
    .from("workouts")
    .select("*")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false })
    .limit(3);

  return recentWorkouts || [];
}

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const stats = await getTodayStats(user.id);
  const recentActivity = await getRecentActivity(user.id);

  return (
    <div className="relative min-h-screen">
      <BackgroundLogo />

      <div className="relative z-10 max-w-4xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="pt-4">
          <p className="text-gray-400 text-sm">Welcome back,</p>
          <h1 className="text-3xl font-bold text-white">
            {profile?.full_name || "Athlete"}
          </h1>
        </div>

        {/* Today's Stats */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Today's Summary</h2>
          <div className="grid grid-cols-2 gap-4">
            <StatCard
              title="Calories Burned"
              value={stats.caloriesBurned}
              subtitle={`${stats.workoutCount} workouts`}
              icon={Flame}
              iconColor="text-orange-500"
            />
            <StatCard
              title="Workout Time"
              value={`${stats.workoutMinutes}m`}
              subtitle="Minutes active"
              icon={Dumbbell}
              iconColor="text-primary"
            />
            <StatCard
              title="Calories Eaten"
              value={stats.caloriesConsumed}
              subtitle={profile?.target_calories ? `of ${profile.target_calories} goal` : "No goal set"}
              icon={Flame}
              iconColor="text-red-500"
            />
            <StatCard
              title="Water Intake"
              value={`${stats.waterLiters}L`}
              subtitle="Stay hydrated"
              icon={Droplets}
              iconColor="text-blue-500"
            />
          </div>
        </div>

        {/* Quick Stats */}
        {stats.currentWeight && (
          <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 mb-1">Current Weight</p>
                <p className="text-3xl font-bold text-white">{stats.currentWeight} kg</p>
              </div>
              <div className="p-4 rounded-xl bg-gray-800">
                <TrendingDown className="w-8 h-8 text-primary" />
              </div>
            </div>
            {profile?.target_weight_kg && (
              <div className="mt-4 pt-4 border-t border-gray-800">
                <p className="text-sm text-gray-400">
                  Goal: {profile.target_weight_kg} kg
                  <span className="ml-2 text-primary font-medium">
                    ({(stats.currentWeight - profile.target_weight_kg).toFixed(1)} kg to go)
                  </span>
                </p>
              </div>
            )}
          </div>
        )}

        {/* Recent Activity */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Recent Workouts</h2>
          {recentActivity.length > 0 ? (
            <div className="space-y-3">
              {recentActivity.map((workout) => (
                <div
                  key={workout.id}
                  className="bg-gray-900 rounded-xl p-4 border border-gray-800"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-white mb-1">
                        {workout.name}
                      </h3>
                      <p className="text-sm text-gray-400">
                        {workout.workout_type && (
                          <span className="capitalize">{workout.workout_type}</span>
                        )}
                        {workout.duration_minutes && (
                          <span className="ml-2">• {workout.duration_minutes} min</span>
                        )}
                        {workout.calories_burned && (
                          <span className="ml-2">• {workout.calories_burned} cal</span>
                        )}
                      </p>
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(workout.completed_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-900 rounded-xl p-8 border border-gray-800 text-center">
              <Dumbbell className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-400">No workouts yet</p>
              <p className="text-sm text-gray-500 mt-1">
                Start your first workout to see it here
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
