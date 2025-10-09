import { createClient } from "@/lib/supabase/server";
import { BackgroundLogo } from "@/components/ui/background-logo";
import { WorkoutList } from "@/components/workouts/workout-list";
import { AddWorkoutButton } from "@/components/workouts/add-workout-button";
import { Dumbbell } from "lucide-react";

async function getWorkouts(userId: string) {
  const supabase = await createClient();

  const { data: workouts } = await supabase
    .from("workouts")
    .select("*")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false });

  return workouts || [];
}

export default async function WorkoutsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const workouts = await getWorkouts(user.id);

  return (
    <div className="relative min-h-screen">
      <BackgroundLogo />

      <div className="relative z-10 max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Workouts</h1>
            <p className="text-gray-400 text-sm">Track your training sessions</p>
          </div>
          <AddWorkoutButton />
        </div>

        {/* Workouts List */}
        {workouts.length > 0 ? (
          <WorkoutList workouts={workouts} />
        ) : (
          <div className="bg-gray-900 rounded-2xl p-12 border border-gray-800 text-center">
            <Dumbbell className="w-16 h-16 text-gray-700 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No workouts yet</h3>
            <p className="text-gray-400 mb-6">
              Start logging your workouts to track your progress
            </p>
            <AddWorkoutButton />
          </div>
        )}
      </div>
    </div>
  );
}
