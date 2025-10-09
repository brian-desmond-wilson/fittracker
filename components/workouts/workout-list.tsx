import { Workout } from "@/types/database";
import { Flame, Clock, Calendar } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

interface WorkoutListProps {
  workouts: Workout[];
}

export function WorkoutList({ workouts }: WorkoutListProps) {
  return (
    <div className="space-y-3">
      {workouts.map((workout) => (
        <div
          key={workout.id}
          className="bg-gray-900 rounded-xl p-5 border border-gray-800 hover:border-gray-700 transition-colors"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">
                {workout.name}
              </h3>
              {workout.workout_type && (
                <span className="inline-block px-2 py-1 bg-primary/20 text-primary text-xs font-medium rounded-md capitalize">
                  {workout.workout_type}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            {workout.duration_minutes && (
              <div className="flex items-center gap-1.5 text-gray-400">
                <Clock className="w-4 h-4" />
                <span>{workout.duration_minutes} min</span>
              </div>
            )}
            {workout.calories_burned && (
              <div className="flex items-center gap-1.5 text-gray-400">
                <Flame className="w-4 h-4" />
                <span>{workout.calories_burned} cal</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-gray-400">
              <Calendar className="w-4 h-4" />
              <span>{formatDateTime(workout.completed_at)}</span>
            </div>
          </div>

          {workout.notes && (
            <p className="mt-3 text-sm text-gray-400 line-clamp-2">
              {workout.notes}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
