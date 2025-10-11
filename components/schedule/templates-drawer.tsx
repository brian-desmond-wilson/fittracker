"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EventTemplate, EventCategory } from "@/types/schedule";
import * as LucideIcons from "lucide-react";
import { Clock, Zap } from "lucide-react";

interface TemplatesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: EventTemplate[];
  categories: EventCategory[];
  onTemplateSelect: (template: EventTemplate) => void;
}

export function TemplatesDrawer({
  open,
  onOpenChange,
  templates,
  categories,
  onTemplateSelect,
}: TemplatesDrawerProps) {
  const [loading, setLoading] = useState(false);

  const handleTemplateClick = async (template: EventTemplate) => {
    setLoading(true);
    try {
      // Calculate start and end times based on current time
      const now = new Date();
      const roundedMinutes = Math.ceil(now.getMinutes() / 15) * 15;
      now.setMinutes(roundedMinutes);
      now.setSeconds(0);

      const startHours = now.getHours();
      const startMinutes = now.getMinutes();

      // Add duration to get end time
      const endDate = new Date(now.getTime() + template.default_duration_minutes * 60000);
      const endHours = endDate.getHours();
      const endMinutes = endDate.getMinutes();

      const eventData = {
        title: template.title,
        category_id: template.category_id,
        start_time: `${startHours.toString().padStart(2, "0")}:${startMinutes.toString().padStart(2, "0")}:00`,
        end_time: `${endHours.toString().padStart(2, "0")}:${endMinutes.toString().padStart(2, "0")}:00`,
        date: now.toISOString().split("T")[0],
        is_recurring: false,
        recurrence_days: null,
        notes: "",
      };

      const response = await fetch("/app2/api/schedule/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(`Failed to create event: ${errorData.error || "Unknown error"}`);
        return;
      }

      onTemplateSelect(template);
      onOpenChange(false);
      window.location.reload();
    } catch (error) {
      console.error("Failed to create event from template:", error);
      alert("Failed to create event");
    } finally {
      setLoading(false);
    }
  };

  // Group templates by category
  const templatesByCategory = templates.reduce((acc, template) => {
    const categoryId = template.category_id || "uncategorized";
    if (!acc[categoryId]) acc[categoryId] = [];
    acc[categoryId].push(template);
    return acc;
  }, {} as Record<string, EventTemplate[]>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-900 border-gray-800 max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Quick Templates
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 -mx-6 px-6">
          <div className="space-y-4 pb-4">
            {Object.entries(templatesByCategory).map(([categoryId, categoryTemplates]) => {
              const category = categories.find((c) => c.id === categoryId);
              const IconComponent = category?.icon
                ? (LucideIcons as any)[category.icon]
                : null;

              return (
                <div key={categoryId}>
                  {/* Category Header */}
                  {category && (
                    <div className="flex items-center gap-2 mb-2 px-2">
                      {IconComponent && (
                        <IconComponent
                          className="w-4 h-4"
                          style={{ color: category.color }}
                        />
                      )}
                      <h3 className="text-sm font-medium text-gray-400">
                        {category.name}
                      </h3>
                    </div>
                  )}

                  {/* Templates Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {categoryTemplates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => handleTemplateClick(template)}
                        disabled={loading}
                        className="group relative p-4 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-lg transition-all disabled:opacity-50 text-left"
                        style={{
                          borderLeftWidth: "3px",
                          borderLeftColor: category?.color || "#6B7280",
                        }}
                      >
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-medium text-white truncate">
                            {template.title}
                          </span>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            <span>{template.default_duration_minutes} min</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pt-4 border-t border-gray-800">
          <button
            onClick={() => onOpenChange(false)}
            className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
