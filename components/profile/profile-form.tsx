"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Profile } from "@/types/database";

interface ProfileFormProps {
  profile: Profile | null;
  userId: string;
}

export function ProfileForm({ profile, userId }: ProfileFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    full_name: profile?.full_name || "",
    height_cm: profile?.height_cm?.toString() || "",
    target_weight_kg: profile?.target_weight_kg?.toString() || "",
    target_calories: profile?.target_calories?.toString() || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const supabase = createClient();

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: formData.full_name || null,
          height_cm: formData.height_cm ? parseFloat(formData.height_cm) : null,
          target_weight_kg: formData.target_weight_kg
            ? parseFloat(formData.target_weight_kg)
            : null,
          target_calories: formData.target_calories
            ? parseInt(formData.target_calories)
            : null,
        })
        .eq("id", userId);

      if (updateError) throw updateError;

      setSuccess(true);
      router.refresh();

      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
      <h2 className="text-xl font-semibold text-white mb-4">
        Personal Information & Goals
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Full Name
          </label>
          <input
            type="text"
            value={formData.full_name}
            onChange={(e) =>
              setFormData({ ...formData, full_name: e.target.value })
            }
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="John Doe"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Height (cm)
            </label>
            <input
              type="number"
              step="0.1"
              value={formData.height_cm}
              onChange={(e) =>
                setFormData({ ...formData, height_cm: e.target.value })
              }
              min="0"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="175"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Target Weight (kg)
            </label>
            <input
              type="number"
              step="0.1"
              value={formData.target_weight_kg}
              onChange={(e) =>
                setFormData({ ...formData, target_weight_kg: e.target.value })
              }
              min="0"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="70"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Daily Calorie Goal
          </label>
          <input
            type="number"
            value={formData.target_calories}
            onChange={(e) =>
              setFormData({ ...formData, target_calories: e.target.value })
            }
            min="0"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="2000"
          />
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-3">
            <p className="text-sm text-green-400">Profile updated successfully!</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </div>
  );
}
