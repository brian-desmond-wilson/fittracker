import { createClient } from "@/lib/supabase/server";
import { BackgroundLogo } from "@/components/ui/background-logo";
import { ProfileForm } from "@/components/profile/profile-form";
import { LogoutButton } from "@/components/profile/logout-button";
import { User, Mail, ShieldCheck } from "lucide-react";
import { DevTaskManager } from "@/components/profile/admin/dev-task-manager";
import type { DevTask } from "@/types/dev-task";
import { PushOptIn } from "@/components/notifications/push-opt-in";

export default async function ProfilePage() {
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

  let devTasks: DevTask[] = [];

  if (profile?.is_admin) {
    const { data: tasks } = await supabase
      .from("dev_tasks")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    devTasks = tasks ?? [];
  }

  return (
    <div className="relative min-h-screen">
      <BackgroundLogo />

      <div className="relative z-10 max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="pt-4">
          <h1 className="text-3xl font-bold text-white mb-1">Profile</h1>
          <p className="text-gray-400 text-sm">Manage your account and goals</p>
          {profile?.is_admin && (
            <div className="flex items-center gap-2 mt-3 text-sm text-primary">
              <ShieldCheck className="w-4 h-4" />
              <span>Administrator access</span>
            </div>
          )}
        </div>

        {/* Profile Card */}
        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">
                {profile?.full_name || "User"}
              </h2>
              <div className="flex items-center gap-2 text-gray-400 text-sm mt-1">
                <Mail className="w-4 h-4" />
                <span>{user.email}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-800">
            <div>
              <p className="text-sm text-gray-400">Member since</p>
              <p className="text-white font-medium">
                {new Date(user.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Goals & Settings */}
        <ProfileForm profile={profile} userId={user.id} />

        {profile?.is_admin && (
          <>
            <PushOptIn />
            <DevTaskManager initialTasks={devTasks} />
          </>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
