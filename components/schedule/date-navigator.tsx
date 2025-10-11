"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

interface DateNavigatorProps {
  currentDate: Date;
}

export function DateNavigator({ currentDate }: DateNavigatorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname() || "/schedule";
  const paramsKey = useMemo(() => searchParams?.toString() ?? "", [searchParams]);
  const [isNavigating, setIsNavigating] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    const params = new URLSearchParams(searchParams?.toString());
    params.set("date", dateStr);
    const query = params.toString();
    setIsNavigating(true);
    router.push(`${pathname}?${query}`);
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
    const params = new URLSearchParams(searchParams?.toString());
    params.delete("date");
    const query = params.toString();
    setIsNavigating(true);
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const isToday = () => {
    const today = new Date();
    return (
      currentDate.getFullYear() === today.getFullYear() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getDate() === today.getDate()
    );
  };

  useEffect(() => {
    if (isNavigating) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setIsNavigating(false);
        timeoutRef.current = null;
      }, 1500);
    }
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isNavigating]);

  useEffect(() => {
    if (isNavigating) {
      setIsNavigating(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, [paramsKey]);

  return (
    <div className="flex items-center gap-2">
      {isNavigating && (
        <div className="fixed top-0 left-0 right-0 h-[3px] bg-primary/20 overflow-hidden z-50">
          <div className="h-full w-full bg-primary animate-[topbar-slide_1s_linear_infinite]" />
        </div>
      )}
      <button
        onClick={goToPreviousDay}
        className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-800 rounded-lg transition-colors"
        aria-label="Previous day"
      >
        <ChevronLeft className="w-5 h-5 text-gray-400" />
      </button>

      {!isToday() && (
        <button
          onClick={goToToday}
          className="px-4 py-2.5 min-h-[44px] text-xs bg-primary/20 hover:bg-primary/30 text-primary rounded-md transition-colors"
        >
          Today
        </button>
      )}

      <button
        onClick={goToNextDay}
        className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-800 rounded-lg transition-colors"
        aria-label="Next day"
      >
        <ChevronRight className="w-5 h-5 text-gray-400" />
      </button>
    </div>
  );
}
