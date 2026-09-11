// What a captured workout needs, derived from its movements.
//
// Equipment is a property of exercises, not of workouts, and the user's rule
// is a majority: a workout is a kettlebell workout when most of its movements
// need one, and a bodyweight workout only when every movement is bodyweight.
// A pull-up bar is equipment. The floor and a wall are where a movement
// happens, not what it needs. Spec §5.1.
import type { CapturedWorkoutItemEntry } from "../types/capture";

/** Surfaces that never count as equipment. */
export const SUPPORT_SURFACES = new Set(["Floor", "Wall"]);
const BODYWEIGHT = "Bodyweight";

export interface DerivedEquipment {
  /** Names that clear the majority, in grid order. Never "Bodyweight". */
  derivedEquipment: string[];
  /** True only when every countable movement is bodyweight. With nothing
   *  countable this is false, not vacuously true: an unjoined workout is
   *  unknown, and unknown must not match the Bodyweight filter. */
  isBodyweight: boolean;
}

/** The filter sheet's grid, in display order. `name` is the live
 *  equipment.name value; `label` is what the tile says. */
export const EQUIPMENT_GRID: { name: string; label: string }[] = [
  { name: "Kettlebell", label: "Kettlebell" },
  { name: "Dumbbell", label: "Dumbbell" },
  { name: "Barbell", label: "Barbell" },
  { name: BODYWEIGHT, label: "Bodyweight" },
  { name: "Bands", label: "Bands" },
  { name: "Bar", label: "Pull-up bar" },
  { name: "Box", label: "Box" },
  { name: "Jump Rope", label: "Jump rope" },
  { name: "Bench", label: "Bench" },
  { name: "Sled", label: "Sled" },
  { name: "Cable", label: "Cable" },
  { name: "Machine", label: "Machine" },
  { name: "Rings", label: "Rings" },
  { name: "Med Ball", label: "Med ball" },
  { name: "Bike", label: "Bike" },
  { name: "Rower", label: "Rower" },
];

const GRID_INDEX = new Map(EQUIPMENT_GRID.map((e, i) => [e.name, i]));

export function equipmentLabel(name: string): string {
  return EQUIPMENT_GRID.find((e) => e.name === name)?.label ?? name;
}

/** Grid order first, then anything the grid does not know, alphabetically. */
export function byGridOrder(a: string, b: string): number {
  const ia = GRID_INDEX.get(a);
  const ib = GRID_INDEX.get(b);
  if (ia !== undefined && ib !== undefined) return ia - ib;
  if (ia !== undefined) return -1;
  if (ib !== undefined) return 1;
  return a.localeCompare(b);
}

/** A movement's countable equipment: surfaces dropped, Bodyweight dropped. */
function needsOf(item: CapturedWorkoutItemEntry): Set<string> {
  return new Set(
    (item.equipment ?? []).filter((n) => !SUPPORT_SURFACES.has(n) && n !== BODYWEIGHT),
  );
}

export function deriveWorkoutEquipment(items: CapturedWorkoutItemEntry[]): DerivedEquipment {
  const countable = items.filter((it) => it.equipment !== undefined);
  const n = countable.length;
  if (n === 0) return { derivedEquipment: [], isBodyweight: false };

  const tally = new Map<string, number>();
  let bodyweightMovements = 0;
  for (const it of countable) {
    const needs = needsOf(it);
    if (needs.size === 0) bodyweightMovements += 1;
    for (const name of needs) tally.set(name, (tally.get(name) ?? 0) + 1);
  }

  const derivedEquipment = [...tally.entries()]
    .filter(([, count]) => count * 2 > n)
    .map(([name]) => name)
    .sort(byGridOrder);

  return { derivedEquipment, isBodyweight: bodyweightMovements === n };
}

/** The one word a card shows. */
export function primaryEquipmentLabel(d: DerivedEquipment): string | null {
  if (d.derivedEquipment.length > 0) return equipmentLabel(d.derivedEquipment[0]);
  return d.isBodyweight ? "Bodyweight" : null;
}
