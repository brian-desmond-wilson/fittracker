"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScheduleEvent, EventCategory } from "@/types/schedule";

interface EditEventModalProps {
  event: ScheduleEvent | null;
  categories: EventCategory[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditEventModal({
  event,
  categories,
  open,
  onOpenChange,
}: EditEventModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    category_id: "",
    start_time: "09:00",
    end_time: "09:30",
    is_recurring: false,
    recurrence_days: [] as number[],
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  // Initialize form when event changes
  useEffect(() => {
    if (event) {
      setFormData({
        title: event.title,
        category_id: event.category_id || "",
        start_time: event.start_time.substring(0, 5), // HH:MM
        end_time: event.end_time.substring(0, 5), // HH:MM
        is_recurring: event.is_recurring,
        recurrence_days: event.recurrence_days || [],
        date: event.date || new Date().toISOString().split("T")[0],
        notes: event.notes || "",
      });
    }
  }, [event]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;

    setLoading(true);

    try {
      const response = await fetch(`/app2/api/schedule/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          category_id: formData.category_id,
          start_time: formData.start_time + ":00",
          end_time: formData.end_time + ":00",
          is_recurring: formData.is_recurring,
          date: formData.is_recurring ? null : formData.date,
          recurrence_days:
            formData.is_recurring && formData.recurrence_days.length === 0
              ? null
              : formData.recurrence_days,
          notes: formData.notes,
        }),
      });

      if (response.ok) {
        onOpenChange(false);
        router.refresh();
      } else {
        alert("Failed to update event");
      }
    } catch (error) {
      console.error("Failed to update event:", error);
      alert("Failed to update event");
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (day: number) => {
    setFormData((prev) => ({
      ...prev,
      recurrence_days: prev.recurrence_days.includes(day)
        ? prev.recurrence_days.filter((d) => d !== day)
        : [...prev.recurrence_days, day],
    }));
  };

  const days = [
    { label: "S", value: 0 },
    { label: "M", value: 1 },
    { label: "T", value: 2 },
    { label: "W", value: 3 },
    { label: "T", value: 4 },
    { label: "F", value: 5 },
    { label: "S", value: 6 },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-900 border-gray-800 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Edit Event</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Title */}
          <div>
            <Label htmlFor="title" className="text-gray-300">
              Event Title
            </Label>
            <input
              id="title"
              type="text"
              required
              value={formData.title}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, title: e.target.value }))
              }
              className="w-full mt-1.5 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., Breakfast"
            />
          </div>

          {/* Category */}
          <div>
            <Label htmlFor="category" className="text-gray-300">
              Category
            </Label>
            <select
              id="category"
              required
              value={formData.category_id}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, category_id: e.target.value }))
              }
              className="w-full mt-1.5 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select a category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Time Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start_time" className="text-gray-300">
                Start Time
              </Label>
              <input
                id="start_time"
                type="time"
                required
                value={formData.start_time}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    start_time: e.target.value,
                  }))
                }
                className="w-full mt-1.5 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                step="900"
              />
            </div>
            <div>
              <Label htmlFor="end_time" className="text-gray-300">
                End Time
              </Label>
              <input
                id="end_time"
                type="time"
                required
                value={formData.end_time}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, end_time: e.target.value }))
                }
                className="w-full mt-1.5 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                step="900"
              />
            </div>
          </div>

          {/* Recurring Toggle */}
          <div className="flex items-center gap-2">
            <input
              id="is_recurring"
              type="checkbox"
              checked={formData.is_recurring}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  is_recurring: e.target.checked,
                }))
              }
              className="w-4 h-4 text-primary bg-gray-800 border-gray-700 rounded focus:ring-primary"
            />
            <Label htmlFor="is_recurring" className="text-gray-300">
              Recurring Event
            </Label>
          </div>

          {/* Recurrence Days */}
          {formData.is_recurring && (
            <div>
              <Label className="text-gray-300 mb-2 block">
                Repeat On (leave empty for daily)
              </Label>
              <div className="flex gap-2">
                {days.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    className={`w-10 h-10 rounded-full font-medium transition-colors ${
                      formData.recurrence_days.includes(day.value)
                        ? "bg-primary text-gray-950"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Date (for one-time events) */}
          {!formData.is_recurring && (
            <div>
              <Label htmlFor="date" className="text-gray-300">
                Date
              </Label>
              <input
                id="date"
                type="date"
                required
                value={formData.date}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, date: e.target.value }))
                }
                className="w-full mt-1.5 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <Label htmlFor="notes" className="text-gray-300">
              Notes (optional)
            </Label>
            <textarea
              id="notes"
              rows={3}
              value={formData.notes}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, notes: e.target.value }))
              }
              className="w-full mt-1.5 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Add any additional details..."
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-gray-950 font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
