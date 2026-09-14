// What the captured-workout card shows, derived once from a CapturedWorkoutEntry
// so the card JSX is a plain renderer and this rule set is testable on its own.
// Mirrors catalogCardFacts for the exercise card: the two cards read the same
// because they compute the same kinds of facts.
//
// The difference is aggregation. An exercise has its own equipment and muscles;
// a workout has neither — it summarises the movements inside it. Equipment here
// is EVERY distinct piece any movement needs (the whole point of the redesign),
// not the majority rule that primaryEquipmentLabel uses for a single word.
import type { CapturedWorkoutEntry } from "../types/capture";
import type { BlockRole } from "../types/dailyBlocks";
import { BLOCK_ORDER } from "./dailyBlockCompose";
import { SUPPORT_SURFACES, byGridOrder } from "./workoutEquipment";
import { FORMAT_LABELS } from "./workoutFormatVocab";

const BODYWEIGHT = "Bodyweight";
const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));

export interface WorkoutCardFacts {
  /** Every distinct equipment name any movement needs, surfaces and Bodyweight
   *  dropped, in grid order. Falls back to ["Bodyweight"] when there is no gear
   *  and every movement is bodyweight — so a bodyweight workout still shows one
   *  glyph rather than an empty row. */
  equipment: string[];
  /** The one large muscle icon: first primary, else first muscle. From the
   *  workout's own muscle tags, not re-derived from the movements. */
  primaryMuscle: string | null;
  /** Every other muscle, deduped. The card draws the first few, names them all. */
  secondaryMuscles: string[];
  skillLevel: string | null;
  /** Short overlay for the thumbnail, with minutes when the format has them:
   *  "AMRAP 15", "EMOM", "Sets & reps". Every classified format gets one;
   *  null only for an unclassified workout — nothing to say. */
  formatTag: string | null;
  /** How many movements the workout has — the one number worth keeping from the
   *  old headline once that line is gone. */
  movementCount: number;
  /** Block roles this workout can serve, in performed order. */
  roles: BlockRole[];
  /** Never classified — invisible to the recommender until someone tags it. */
  untagged: boolean;
}

export function workoutCardFacts(entry: CapturedWorkoutEntry): WorkoutCardFacts {
  const raw = entry.items
    .flatMap((it) => it.equipment ?? [])
    .filter((n) => !SUPPORT_SURFACES.has(n) && n !== BODYWEIGHT);
  let equipment = uniq(raw).sort(byGridOrder);
  if (equipment.length === 0 && entry.isBodyweight) equipment = [BODYWEIGHT];

  const muscles = entry.tags.muscles;
  const primaryIdx = muscles.findIndex((m) => m.isPrimary);
  const idx = primaryIdx >= 0 ? primaryIdx : muscles.length ? 0 : -1;
  const primaryMuscle = idx >= 0 ? muscles[idx].name : null;
  const secondaryMuscles = uniq(
    muscles.filter((_, i) => i !== idx).map((m) => m.name),
  ).filter((name) => name !== primaryMuscle);

  const fmt = entry.tags.format;
  const min = entry.tags.formatMinutes;
  const formatTag = fmt ? FORMAT_LABELS[fmt] + (min ? ` ${min}` : "") : null;

  return {
    equipment,
    primaryMuscle,
    secondaryMuscles,
    skillLevel: entry.tags.skillLevel,
    formatTag,
    movementCount: entry.items.length,
    roles: BLOCK_ORDER.filter((r) => entry.tags.blockRoles.includes(r)),
    untagged: entry.tags.classifiedAt === null,
  };
}
