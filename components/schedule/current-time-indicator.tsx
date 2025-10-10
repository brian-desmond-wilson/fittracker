"use client";

import { useEffect, useState } from "react";
import { HOUR_HEIGHT } from "./time-grid";

export function CurrentTimeIndicator() {
  const [position, setPosition] = useState(0);
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const updatePosition = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();

      // Calculate hours from 5am
      let hoursFrom5am = hours - 5;
      if (hoursFrom5am < 0) hoursFrom5am += 24;

      // Calculate position in pixels
      const pos = (hoursFrom5am * HOUR_HEIGHT) + ((minutes / 60) * HOUR_HEIGHT);
      setPosition(pos);

      // Format current time
      const timeStr = now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      setCurrentTime(timeStr);
    };

    updatePosition();
    const interval = setInterval(updatePosition, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="absolute left-0 right-0 z-20 pointer-events-none"
      style={{ top: `${position}px` }}
    >
      {/* Time label */}
      <div className="absolute -left-2 -top-3 bg-primary text-gray-950 text-xs font-bold px-2 py-0.5 rounded-full shadow-lg">
        {currentTime}
      </div>

      {/* Line */}
      <div className="absolute left-14 right-0 h-0.5 bg-primary shadow-[0_0_10px_rgba(34,197,94,0.8)]" />

      {/* Circle indicator */}
      <div className="absolute left-14 -top-1.5 w-3 h-3 bg-primary rounded-full shadow-lg" />
    </div>
  );
}
