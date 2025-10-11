"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EventCategory } from "@/types/schedule";
import { TimeValue, from24HourString, to24HourString } from "./time-picker";

interface QuickAddModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: EventCategory[];
  prefilledTime?: { hour: number; minute: number };
  onEventCreated: (eventData: any) => void;
}

export function QuickAddModal({
  open,
  onOpenChange,
  categories,
  prefilledTime,
  onEventCreated,
}: QuickAddModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(false);

  // Calculate start and end times
  const { startValue, endValue } = useMemo(() => {
    const baseDate = new Date();
    if (prefilledTime) {
      baseDate.setHours(prefilledTime.hour, prefilledTime.minute, 0, 0);
    } else {
      baseDate.setSeconds(0, 0);
    }

    const startVal = from24HourString(
      `${baseDate.getHours().toString().padStart(2, "0")}:${baseDate
        .getMinutes()
        .toString()
        .padStart(2, "0")}`,
    );

    const endDate = new Date(baseDate.getTime() + 30 * 60000);
    const endVal = from24HourString(
      `${endDate.getHours().toString().padStart(2, "0")}:${endDate
        .getMinutes()
        .toString()
        .padStart(2, "0")}`,
    );

    return { startValue: startVal, endValue: endVal };
  }, [prefilledTime, open]);

  const formatDisplayTime = (value: TimeValue) =>
    `${value.hour}:${value.minute.toString().padStart(2, "0")} ${value.meridiem}`;

  const displayTimeRange = `${formatDisplayTime(startValue)} - ${formatDisplayTime(
    endValue,
  )}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const eventData = {
        title,
        category_id: categoryId,
        start_time: `${to24HourString(startValue)}:00`,
        end_time: `${to24HourString(endValue)}:00`,
        date: new Date().toISOString().split("T")[0],
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

      const data = await response.json();
      onEventCreated(data);
      setTitle("");
      setCategoryId("");
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to create event:", error);
      alert("Failed to create event");
    } finally {
      setLoading(false);
    }
  };

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setTitle("");
      setCategoryId("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-900 border-gray-800 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white">Quick Add Event</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Time Display */}
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">
              {displayTimeRange}
            </div>
            <div className="text-xs text-gray-500 mt-1">30 minutes</div>
          </div>

          {/* Title */}
          <div>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white text-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Event title..."
            />
          </div>

          {/* Category */}
          <div>
            <select
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select category...</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 bg-primary hover:bg-primary/90 text-gray-950 font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "Adding..." : "Add"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
