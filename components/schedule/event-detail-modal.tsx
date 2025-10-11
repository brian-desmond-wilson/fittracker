"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScheduleEvent, EventCategory } from "@/types/schedule";
import { Check, X, Clock, Pencil, Trash2, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import * as LucideIcons from "lucide-react";

interface EventDetailModalProps {
  event: ScheduleEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (event: ScheduleEvent) => void;
}

export function EventDetailModal({
  event,
  open,
  onOpenChange,
  onEdit,
}: EventDetailModalProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  if (!event) return null;

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours);
    const ampm = h >= 12 ? "PM" : "AM";
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Recurring Event";
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatRecurrence = () => {
    if (!event.is_recurring) return null;
    if (!event.recurrence_days || event.recurrence_days.length === 0) {
      return "Daily";
    }
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return event.recurrence_days
      .sort()
      .map((d) => dayNames[d])
      .join(", ");
  };

  const IconComponent = event.category?.icon
    ? (LucideIcons as any)[event.category.icon]
    : null;

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this event?")) return;

    setDeleting(true);
    try {
      const response = await fetch(`/app2/api/schedule/events/${event.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        onOpenChange(false);
        router.refresh();
      } else {
        alert("Failed to delete event");
      }
    } catch (error) {
      console.error("Failed to delete event:", error);
      alert("Failed to delete event");
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async (
    newStatus: "pending" | "in_progress" | "completed" | "cancelled"
  ) => {
    setUpdatingStatus(true);
    try {
      const response = await fetch(`/app2/api/schedule/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        router.refresh();
      } else {
        alert("Failed to update status");
      }
    } catch (error) {
      console.error("Failed to update status:", error);
      alert("Failed to update status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <Check className="w-4 h-4" />;
      case "cancelled":
        return <X className="w-4 h-4" />;
      case "in_progress":
        return <Clock className="w-4 h-4" />;
      default:
        return <Calendar className="w-4 h-4" />;
    }
  };

  const statusOptions = [
    { value: "pending", label: "Pending" },
    { value: "in_progress", label: "In Progress" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-900 border-gray-800 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-3">
            {IconComponent && (
              <IconComponent
                className="w-5 h-5"
                style={{ color: event.category?.color }}
              />
            )}
            <span className="flex-1">{event.title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Category */}
          {event.category && (
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: event.category.color }}
              />
              <span className="text-sm text-gray-300">{event.category.name}</span>
            </div>
          )}

          {/* Time */}
          <div className="flex items-center gap-2 text-gray-300">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="text-sm">
              {formatTime(event.start_time)} - {formatTime(event.end_time)}
            </span>
          </div>

          {/* Date or Recurrence */}
          <div className="flex items-center gap-2 text-gray-300">
            <Calendar className="w-4 h-4 text-gray-500" />
            <div className="text-sm">
              <div>{formatDate(event.date)}</div>
              {event.is_recurring && (
                <div className="text-xs text-gray-500 mt-1">
                  Repeats: {formatRecurrence()}
                </div>
              )}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="text-xs text-gray-500 mb-2 block">Status</label>
            <div className="grid grid-cols-2 gap-2">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleStatusChange(option.value)}
                  disabled={updatingStatus || event.status === option.value}
                  className={cn(
                    "flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    event.status === option.value
                      ? "bg-primary text-gray-950"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700",
                    updatingStatus && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {getStatusIcon(option.value)}
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          {event.notes && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Notes</label>
              <p className="text-sm text-gray-300 bg-gray-800/50 rounded-lg p-3">
                {event.notes}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-800">
            <button
              onClick={() => {
                onEdit(event);
                onOpenChange(false);
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
            >
              <Pencil className="w-4 h-4" />
              Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-900/20 hover:bg-red-900/30 text-red-400 font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
