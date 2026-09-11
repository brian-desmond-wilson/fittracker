// One removable chip above a filtered list. Shared by the Workouts and
// Exercises tabs; each names its own axis union.
export interface FilterChip<Axis extends string> {
  axis: Axis;
  label: string;
  /** The raw values the chip stands for on its axis — several when a muscle
   *  group collapsed into one chip. */
  values: string[];
}
