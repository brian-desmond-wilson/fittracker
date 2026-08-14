// A clock that only re-renders itself.
//
// Three timers used to tick on the workout session screen — elapsed workout,
// rest, and the active set — and each one drove a `useState` on the screen
// component. Every second, all of it re-rendered: the exercise card and its
// photo, every set row, the difficulty picker. The numbers are the only thing
// that changed, so the numbers are the only thing that should re-render.
//
// Counting from a timestamp rather than incrementing a counter also keeps the
// display honest. A `+1` each second drifts whenever a tick is late, and JS
// timers are always a little late; the difference from a fixed start never is.
import React, { memo, useEffect, useState } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
import { elapsedSecondsSince, formatDuration } from "@/src/lib/timeFormat";

interface TickingDurationProps {
  /** `Date.now()`-style start. Elapsed time is measured from here. */
  since: number;
  style?: StyleProp<TextStyle>;
}

export const TickingDuration = memo(function TickingDuration({
  since,
  style,
}: TickingDurationProps) {
  const [seconds, setSeconds] = useState(() => elapsedSecondsSince(since));

  useEffect(() => {
    // Re-seed immediately: a new start time should show 0:00 now, not after
    // the first tick lands a second later.
    setSeconds(elapsedSecondsSince(since));
    const id = setInterval(() => setSeconds(elapsedSecondsSince(since)), 1000);
    return () => clearInterval(id);
  }, [since]);

  return <Text style={style}>{formatDuration(seconds)}</Text>;
});
