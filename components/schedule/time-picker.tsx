"use client";

import { ChangeEvent } from "react";
import { Label } from "@/components/ui/label";

type Meridiem = "AM" | "PM";

export interface TimeValue {
  hour: number;
  minute: number;
  meridiem: Meridiem;
}

interface TimePickerProps {
  id: string;
  label: string;
  value: TimeValue;
  onChange: (value: TimeValue) => void;
  disabled?: boolean;
}

const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = [0, 15, 30, 45];

export function TimePicker({ id, label, value, onChange, disabled }: TimePickerProps) {
  const handleHourChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const hour = Number(event.target.value);
    onChange({ ...value, hour });
  };

  const handleMinuteChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const minute = Number(event.target.value);
    onChange({ ...value, minute });
  };

  const handleMeridiemChange = (meridiem: Meridiem) => {
    onChange({ ...value, meridiem });
  };

  const minuteOptions = MINUTES.includes(value.minute)
    ? MINUTES
    : [...MINUTES, value.minute].sort((a, b) => a - b);

  return (
    <div className="relative">
      <Label htmlFor={id} className="text-gray-300">
        {label}
      </Label>
      <div className="mt-1.5 flex items-center gap-2">
        <select
          id={id}
          value={value.hour}
          onChange={handleHourChange}
          disabled={disabled}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {HOURS.map((hour) => (
            <option key={hour} value={hour}>
              {hour}
            </option>
          ))}
        </select>

        <span className="text-gray-500">:</span>

        <select
          value={value.minute}
          onChange={handleMinuteChange}
          disabled={disabled}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {minuteOptions.map((minute) => (
            <option key={minute} value={minute}>
              {minute.toString().padStart(2, "0")}
            </option>
          ))}
        </select>

        <div className="flex rounded-lg border border-gray-700 bg-gray-800 overflow-hidden">
          {(["AM", "PM"] as Meridiem[]).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => handleMeridiemChange(period)}
              disabled={disabled}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                value.meridiem === period
                  ? "bg-primary text-gray-950"
                  : "text-gray-300 hover:bg-gray-700"
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export const to24HourString = (time: TimeValue) => {
  let hour = time.hour % 12;
  if (time.meridiem === "PM") {
    hour += 12;
  }
  if (time.meridiem === "AM" && hour === 12) {
    hour = 0;
  }

  return `${hour.toString().padStart(2, "0")}:${time.minute
    .toString()
    .padStart(2, "0")}`;
};

export const from24HourString = (time: string): TimeValue => {
  const [rawHour = 0, rawMinute = 0] = time.split(":").map((part) => Number(part));
  const isPM = rawHour >= 12;
  let hour = rawHour % 12;
  if (hour === 0) {
    hour = 12;
  }

  return {
    hour,
    minute: rawMinute,
    meridiem: isPM ? "PM" : "AM",
  };
};
