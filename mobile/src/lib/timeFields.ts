// "HH:MM" form-field helpers for time pickers (Tracking Settings). Zero-padded
// 24h strings sort lexicographically, so ordering checks are string compares.

export function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  const ampm = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function hhmmFromDate(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function dateFromHhmm(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  const d = new Date();
  d.setHours(h, m || 0, 0, 0);
  return d;
}

/** True when every time is strictly after the one before it. */
export function hhmmAscending(...times: string[]): boolean {
  for (let i = 1; i < times.length; i++) {
    if (times[i] <= times[i - 1]) return false;
  }
  return true;
}
