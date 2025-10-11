"use client";

import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

interface DateNavigatorProps {
  currentDate: Date;
}

export function DateNavigator({ currentDate }: DateNavigatorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const navigateToDate = (date: Date) => {
    const dateStr = date.toISOString().split("T")[0];
    router.push(`/app2/schedule?date=${dateStr}`);
  };

  const goToPreviousDay = () => {
    const prevDay = new Date(currentDate);
    prevDay.setDate(prevDay.getDate() - 1);
    navigateToDate(prevDay);
  };

  const goToNextDay = () => {
    const nextDay = new Date(currentDate);
    nextDay.setDate(nextDay.getDate() + 1);
    navigateToDate(nextDay);
  };

  const goToToday = () => {
    router.push("/app2/schedule");
  };

  const isToday = () => {
    const today = new Date();
    return (
      currentDate.getFullYear() === today.getFullYear() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getDate() === today.getDate()
    );
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={goToPreviousDay}
        className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
        aria-label="Previous day"
      >
        <ChevronLeft className="w-5 h-5 text-gray-400" />
      </button>

      {!isToday() && (
        <button
          onClick={goToToday}
          className="px-3 py-1 text-xs bg-primary/20 hover:bg-primary/30 text-primary rounded-md transition-colors"
        >
          Today
        </button>
      )}

      <button
        onClick={goToNextDay}
        className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
        aria-label="Next day"
      >
        <ChevronRight className="w-5 h-5 text-gray-400" />
      </button>
    </div>
  );
}
