// Body-measurement conversions and form parsing shared by GoalsScreen
// (target weight) and ProfileScreen (height, birthdate). DB stores metric
// (cm / kg); the UI enters imperial (ft+in / lbs).
import { parseLocalDate } from "./dates";

export const CM_PER_INCH = 2.54;
export const LBS_PER_KG = 2.20462;

export function cmToFtIn(cm: number): { ft: number; inches: number } {
  const totalIn = cm / CM_PER_INCH;
  const ft = Math.floor(totalIn / 12);
  const inches = totalIn - ft * 12;
  return { ft, inches };
}

export function ftInToCm(ft: number, inches: number): number {
  return (ft * 12 + inches) * CM_PER_INCH;
}

export function kgToLbs(kg: number): number {
  return kg * LBS_PER_KG;
}

export function lbsToKg(lbs: number): number {
  return lbs / LBS_PER_KG;
}

/** Macro-field parsing: "" -> null, non-positive/garbage -> null. */
export function intOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = parseInt(t);
  return isNaN(n) || n <= 0 ? null : n;
}

/** Whole years old on `today`, or null when birthdate is empty/malformed. */
export function ageFromBirthdate(birthdate: string, today: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return null;
  const b = parseLocalDate(birthdate);
  let age = today.getFullYear() - b.getFullYear();
  const hadBirthday =
    today.getMonth() > b.getMonth() ||
    (today.getMonth() === b.getMonth() && today.getDate() >= b.getDate());
  if (!hadBirthday) age -= 1;
  return age;
}
