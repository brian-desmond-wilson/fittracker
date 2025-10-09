"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { AddMealModal } from "./add-meal-modal";

export function AddMealButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
      >
        <Plus className="w-5 h-5" />
        <span>Add Meal</span>
      </button>

      <AddMealModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
