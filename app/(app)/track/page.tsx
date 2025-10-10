import { createClient } from "@/lib/supabase/server";
import { BackgroundLogo } from "@/components/ui/background-logo";
import { Plus } from "lucide-react";

export default async function TrackPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return (
    <div className="relative min-h-screen">
      <BackgroundLogo />

      <div className="relative z-10 max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Track</h1>
            <p className="text-gray-400 text-sm">Log your activities and meals</p>
          </div>
        </div>

        {/* Empty State */}
        <div className="bg-gray-900 rounded-2xl p-12 border border-gray-800 text-center">
          <Plus className="w-16 h-16 text-gray-700 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">
            Quick Tracking Coming Soon
          </h3>
          <p className="text-gray-400">
            This feature is under development. Soon you'll be able to quickly
            log workouts, meals, and other activities.
          </p>
        </div>
      </div>
    </div>
  );
}
