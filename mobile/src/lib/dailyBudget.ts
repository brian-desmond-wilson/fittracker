// The session's time arithmetic. Deterministic: minutes in, per-section slot
// counts and set/rep defaults out. The AI never gets to move these numbers —
// rules keep the numbers (spec §2).
import type { SectionPlan, SessionSection } from "../types/daily";
import { planMinutes } from "./dailySectionMinutes";

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
  warmup: 12,
  cooldown: 8,
};
/** Rest can stretch this far, in seconds, and no further. */
const REST_CEILING: Partial<Record<SessionSection, number>> = {
  main: 300,
  accessory: 210,
  bfr: 120,
};
/** How much rest one pass adds, so time spreads instead of pooling. */
const REST_STEP_SECONDS = 15;
/** Under this, the shortfall is floor() rounding rather than a real gap. */
const MIN_LEFTOVER_MINUTES = 5;

/**
 * Spend the minutes a cap refused to use.
 *
 * One pass at a time, round-robin: a warm-up movement, a cooldown movement,
 * then a step of extra rest on each resting section. Spreading it this way
 * keeps a long day from pouring everything into the warm-up, and every buy is
 * priced with `planMinutes` — the same arithmetic the screen shows — so the
 * budget stops exactly when the day is full rather than when its own
 * bookkeeping thinks so.
 *
 * Slots are an offer, not a promise: if the warm-up pool holds four movements,
 * asking for ten still yields four. Composition takes what exists, which is
 * why a thin catalog can still come out short of the time asked for.
 */
function spendLeftover(plans: SectionPlan[], minutes: number): SectionPlan[] {
  const out = plans.map((p) => ({ ...p }));
  const committed = () => out.reduce((sum, p) => sum + planMinutes(p), 0);
  if (minutes - committed() < MIN_LEFTOVER_MINUTES) return plans;

  const find = (section: SessionSection) => out.find((p) => p.section === section);
  /** Take the change only if the day can still pay for it. */
  const afford = (plan: SectionPlan, change: (p: SectionPlan) => void): boolean => {
    const before = planMinutes(plan);
    const undo = { slots: plan.slots, restSeconds: plan.restSeconds };
    change(plan);
    if (committed() <= minutes && planMinutes(plan) > before) return true;
    plan.slots = undo.slots;
    plan.restSeconds = undo.restSeconds;
    return false;
  };

  let progressed = true;
  while (progressed && minutes - committed() > 0) {
    progressed = false;

    // ---- One more movement at each end ----
    for (const section of ["warmup", "cooldown"] as SessionSection[]) {
      const plan = find(section);
      const ceiling = MOBILITY_CEILING[section];
      // A section the clock closed stays closed; leftover time is not a reason
      // to reopen what the time gate shut.
      if (!plan || plan.slots === 0 || ceiling === undefined) continue;
      if (plan.slots >= ceiling) continue;
      if (afford(plan, (p) => { p.slots += 1; })) progressed = true;
    }

    // ---- A longer breath between the sets the ramp does allow ----
    for (const plan of out) {
      const ceiling = REST_CEILING[plan.section];
      if (plan.slots === 0 || plan.restSeconds === null || ceiling === undefined) continue;
      if (plan.restSeconds >= ceiling) continue;
      // One gap between each pair of sets — no rest after the final one.
      if (plan.slots * Math.max(0, plan.targetSets - 1) === 0) continue;
      const step = Math.min(REST_STEP_SECONDS, ceiling - plan.restSeconds);
      if (afford(plan, (p) => { p.restSeconds = (p.restSeconds ?? 0) + step; })) {
        progressed = true;
      }
    }
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
