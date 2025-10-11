"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { EventCategory } from "@/types/schedule";
import { Plus, Trash2, Check } from "lucide-react";
import * as LucideIcons from "lucide-react";

interface CategoryManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: EventCategory[];
}

const AVAILABLE_COLORS = [
  { name: "Green", value: "#22C55E" },
  { name: "Orange", value: "#F97316" },
  { name: "Blue", value: "#3B82F6" },
  { name: "Purple", value: "#8B5CF6" },
  { name: "Pink", value: "#EC4899" },
  { name: "Red", value: "#EF4444" },
  { name: "Yellow", value: "#EAB308" },
  { name: "Cyan", value: "#06B6D4" },
  { name: "Gray", value: "#6B7280" },
];

const AVAILABLE_ICONS = [
  "Utensils",
  "Dumbbell",
  "Dog",
  "Briefcase",
  "Heart",
  "Circle",
  "Book",
  "Coffee",
  "Music",
  "GameController",
  "ShoppingBag",
  "Car",
];

export function CategoryManager({
  open,
  onOpenChange,
  categories,
}: CategoryManagerProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [newCategory, setNewCategory] = useState({
    name: "",
    color: AVAILABLE_COLORS[0].value,
    icon: AVAILABLE_ICONS[0],
  });
  const [loading, setLoading] = useState(false);

  const userCategories = categories.filter((c) => !c.is_default);

  const handleCreate = async () => {
    if (!newCategory.name.trim()) return;

    setLoading(true);
    try {
      const response = await fetch("/app2/api/schedule/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCategory),
      });

      if (response.ok) {
        setNewCategory({
          name: "",
          color: AVAILABLE_COLORS[0].value,
          icon: AVAILABLE_ICONS[0],
        });
        setIsCreating(false);
        router.refresh();
      } else {
        alert("Failed to create category");
      }
    } catch (error) {
      console.error("Failed to create category:", error);
      alert("Failed to create category");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (categoryId: string) => {
    if (!confirm("Are you sure you want to delete this category?")) return;

    setLoading(true);
    try {
      const response = await fetch(`/app2/api/schedule/categories/${categoryId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        router.refresh();
      } else {
        alert("Failed to delete category");
      }
    } catch (error) {
      console.error("Failed to delete category:", error);
      alert("Failed to delete category");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-900 border-gray-800 max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-white">Manage Categories</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 -mx-6 px-6">
          <div className="space-y-3 pb-4">
            {/* Default Categories (Read-only) */}
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Default Categories</h3>
              <div className="space-y-2">
                {categories.filter((c) => c.is_default).map((category) => {
                  const IconComponent = category.icon
                    ? (LucideIcons as any)[category.icon]
                    : null;

                  return (
                    <div
                      key={category.id}
                      className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg"
                      style={{
                        borderLeftWidth: "3px",
                        borderLeftColor: category.color,
                      }}
                    >
                      {IconComponent && (
                        <IconComponent
                          className="w-4 h-4"
                          style={{ color: category.color }}
                        />
                      )}
                      <span className="text-sm text-white flex-1">{category.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* User Categories */}
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Custom Categories</h3>
              {userCategories.length === 0 ? (
                <p className="text-sm text-gray-600 py-4 text-center">
                  No custom categories yet
                </p>
              ) : (
                <div className="space-y-2">
                  {userCategories.map((category) => {
                    const IconComponent = category.icon
                      ? (LucideIcons as any)[category.icon]
                      : null;

                    return (
                      <div
                        key={category.id}
                        className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg group"
                        style={{
                          borderLeftWidth: "3px",
                          borderLeftColor: category.color,
                        }}
                      >
                        {IconComponent && (
                          <IconComponent
                            className="w-4 h-4"
                            style={{ color: category.color }}
                          />
                        )}
                        <span className="text-sm text-white flex-1">{category.name}</span>
                        <button
                          onClick={() => handleDelete(category.id)}
                          disabled={loading}
                          className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-900/20 rounded transition-all"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Create New Category */}
            {isCreating ? (
              <div className="space-y-3 p-4 bg-gray-800/30 rounded-lg">
                <div>
                  <Label htmlFor="category-name" className="text-gray-300">
                    Category Name
                  </Label>
                  <input
                    id="category-name"
                    type="text"
                    value={newCategory.name}
                    onChange={(e) =>
                      setNewCategory((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className="w-full mt-1.5 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., Study"
                    autoFocus
                  />
                </div>

                <div>
                  <Label className="text-gray-300">Color</Label>
                  <div className="flex gap-2 mt-2">
                    {AVAILABLE_COLORS.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() =>
                          setNewCategory((prev) => ({ ...prev, color: color.value }))
                        }
                        className="relative w-8 h-8 rounded-full transition-transform hover:scale-110"
                        style={{ backgroundColor: color.value }}
                      >
                        {newCategory.color === color.value && (
                          <Check className="w-4 h-4 text-gray-950 absolute inset-0 m-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-gray-300">Icon</Label>
                  <div className="grid grid-cols-6 gap-2 mt-2">
                    {AVAILABLE_ICONS.map((iconName) => {
                      const IconComponent = (LucideIcons as any)[iconName];
                      return (
                        <button
                          key={iconName}
                          type="button"
                          onClick={() =>
                            setNewCategory((prev) => ({ ...prev, icon: iconName }))
                          }
                          className={`p-2 rounded-lg transition-colors ${
                            newCategory.icon === iconName
                              ? "bg-primary text-gray-950"
                              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                          }`}
                        >
                          {IconComponent && <IconComponent className="w-5 h-5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setIsCreating(false)}
                    className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={loading || !newCategory.name.trim()}
                    className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-gray-950 font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loading ? "Creating..." : "Create"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center justify-center gap-2 p-3 bg-gray-800/30 hover:bg-gray-800/50 border-2 border-dashed border-gray-700 rounded-lg text-gray-400 hover:text-gray-300 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span className="font-medium">Add Custom Category</span>
              </button>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-gray-800">
          <button
            onClick={() => onOpenChange(false)}
            className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
