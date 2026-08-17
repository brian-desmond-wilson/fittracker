// The session's time arithmetic. Deterministic: minutes in, per-section slot
// counts and set/rep defaults out. The AI never gets to move these numbers —
// rules keep the numbers (spec §2).
import type { SectionPlan, SessionSection } from "../types/daily";

interface BudgetInput {
  minutes: number;
  rampWeek: number;
  energy: number; // 1-10
}

// Fractions of the day and per-exercise minute costs, in trim order:
// shrinking time takes cooldown first, then bfr, then accessory.
const SHAPE: {
  section: SessionSection;
  fraction: number;
  perSlot: number;
  minSlots: number;
  sets: number;
  reps: string;
  rest: number | null;
}[] = [
  { section: "warmup",    fraction: 0.15, perSlot: 4,  minSlots: 1, sets: 1, reps: "10",     rest: null },
  { section: "main",      fraction: 0.50, perSlot: 10, minSlots: 2, sets: 3, reps: "8-12",  rest: 120 },
  { section: "accessory", fraction: 0.20, perSlot: 7,  minSlots: 0, sets: 3, reps: "12-15", rest: 90 },
  { section: "bfr",       fraction: 0.07, perSlot: 8,  minSlots: 0, sets: 3, reps: "15-20", rest: 45 },
  { section: "cooldown",  fraction: 0.08, perSlot: 4,  minSlots: 0, sets: 1, reps: "30-60s", rest: null },
];

// Re-entry ramp (weeks 1-2 after 8 weeks off): hard slot ceilings that time
// cannot buy back.
const RAMP_CAPS: Record<number, Partial<Record<SessionSection, number>>> = {
  1: { main: 3, accessory: 1, bfr: 0 },
  2: { main: 4, accessory: 2, bfr: 1 },
};

// What the leftover of a capped day may be spent on. The re-entry ceilings
// hold down hard sets, not time in the building — so an hour the ramp refuses
// to fill with loaded work goes to mobility at both ends and to longer rests
// between the sets it does allow.
/** Total slots a section will accept once leftover time is being spent. */
const MOBILITY_CEILING: Partial<Record<SessionSection, number>> = {
  warmup: 8,
  cooldown: 4,
};
/** Rest can stretch this far, in seconds, and no further. */
const REST_CEILING: Partial<Record<SessionSection, number>> = {
  main: 210,
  accessory: 150,
  bfr: 75,
};
/** Under this, the shortfall is floor() rounding rather than a real gap. */
const MIN_LEFTOVER_MINUTES = 5;

const PER_SLOT = new Map(SHAPE.map((s) => [s.section, s.perSlot]));

/**
 * Spend the minutes a cap refused to use.
 *
 * Mobility first — half the leftover, warm-up before cooldown, each to its own
 * ceiling. Whatever remains stretches the rests, longest-resting section
 * first, because that is recovery rather than work. The person keeps the day
 * they asked for without doing volume they aren't ready for.
 *
 * Slots are an offer, not a promise: if the warm-up pool holds four movements,
 * asking for six still yields four. Composition takes what exists.
 */
function spendLeftover(plans: SectionPlan[], minutes: number): SectionPlan[] {
  const spent = plans.reduce(
    (sum, p) => sum + p.slots * (PER_SLOT.get(p.section) ?? 0), 0,
  );
  let leftover = minutes - spent;
  if (leftover < MIN_LEFTOVER_MINUTES) return plans;

  const out = plans.map((p) => ({ ...p }));
  const find = (section: SessionSection) => out.find((p) => p.section === section);

  // ---- Mobility: half the leftover, warm-up then cooldown ----
  let mobility = Math.floor(leftover / 2);
  for (const section of ["warmup", "cooldown"] as SessionSection[]) {
    const plan = find(section);
    const ceiling = MOBILITY_CEILING[section];
    const perSlot = PER_SLOT.get(section);
    // A section the day was too short to run stays off; leftover time is not
    // a reason to reopen what the time gate closed.
    if (!plan || plan.slots === 0 || ceiling === undefined || !perSlot) continue;
    while (mobility >= perSlot && plan.slots < ceiling) {
      plan.slots += 1;
      mobility -= perSlot;
      leftover -= perSlot;
    }
  }

  // ---- Rests: the rest of it, longest-resting section first ----
  const resting = out
    .filter((p) => p.slots > 0 && p.restSeconds !== null && REST_CEILING[p.section])
    .sort((a, b) => (b.restSeconds ?? 0) - (a.restSeconds ?? 0));
  for (const plan of resting) {
    if (leftover <= 0) break;
    // One gap between each pair of sets — no rest after the final one.
    const gaps = plan.slots * Math.max(0, plan.targetSets - 1);
    if (gaps === 0) continue;
    const ceiling = REST_CEILING[plan.section]!;
    const room = ceiling - (plan.restSeconds ?? 0);
    if (room <= 0) continue;
    const wanted = Math.floor((leftover * 60) / gaps);
    const added = Math.min(room, wanted);
    if (added <= 0) continue;
    plan.restSeconds = (plan.restSeconds ?? 0) + added;
    leftover -= (added * gaps) / 60;
  }

  return out;
}

export function sessionBudget({ minutes, rampWeek, energy }: BudgetInput): SectionPlan[] {
  const caps = RAMP_CAPS[rampWeek] ?? {};
  // Short days starve the back of the list: below these thresholds a section
  // simply doesn't run, and its fraction flows forward to main.
  const skip = new Set<SessionSection>();
  if (minutes < 75) skip.add("bfr");
  if (minutes < 45) { skip.add("accessory"); skip.add("cooldown"); }

  const liveFraction = SHAPE.filter((s) => !skip.has(s.section))
    .reduce((sum, s) => sum + s.fraction, 0);

  const plans = SHAPE.map((s) => {
    if (skip.has(s.section)) {
      return { section: s.section, slots: 0, targetSets: s.sets, targetReps: s.reps, restSeconds: s.rest };
    }
    const slice = (minutes * s.fraction) / liveFraction;
    let slots = Math.max(s.minSlots, Math.floor(slice / s.perSlot));
    const cap = caps[s.section];
    if (cap !== undefined) slots = Math.min(slots, cap);
    // Low energy scales sets down, never the day's focus (spec §5.2).
    const sets = s.section === "main" || s.section === "accessory" || s.section === "bfr"
      ? Math.max(2, energy <= 4 ? s.sets - 1 : s.sets)
      : s.sets;
    return { section: s.section, slots, targetSets: sets, targetReps: s.reps, restSeconds: s.rest };
  });

  // Whatever a cap — or plain rounding — left on the table.
  return spendLeftover(plans, minutes);
}
