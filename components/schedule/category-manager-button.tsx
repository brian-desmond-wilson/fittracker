"use client";

import { useState } from "react";
import { CategoryManager } from "./category-manager";
import { EventCategory } from "@/types/schedule";
import { Settings } from "lucide-react";

interface CategoryManagerButtonProps {
  categories: EventCategory[];
}

export function CategoryManagerButton({ categories }: CategoryManagerButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
        aria-label="Manage categories"
      >
        <Settings className="w-5 h-5 text-gray-400" />
      </button>
      <CategoryManager open={open} onOpenChange={setOpen} categories={categories} />
    </>
  );
}
