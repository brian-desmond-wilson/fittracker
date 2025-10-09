import { createClient } from "@/lib/supabase/server";
import { BackgroundLogo } from "@/components/ui/background-logo";
import { StatCard } from "@/components/ui/stat-card";
import { WeightChart } from "@/components/progress/weight-chart";
import { AddWeightButton } from "@/components/progress/add-weight-button";
import { TrendingDown, Scale, Target } from "lucide-react";

async function getWeightLogs(userId: string) {
  const supabase = await createClient();

  const { data: weights } = await supabase
    .from("weight_logs")
    .select("*")
    .eq("user_id", userId)
    .order("logged_at", { ascending: true });

  return weights || [];
}

function calculateStats(
  weights: Array<{ weight_kg: number }>,
  targetWeight?: number | null
) {
  if (weights.length === 0)
    return {
      current: null,
      starting: null,
      change: null,
      remaining: null,
    };

  const current = weights[weights.length - 1].weight_kg;
  const starting = weights[0].weight_kg;
  const change = current - starting;
  const remaining = targetWeight ? current - targetWeight : null;

  return { current, starting, change, remaining };
}

export default async function ProgressPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("target_weight_kg")
    .eq("id", user.id)
    .single();

  const weightLogs = await getWeightLogs(user.id);
  const stats = calculateStats(weightLogs, profile?.target_weight_kg);

  return (
    <div className="relative min-h-screen">
      <BackgroundLogo />

      <div className="relative z-10 max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Progress</h1>
            <p className="text-gray-400 text-sm">Track your fitness journey</p>
          </div>
          <AddWeightButton />
        </div>

        {/* Stats */}
        {stats.current && (
          <div className="grid grid-cols-2 gap-4">
            <StatCard
              title="Current Weight"
              value={`${stats.current} kg`}
              icon={Scale}
              iconColor="text-primary"
            />
            <StatCard
              title="Starting Weight"
              value={`${stats.starting} kg`}
              icon={TrendingDown}
              iconColor="text-blue-500"
            />
            {stats.change !== null && (
              <StatCard
                title="Total Change"
                value={`${stats.change > 0 ? "+" : ""}${stats.change.toFixed(1)} kg`}
                subtitle={stats.change < 0 ? "Lost" : "Gained"}
                icon={TrendingDown}
                iconColor={stats.change < 0 ? "text-green-500" : "text-orange-500"}
              />
            )}
            {stats.remaining !== null && profile?.target_weight_kg && (
              <StatCard
                title="To Goal"
                value={`${Math.abs(stats.remaining).toFixed(1)} kg`}
                subtitle={`Target: ${profile.target_weight_kg} kg`}
                icon={Target}
                iconColor="text-yellow-500"
              />
            )}
          </div>
        )}

        {/* Weight Chart */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Weight History</h2>
          {weightLogs.length > 0 ? (
            <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
              <WeightChart
                data={weightLogs}
                targetWeight={profile?.target_weight_kg}
              />
            </div>
          ) : (
            <div className="bg-gray-900 rounded-2xl p-12 border border-gray-800 text-center">
              <Scale className="w-16 h-16 text-gray-700 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">
                No weight logs yet
              </h3>
              <p className="text-gray-400 mb-6">
                Start tracking your weight to see your progress
              </p>
              <AddWeightButton />
            </div>
          )}
        </div>

        {/* Weight History List */}
        {weightLogs.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Recent Logs</h2>
            <div className="space-y-2">
              {weightLogs
                .slice()
                .reverse()
                .slice(0, 10)
                .map((log, index) => {
                  const prevLog = weightLogs[weightLogs.length - 2 - index];
                  const change = prevLog
                    ? log.weight_kg - prevLog.weight_kg
                    : null;

                  return (
                    <div
                      key={log.id}
                      className="bg-gray-900 rounded-lg p-4 border border-gray-800 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-semibold text-white">
                          {log.weight_kg} kg
                        </p>
                        <p className="text-sm text-gray-400">
                          {new Date(log.logged_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      {change !== null && (
                        <span
                          className={`text-sm font-medium ${
                            change < 0 ? "text-green-500" : "text-orange-500"
                          }`}
                        >
                          {change > 0 ? "+" : ""}
                          {change.toFixed(1)} kg
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
