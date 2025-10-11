"use client";

const HOUR_HEIGHT = 80; // Height in pixels for each hour
const HOURS = Array.from({ length: 24 }, (_, i) => (i + 5) % 24); // 5am-4am

interface TimeGridProps {
  onTimeSlotClick?: (hour: number, minute: number) => void;
}

export function TimeGrid({ onTimeSlotClick }: TimeGridProps) {
  const formatHour = (hour: number) => {
    if (hour === 0) return "12 AM";
    if (hour === 12) return "12 PM";
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
  };

  const handleSlotClick = (hour: number, quarterIndex: number) => {
    if (onTimeSlotClick) {
      const minute = quarterIndex * 15;
      onTimeSlotClick(hour, minute);
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute inset-0 pl-12">
        {HOURS.map((hour, index) => (
          <div
            key={`hour-${index}`}
            className="absolute left-0 right-0 border-t border-gray-800"
            style={{ top: `${index * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
          >
            {/* Hour label */}
            <div className="absolute left-1 -top-3 text-xs text-gray-500 font-medium bg-gray-950 px-1 whitespace-nowrap">
              {formatHour(hour)}
            </div>

            {/* Clickable 15-minute interval slots */}
            {onTimeSlotClick && (
              <>
                <button
                  onClick={() => handleSlotClick(hour, 0)}
                  className="absolute left-12 right-0 top-0 h-1/4 pointer-events-auto hover:bg-primary/5 transition-colors"
                  aria-label={`Add event at ${formatHour(hour)} 00`}
                />
                <button
                  onClick={() => handleSlotClick(hour, 1)}
                  className="absolute left-12 right-0 top-1/4 h-1/4 pointer-events-auto hover:bg-primary/5 transition-colors"
                  aria-label={`Add event at ${formatHour(hour)} 15`}
                />
                <button
                  onClick={() => handleSlotClick(hour, 2)}
                  className="absolute left-12 right-0 top-2/4 h-1/4 pointer-events-auto hover:bg-primary/5 transition-colors"
                  aria-label={`Add event at ${formatHour(hour)} 30`}
                />
                <button
                  onClick={() => handleSlotClick(hour, 3)}
                  className="absolute left-12 right-0 top-3/4 h-1/4 pointer-events-auto hover:bg-primary/5 transition-colors"
                  aria-label={`Add event at ${formatHour(hour)} 45`}
                />
              </>
            )}

            {/* 15-minute interval lines */}
            <div className="absolute left-12 right-0 top-1/4 border-t border-gray-900" />
            <div className="absolute left-12 right-0 top-2/4 border-t border-gray-800" />
            <div className="absolute left-12 right-0 top-3/4 border-t border-gray-900" />
          </div>
        ))}
      </div>
    </div>
  );
}

export { HOUR_HEIGHT };
