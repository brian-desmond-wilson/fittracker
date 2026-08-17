// The rules tier's candidate builder: which exercises are even in play today.
// Pure — every fact (gym equipment, soreness, recency, skill states,
// regression links) arrives as data. Nothing here talks to the network.
import type {
  RankedCandidate,
  SessionCandidate,
  SessionSection,
  SkillStateLevel,
  SplitDay,
} from "../types/daily";

// Legacy equipment_types dialect (the 2025-10 backfill) → equipment.name.
// New writes use equipment.name verbatim; both coexist in the table.
const LEGACY_EQUIPMENT: Record<string, string> = {
  barbell: "Barbell", dumbbell: "Dumbbell", kettlebell: "Kettlebell",
  wall_ball: "Med Ball", medicine_ball: "Med Ball", box: "Box",
  rings: "Rings", rower: "Rower", bike: "Bike", assault_bike: "Bike",
  ski_erg: "Ski", bodyweight: "Bodyweight",
};

export function normalizeEquipmentName(raw: string): string {
  const legacy = LEGACY_EQUIPMENT[raw.toLowerCase()];
  if (legacy) return legacy;
  return raw;
}

// Most of the catalog (88 of 129 rows) carries no equipment at all, so the
// gym gate has nothing to check those rows against. When the NAME states the
// tool, that is evidence enough to gate on: "Barbell Curl" needs a barbell
// whether or not anyone tagged the row.
//
// Every value here MUST be a real equipment.name. Inventing one ("Cable",
// "Machine") would exclude the movement from every gym forever, since no
// gym's checklist could ever contain it — cable and machine work therefore
// stays unverified rather than being gated out.
const NAME_IMPLIES_EQUIPMENT: Record<string, string> = {
  "trap bar": "Trap Bar",
  "medicine ball": "Med Ball",
  "wall ball": "Med Ball",
  "med ball": "Med Ball",
  "stability ball": "Stability Ball",
  "massage ball": "Massage Ball",
  "foam roller": "Foam Roller",
  "yoga block": "Yoga Block",
  "assault bike": "Bike",
  "ski erg": "Ski",
  kettlebell: "Kettlebell",
  dumbbell: "Dumbbell",
  barbell: "Barbell",
  sandbag: "Sandbag",
  treadmill: "Treadmill",
  rower: "Rower",
  rings: "Rings",
  rope: "Rope",
  bench: "Bench",
  plate: "Plate",
  bands: "Bands",
  band: "Bands",
  box: "Box",
};

/** Equipment the exercise's own name states it needs. Empty when the name
 *  names no tool — "Push Press" could be a barbell or a dumbbell, and
 *  guessing either way would be worse than admitting we don't know. */
export function equipmentFromName(name: string): string[] {
  // Pad and strip punctuation so matches land on whole words: "Box Jump"
  // hits `box`, "Boxer Shuffle" does not.
  const haystack = ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const found = new Set<string>();
  for (const [phrase, equipment] of Object.entries(NAME_IMPLIES_EQUIPMENT)) {
    if (haystack.includes(` ${phrase} `)) found.add(equipment);
  }
  return [...found];
}

// muscle_regions.name values, verbatim (post-reorg seed).
const DAY_MUSCLES: Record<SplitDay, Set<string>> = {
  push: new Set(["Chest", "Shoulders", "Triceps"]),
  pull: new Set(["Upper Back", "Lats", "Biceps", "Forearms / Grip", "Neck / Traps"]),
  legs: new Set([
    "Quads", "Glutes", "Hamstrings", "Calves",
    "Hip Flexors", "Hip Abductors", "Hip Adductors",
  ]),
};
const ALWAYS_MUSCLES = new Set(["Core", "Obliques", "Lower Back", "Full Body"]);

// goal_types.name → which pool. Skill/Strength/MetCon are "work"; the rest
// bookend the session and aren't split-gated.
function poolFor(goalTypes: string[]): "warmup" | "main" | "cooldown" {
  if (goalTypes.some((g) => g === "Stretching" || g === "Cool-Down")) return "cooldown";
  if (goalTypes.some((g) => g === "Mobility" || g === "Recovery")) return "warmup";
  return "main";
}

export interface PoolContext {
  splitDay: SplitDay;
  /** Normalized equipment.name values available today (gym + BFR injection). */
  gymEquipment: Set<string>;
  /** muscle_regions.name → severity 1-3. */
  soreness: Record<string, number>;
}

export interface CandidatePools {
  warmup: RankedCandidate[];
  main: RankedCandidate[];
  cooldown: RankedCandidate[];
}

/** Rank: sore-downgrades sink; a movement we KNOW the gym can do outranks one
 *  we merely can't rule out; then captures before stock; then never-performed
 *  before stale before recent. */
function rank(a: RankedCandidate, b: RankedCandidate): number {
  if (a.soreDowngrade !== b.soreDowngrade) return a.soreDowngrade ? 1 : -1;
  if (a.equipmentUnknown !== b.equipmentUnknown) return a.equipmentUnknown ? 1 : -1;
  if (a.isCapture !== b.isCapture) return a.isCapture ? -1 : 1;
  const aDays = a.lastPerformedDaysAgo ?? Number.POSITIVE_INFINITY;
  const bDays = b.lastPerformedDaysAgo ?? Number.POSITIVE_INFINITY;
  if (aDays !== bDays) return bDays - aDays;
  return a.name.localeCompare(b.name);
}

export function buildCandidatePools(
  candidates: SessionCandidate[],
  ctx: PoolContext,
): CandidatePools {
  const pools: CandidatePools = { warmup: [], main: [], cooldown: [] };

  for (const c of candidates) {
    // Equipment gate. A tagged row is checked against the gym outright; an
    // untagged one falls back to what its name states. If neither says
    // anything, we genuinely don't know what it needs — it stays in play
    // (dropping 2/3 of the catalog would leave no session at all) but is
    // marked unverified so it ranks below movements the gym can definitely do.
    const tagged = c.equipmentTypes.map(normalizeEquipmentName);
    const needs = tagged.length > 0 ? tagged : equipmentFromName(c.name);
    const equipmentUnknown = needs.length === 0;
    const equipmentOk =
      equipmentUnknown ||
      needs.every((n) => n === "Bodyweight" || ctx.gymEquipment.has(n));
    if (!equipmentOk) continue;

    const pool = poolFor(c.goalTypes);
    const primaries = c.muscles.filter((m) => m.isPrimary).map((m) => m.name);

    let soreDowngrade = false;
    if (pool === "main") {
      // Split gate: at least one primary belongs to today (or is always-on).
      const onDay = primaries.some(
        (m) => DAY_MUSCLES[ctx.splitDay].has(m) || ALWAYS_MUSCLES.has(m),
      );
      if (!onDay) continue;
      // Soreness gate: 2+ on a primary excludes; 1 downgrades rank.
      const worst = Math.max(0, ...primaries.map((m) => ctx.soreness[m] ?? 0));
      if (worst >= 2) continue;
      soreDowngrade = worst === 1;
    }

    pools[pool].push({
      ...c,
      section: pool as SessionSection,
      soreDowngrade,
      regressedFromId: null,
      equipmentUnknown,
    });
  }

  pools.warmup.sort(rank);
  pools.main.sort(rank);
  pools.cooldown.sort(rank);
  return pools;
}

export interface ProgressionContext {
  /** exercise_id → earned level. Absent = beginner (conservative default). */
  skillState: Record<string, SkillStateLevel>;
  /** from_exercise_id → to_exercise_id, first regression link by display_order. */
  regressions: Map<string, string>;
  /** Lookup for the regression targets' own candidate data. */
  byExerciseId: Map<string, SessionCandidate>;
}

const EARNS: Record<string, SkillStateLevel> = {
  Advanced: "advanced",
  Intermediate: "intermediate",
};

/** Swap in the easier movement when the candidate outranks the user's earned
 *  level AND a regression link exists. No link → keep it (we can't invent a
 *  regression); the model still sees the skill level and can order it late. */
export function resolveProgressions(
  ranked: RankedCandidate[],
  ctx: ProgressionContext,
): RankedCandidate[] {
  return ranked.map((c) => {
    const needed = c.skillLevel ? EARNS[c.skillLevel] : undefined;
    if (!needed) return c;
    const earned = ctx.skillState[c.exerciseId] ?? "beginner";
    const rankOf = { beginner: 0, intermediate: 1, advanced: 2 } as const;
    if (rankOf[earned] >= rankOf[needed]) return c;
    const toId = ctx.regressions.get(c.exerciseId);
    const target = toId ? ctx.byExerciseId.get(toId) : undefined;
    if (!target) return c;
    return {
      ...target,
      section: c.section,
      soreDowngrade: c.soreDowngrade,
      regressedFromId: c.exerciseId,
      // Recomputed for the TARGET, not inherited — it is a different
      // movement with its own equipment story.
      equipmentUnknown:
        target.equipmentTypes.length === 0 && equipmentFromName(target.name).length === 0,
      // The regression inherits the original's queue position by replacing
      // it in place; isCapture/lastPerformed come from the target itself.
    };
  });
}
