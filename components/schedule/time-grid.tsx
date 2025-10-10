"use client";

import { useEffect, useRef } from "react";

const HOUR_HEIGHT = 80; // Height in pixels for each hour
const HOURS = Array.from({ length: 24 }, (_, i) => (i + 5) % 24); // 5am-4am

export function TimeGrid() {
  const gridRef = useRef<HTMLDivElement>(null);

  // Scroll to current time on mount
  useEffect(() => {
    if (gridRef.current) {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();

      // Calculate offset from 5am
      let hoursFrom5am = hours - 5;
      if (hoursFrom5am < 0) hoursFrom5am += 24;

      const scrollPosition = (hoursFrom5am * HOUR_HEIGHT) + ((minutes / 60) * HOUR_HEIGHT) - 100;
      gridRef.current.scrollTop = Math.max(0, scrollPosition);
    }
  }, []);

  const formatHour = (hour: number) => {
    if (hour === 0) return "12 AM";
    if (hour === 12) return "12 PM";
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
  };

  return (
    <div
      ref={gridRef}
      className="flex-1 overflow-y-auto relative"
      style={{ height: "calc(100vh - 180px)" }}
    >
      <div className="relative" style={{ height: `${24 * HOUR_HEIGHT}px` }}>
        {HOURS.map((hour, index) => (
          <div
            key={hour}
            className="absolute left-0 right-0 border-t border-gray-800"
            style={{ top: `${index * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
          >
            {/* Hour label */}
            <div className="absolute -left-2 -top-3 text-xs text-gray-500 font-medium bg-gray-950 px-1">
              {formatHour(hour)}
            </div>

            {/* 15-minute interval lines */}
            <div className="absolute left-14 right-0 top-1/4 border-t border-gray-900" />
            <div className="absolute left-14 right-0 top-2/4 border-t border-gray-850" />
            <div className="absolute left-14 right-0 top-3/4 border-t border-gray-900" />
          </div>
        ))}
      </div>
    </div>
  );
}

export { HOUR_HEIGHT };
