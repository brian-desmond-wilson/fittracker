"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { X } from "lucide-react";
import { MealType } from "@/types/database";

interface AddMealModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddMealModal({ isOpen, onClose }: AddMealModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    meal_type: "breakfast" as MealType,
    food_name: "",
    calories: "",
    protein_g: "",
    carbs_g: "",
    fat_g: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Not authenticated");

      const { error: insertError } = await supabase.from("nutrition_logs").insert({
        user_id: user.id,
        meal_type: formData.meal_type,
        food_name: formData.food_name,
        calories: formData.calories ? parseInt(formData.calories) : null,
        protein_g: formData.protein_g ? parseFloat(formData.protein_g) : null,
        carbs_g: formData.carbs_g ? parseFloat(formData.carbs_g) : null,
        fat_g: formData.fat_g ? parseFloat(formData.fat_g) : null,
      });

      if (insertError) throw insertError;

      // Reset form
      setFormData({
        meal_type: "breakfast",
        food_name: "",
        calories: "",
        protein_g: "",
        carbs_g: "",
        fat_g: "",
      });

      router.refresh();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to add meal");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-xl font-bold text-white">Add Meal</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Meal Type
            </label>
            <select
              value={formData.meal_type}
              onChange={(e) =>
                setFormData({ ...formData, meal_type: e.target.value as MealType })
              }
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Food Name *
            </label>
            <input
              type="text"
              value={formData.food_name}
              onChange={(e) =>
                setFormData({ ...formData, food_name: e.target.value })
              }
              required
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Chicken and rice"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Calories
            </label>
            <input
              type="number"
              value={formData.calories}
              onChange={(e) =>
                setFormData({ ...formData, calories: e.target.value })
              }
              min="0"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Protein (g)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.protein_g}
                onChange={(e) =>
                  setFormData({ ...formData, protein_g: e.target.value })
                }
                min="0"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="30"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Carbs (g)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.carbs_g}
                onChange={(e) =>
                  setFormData({ ...formData, carbs_g: e.target.value })
                }
                min="0"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Fat (g)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.fat_g}
                onChange={(e) =>
                  setFormData({ ...formData, fat_g: e.target.value })
                }
                min="0"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="15"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Adding..." : "Add Meal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
