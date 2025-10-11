"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { EventCategory } from "@/types/schedule";
import {
  TimePicker,
  TimeValue,
  to24HourString,
  from24HourString,
} from "./time-picker";

interface AddEventModalProps {
  categories: EventCategory[];
}

const DEFAULT_START: TimeValue = from24HourString("09:00");
const DEFAULT_END: TimeValue = from24HourString("09:30");

const createInitialFormState = () => ({
  title: "",
  category_id: "",
  start_time: { ...DEFAULT_START },
  end_time: { ...DEFAULT_END },
  is_recurring: false,
  recurrence_days: [] as number[],
  date: new Date().toISOString().split("T")[0],
  notes: "",
});

export function AddEventModal({ categories }: AddEventModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(() => createInitialFormState());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        ...formData,
        start_time: `${to24HourString(formData.start_time)}:00`,
        end_time: `${to24HourString(formData.end_time)}:00`,
        date: formData.is_recurring ? null : formData.date,
        recurrence_days: formData.is_recurring && formData.recurrence_days.length === 0
          ? null
          : formData.recurrence_days,
      };

      const response = await fetch("/app2/api/schedule/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(`Failed to create event: ${errorData.error || "Unknown error"}`);
        return;
      }

      setOpen(false);
      setFormData(createInitialFormState());

      router.refresh();
    } catch (error) {
      console.error("Failed to create event:", error);
      alert("Failed to create event. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (day: number) => {
    setFormData(prev => ({
      ...prev,
      recurrence_days: prev.recurrence_days.includes(day)
        ? prev.recurrence_days.filter(d => d !== day)
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-800 rounded-lg transition-colors"
          aria-label="Add event"
        >
          <Plus className="w-5 h-5 text-gray-400" />
        </button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-800 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Add New Event</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Title */}
          <div>
            <Label htmlFor="title" className="text-gray-300">Event Title</Label>
            <input
              id="title"
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className="w-full mt-1.5 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., Breakfast"
            />
          </div>

          {/* Category */}
          <div>
            <Label htmlFor="category" className="text-gray-300">Category</Label>
            <select
              id="category"
              required
              value={formData.category_id}
              onChange={(e) => setFormData(prev => ({ ...prev, category_id: e.target.value }))}
              className="w-full mt-1.5 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select a category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Time Range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TimePicker
              id="start_time"
              label="Start Time"
              value={formData.start_time}
              onChange={(value) =>
                setFormData((prev) => ({ ...prev, start_time: value }))
              }
            />
            <TimePicker
              id="end_time"
              label="End Time"
              value={formData.end_time}
              onChange={(value) =>
                setFormData((prev) => ({ ...prev, end_time: value }))
              }
            />
          </div>

          {/* Recurring Toggle */}
          <div className="flex items-center gap-2">
            <input
              id="is_recurring"
              type="checkbox"
              checked={formData.is_recurring}
              onChange={(e) => setFormData(prev => ({ ...prev, is_recurring: e.target.checked }))}
              className="w-4 h-4 text-primary bg-gray-800 border-gray-700 rounded focus:ring-primary"
            />
            <Label htmlFor="is_recurring" className="text-gray-300">Recurring Event</Label>
          </div>

          {/* Recurrence Days */}
          {formData.is_recurring && (
            <div>
              <Label className="text-gray-300 mb-2 block">Repeat On</Label>

              {/* Quick patterns */}
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, recurrence_days: [] }))}
                  className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                    formData.recurrence_days.length === 0
                      ? "bg-primary text-gray-950"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  Daily
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, recurrence_days: [1, 2, 3, 4, 5] }))}
                  className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                    JSON.stringify(formData.recurrence_days.sort()) === JSON.stringify([1,2,3,4,5])
                      ? "bg-primary text-gray-950"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  Weekdays
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, recurrence_days: [0, 6] }))}
                  className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                    JSON.stringify(formData.recurrence_days.sort()) === JSON.stringify([0,6])
                      ? "bg-primary text-gray-950"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  Weekends
                </button>
              </div>

              {/* Individual days */}
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
              <Label htmlFor="date" className="text-gray-300">Date</Label>
              <input
                id="date"
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                className="w-full mt-1.5 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <Label htmlFor="notes" className="text-gray-300">Notes (optional)</Label>
            <textarea
              id="notes"
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className="w-full mt-1.5 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Add any additional details..."
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-gray-950 font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Event"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
