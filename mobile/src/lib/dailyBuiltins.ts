// The shipped fallback routines: {warmup, mobility, cooldown} × {upper,
// lower, full}. Static app data — every session is complete from day one,
// and each use fires a gap nudge to capture a replacement (spec §3.3).
// Conditioning has no built-in: it is the optional block and simply drops.
import type { BuiltinRoutine } from "../types/dailyBlocks";

export const BUILTINS: BuiltinRoutine[] = [
  {
    key: "builtin-warmup-upper", name: "Upper-Body Warm-up", role: "warmup",
    focus: "upper", minutes: 6,
    movements: [
      { name: "Jumping Jacks", prescription: "60s" },
      { name: "Arm Circles", prescription: "15 each way" },
      { name: "Wall Slides", prescription: "2 × 15" },
      { name: "Scapular Push-ups", prescription: "2 × 10" },
    ],
  },
  {
    key: "builtin-warmup-lower", name: "Lower-Body Warm-up", role: "warmup",
    focus: "lower", minutes: 6,
    movements: [
      { name: "Jumping Jacks", prescription: "60s" },
      { name: "Bodyweight Squats", prescription: "2 × 12" },
      { name: "Walking Lunges", prescription: "10 each leg" },
      { name: "Glute Bridges", prescription: "2 × 12" },
    ],
  },
  {
    key: "builtin-warmup-full", name: "Full-Body Warm-up", role: "warmup",
    focus: "full", minutes: 7,
    movements: [
      { name: "Jumping Jacks", prescription: "60s" },
      { name: "Bodyweight Squats", prescription: "2 × 10" },
      { name: "Arm Circles", prescription: "15 each way" },
      { name: "Inchworms", prescription: "2 × 5" },
    ],
  },
  {
    key: "builtin-mobility-upper", name: "Upper-Body Mobility", role: "mobility",
    focus: "upper", minutes: 7,
    movements: [
      { name: "Thread the Needle", prescription: "8 each side" },
      { name: "Cat-Cow", prescription: "10 slow reps" },
      { name: "Shoulder Dislocates (band or towel)", prescription: "2 × 10" },
      { name: "Thoracic Rotations", prescription: "8 each side" },
    ],
  },
  {
    key: "builtin-mobility-lower", name: "Lower-Body Mobility", role: "mobility",
    focus: "lower", minutes: 7,
    movements: [
      { name: "Leg Swings", prescription: "12 each direction" },
      { name: "Hip Openers (90/90)", prescription: "6 each side" },
      { name: "World's Greatest Stretch", prescription: "5 each side" },
      { name: "Ankle Circles", prescription: "10 each way" },
    ],
  },
  {
    key: "builtin-mobility-full", name: "Full-Body Mobility", role: "mobility",
    focus: "full", minutes: 8,
    movements: [
      { name: "World's Greatest Stretch", prescription: "5 each side" },
      { name: "Cat-Cow", prescription: "10 slow reps" },
      { name: "Leg Swings", prescription: "12 each direction" },
      { name: "Deep Squat Hold", prescription: "2 × 30s" },
    ],
  },
  {
    key: "builtin-cooldown-upper", name: "Upper-Body Cool-down", role: "cooldown",
    focus: "upper", minutes: 6,
    movements: [
      { name: "Doorway Chest Stretch", prescription: "45s each side" },
      { name: "Cross-Body Shoulder Stretch", prescription: "30s each side" },
      { name: "Triceps Overhead Stretch", prescription: "30s each side" },
      { name: "Child's Pose", prescription: "60s" },
    ],
  },
  {
    key: "builtin-cooldown-lower", name: "Lower-Body Cool-down", role: "cooldown",
    focus: "lower", minutes: 6,
    movements: [
      { name: "Standing Quad Stretch", prescription: "30s each side" },
      { name: "Seated Hamstring Stretch", prescription: "45s each side" },
      { name: "Figure-4 Glute Stretch", prescription: "30s each side" },
      { name: "Calf Stretch on Wall", prescription: "30s each side" },
    ],
  },
  {
    key: "builtin-cooldown-full", name: "Full-Body Cool-down", role: "cooldown",
    focus: "full", minutes: 7,
    movements: [
      { name: "Child's Pose", prescription: "60s" },
      { name: "Seated Hamstring Stretch", prescription: "45s each side" },
      { name: "Doorway Chest Stretch", prescription: "45s each side" },
      { name: "Slow Nasal Breathing, Lying Down", prescription: "120s" },
    ],
  },
  // BFR finishers (Phase 3): built-in-only, rules-appended by
  // bfrFinisherPick — never in a shortlist, never the model's to pick. The
  // 30/15/15/15 scheme with short rests is the standard occlusion protocol:
  // light load, high rep, cuffs stay on through the rests.
  {
    key: "builtin-bfr-upper", name: "BFR Arm Finisher", role: "bfr",
    focus: "upper", minutes: 10,
    movements: [
      { name: "Banded Bicep Curls (cuffs on)", prescription: "30-15-15-15, 30s rests" },
      { name: "Banded Triceps Extensions (cuffs on)", prescription: "30-15-15-15, 30s rests" },
    ],
  },
  {
    key: "builtin-bfr-lower", name: "BFR Leg Finisher", role: "bfr",
    focus: "lower", minutes: 10,
    movements: [
      { name: "Bodyweight Squats (cuffs on)", prescription: "30-15-15-15, 30s rests" },
      { name: "Standing Calf Raises (cuffs on)", prescription: "30-15-15-15, 30s rests" },
    ],
  },
];

export function findBuiltin(
  role: BuiltinRoutine["role"],
  focus: BuiltinRoutine["focus"],
): BuiltinRoutine | null {
  return BUILTINS.find((b) => b.role === role && b.focus === focus) ?? null;
}

export function builtinByKey(key: string): BuiltinRoutine | null {
  return BUILTINS.find((b) => b.key === key) ?? null;
}
