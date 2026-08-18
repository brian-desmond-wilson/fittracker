// Client half of the daily loop: gyms, check-ins, generated sessions, and the
// data-assembly the rules tier consumes. Suggest-only boundary: the ONLY
// session writes here are the suggestion record itself and status
// transitions the user's taps cause.
import { supabase } from "../supabase";
import { lastStampedSplitDay, rampWeek } from "../dailySplit";
import { capturedWorkoutToSessionItems, pickDaySession } from "../dailyAdopt";
import { BLOCK_ORDER, SECTION_FOR_BLOCK, nextCandidate } from "../dailyBlockCompose";
import { fetchCapturedWorkout } from "./capture";
import { recordUsage } from "./workoutTags";
import type {
  BlockCandidate,
  BlockPick,
  BlockRole,
  StoredBlock,
} from "../../types/dailyBlocks";
import type {
  ComposedSession,
  DailyCheckin,
  GymProfile,
  SectionMinutes,
  SessionCandidate,
  SessionItem,
  SessionSection,
  SkillStateLevel,
  SplitDay,
  StoredSession,
} from "../../types/daily";

/**
 * The order a session's sections are shown and trained in. `item_order` is one
 * sequence across the whole session — the logging screen sorts every item by it
 * and walks them in that order — so anything that rewrites part of the list has
 * to put the sequence back. Mirrors the Today tab's section order; `bfr` has no
 * block and keeps the slot it already had.
 */
const SECTION_RANK: Record<SessionSection, number> = {
  warmup: 0, mobility: 1, main: 2, accessory: 3, bfr: 4, cooldown: 5,
};

/** Where a reroll parks its new item rows until the sequence is rebuilt. Past
 *  any real session's length, so the staging order is never mistaken for a
 *  position in the day. */
const REROLL_ITEM_ORDER_BASE = 1000;

// ---------- Gyms ----------

const GYM_PRESETS: Record<string, string[]> = {
  // equipment.name values, verbatim from the seeded table.
  full_gym: [
    "Barbell", "Dumbbell", "Kettlebell", "Trap Bar", "Med Ball", "Plate",
    "Sandbag", "Bike", "Rower", "Ski", "Treadmill", "Bodyweight", "Bar",
    "Rings", "Rope", "Bench", "Box", "Floor", "Wall", "Bands", "Foam Roller",
    "Massage Ball", "Mat", "Stability Ball", "Yoga Block",
  ],
  hotel_gym: [
    "Dumbbell", "Bench", "Treadmill", "Bike", "Bodyweight", "Floor", "Wall",
    "Mat", "Bands", "Foam Roller",
  ],
  bodyweight: ["Bodyweight", "Floor", "Wall", "Mat", "Bands"],
};

export function presetEquipmentNames(preset: string): string[] {
  return GYM_PRESETS[preset] ?? [];
}

export async function fetchGyms(userId: string): Promise<GymProfile[]> {
  const { data, error } = await supabase
    .from("gym_profiles")
    .select("id, name, location, preset, is_active, gym_profile_equipment(equipment(name))")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchGyms failed:", error);
    return [];
  }
  return (data ?? []).map((g: any) => ({
    id: g.id,
    name: g.name,
    location: g.location,
    preset: g.preset,
    isActive: g.is_active,
    equipmentNames: (g.gym_profile_equipment ?? [])
      .map((e: any) => e.equipment?.name)
      .filter(Boolean),
  }));
}

export interface SaveGymInput {
  id?: string; // absent = create
  userId: string;
  name: string;
  location: string | null;
  preset: string;
  equipmentNames: string[];
}

/** Create or update a gym and replace its equipment checklist. */
export async function saveGym(input: SaveGymInput): Promise<string | null> {
  try {
    let gymId = input.id ?? null;
    if (gymId) {
      const { error } = await supabase
        .from("gym_profiles")
        .update({ name: input.name, location: input.location, preset: input.preset })
        .eq("id", gymId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("gym_profiles")
        .insert({
          user_id: input.userId,
          name: input.name,
          location: input.location,
          preset: input.preset,
        })
        .select("id")
        .single();
      if (error) throw error;
      gymId = data.id;
    }

    // Replace the checklist wholesale — it's a handful of rows.
    const { data: equipmentRows, error: eqError } = await supabase
      .from("equipment")
      .select("id, name")
      .in("name", input.equipmentNames);
    if (eqError) throw eqError;
    const { error: delError } = await supabase
      .from("gym_profile_equipment")
      .delete()
      .eq("gym_profile_id", gymId);
    if (delError) throw delError;
    if ((equipmentRows ?? []).length > 0) {
      const { error: insError } = await supabase
        .from("gym_profile_equipment")
        .insert(equipmentRows!.map((e) => ({ gym_profile_id: gymId, equipment_id: e.id })));
      if (insError) throw insError;
    }
    return gymId;
  } catch (e) {
    console.error("saveGym failed:", e);
    return null;
  }
}

/** One active gym per user: clear, then set. The partial unique index makes
 *  the invariant real even if this races. */
export async function setActiveGym(userId: string, gymId: string): Promise<boolean> {
  const { error: clearError } = await supabase
    .from("gym_profiles")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("is_active", true);
  if (clearError) {
    console.error("setActiveGym clear failed:", clearError);
    return false;
  }
  const { error } = await supabase
    .from("gym_profiles")
    .update({ is_active: true })
    .eq("id", gymId);
  if (error) {
    console.error("setActiveGym failed:", error);
    return false;
  }
  return true;
}

export async function fetchBfrFlag(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("bfr_bands_available")
    .eq("id", userId)
    .maybeSingle();
  return !!data?.bfr_bands_available;
}

export async function setBfrFlag(userId: string, value: boolean): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ bfr_bands_available: value })
    .eq("id", userId);
  if (error) console.error("setBfrFlag failed:", error);
}

// ---------- Check-ins ----------

export async function fetchTodayCheckin(
  userId: string,
  date: string,
): Promise<DailyCheckin | null> {
  const { data, error } = await supabase
    .from("daily_checkins")
    .select("id, checkin_date, energy, minutes_available, daily_checkin_soreness(severity, muscle_regions(name))")
    .eq("user_id", userId)
    .eq("checkin_date", date)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("fetchTodayCheckin failed:", error);
    return null;
  }
  const soreness: Record<string, number> = {};
  for (const s of (data as any).daily_checkin_soreness ?? []) {
    const name = s.muscle_regions?.name;
    if (name) soreness[name] = s.severity;
  }
  return {
    id: data.id,
    checkinDate: data.checkin_date,
    energy: data.energy,
    minutesAvailable: data.minutes_available,
    soreness,
  };
}

export interface SaveCheckinInput {
  userId: string;
  date: string;
  energy: number;
  minutesAvailable: number;
  /** muscle_regions.name → severity */
  soreness: Record<string, number>;
}

export async function saveCheckin(input: SaveCheckinInput): Promise<DailyCheckin | null> {
  try {
    const { data, error } = await supabase
      .from("daily_checkins")
      .upsert(
        {
          user_id: input.userId,
          checkin_date: input.date,
          energy: input.energy,
          minutes_available: input.minutesAvailable,
        },
        { onConflict: "user_id,checkin_date" },
      )
      .select("id")
      .single();
    if (error) throw error;

    const { error: delError } = await supabase
      .from("daily_checkin_soreness")
      .delete()
      .eq("checkin_id", data.id);
    if (delError) throw delError;

    const soreNames = Object.keys(input.soreness);
    if (soreNames.length > 0) {
      const { data: regions, error: regError } = await supabase
        .from("muscle_regions")
        .select("id, name")
        .in("name", soreNames);
      if (regError) throw regError;
      const rows = (regions ?? []).map((r) => ({
        checkin_id: data.id,
        muscle_region_id: r.id,
        severity: input.soreness[r.name],
      }));
      if (rows.length > 0) {
        const { error: insError } = await supabase
          .from("daily_checkin_soreness")
          .insert(rows);
        if (insError) throw insError;
      }
    }
    return fetchTodayCheckin(input.userId, input.date);
  } catch (e) {
    console.error("saveCheckin failed:", e);
    return null;
  }
}

// ---------- Candidate data assembly ----------

export interface CandidateData {
  candidates: SessionCandidate[];
  byExerciseId: Map<string, SessionCandidate>;
  skillState: Record<string, SkillStateLevel>;
  regressions: Map<string, string>;
  lastCompletedSplitDay: SplitDay | null;
  firstSessionDate: string | null;
}

/** Everything the rules tier needs, in one round of queries. */
export async function fetchCandidateData(userId: string): Promise<CandidateData> {
  const [exercisesRes, capturedRes, recencyRes, skillRes, regRes, historyRes] =
    await Promise.all([
      supabase.from("exercises").select(`
        id, name, skill_level, equipment_types,
        muscle_regions:exercise_muscle_regions(is_primary, muscle_region:muscle_regions(name)),
        goal_types:exercise_goal_types(goal_type:goal_types(name))
      `),
      supabase
        .from("source_exercises")
        .select("exercise_id, source:captured_sources!inner(user_id, extraction_status)"),
      supabase
        .from("exercise_instances")
        .select("exercise_id, performed_date")
        .eq("user_id", userId)
        .not("performed_date", "is", null)
        .order("performed_date", { ascending: false })
        .limit(500),
      supabase
        .from("exercise_skill_state")
        .select("exercise_id, current_level")
        .eq("user_id", userId),
      supabase
        .from("movement_scaling_links")
        .select("from_exercise_id, to_exercise_id, display_order")
        .eq("scaling_type", "regression")
        .order("display_order", { ascending: true }),
      supabase
        .from("generated_sessions")
        .select("session_date, split_day, status, created_at")
        .eq("user_id", userId)
        .order("session_date", { ascending: true }),
    ]);

  const capturedIds = new Set(
    (capturedRes.data ?? [])
      .filter((r: any) => r.source?.user_id === userId && r.source?.extraction_status === "reviewed")
      .map((r: any) => r.exercise_id),
  );

  const today = new Date();
  const lastPerformed = new Map<string, number>();
  for (const row of recencyRes.data ?? []) {
    if (lastPerformed.has(row.exercise_id)) continue;
    const days = Math.floor(
      (today.getTime() - new Date(`${row.performed_date}T00:00:00`).getTime()) / 86400000,
    );
    lastPerformed.set(row.exercise_id, Math.max(0, days));
  }

  const candidates: SessionCandidate[] = (exercisesRes.data ?? []).map((row: any) => ({
    exerciseId: row.id,
    name: row.name,
    skillLevel: row.skill_level ?? null,
    goalTypes: (row.goal_types ?? []).map((g: any) => g.goal_type?.name).filter(Boolean),
    muscles: (row.muscle_regions ?? []).map((m: any) => ({
      name: m.muscle_region?.name ?? "",
      isPrimary: !!m.is_primary,
    })),
    equipmentTypes: row.equipment_types ?? [],
    isCapture: capturedIds.has(row.id),
    lastPerformedDaysAgo: lastPerformed.get(row.id) ?? null,
  }));

  const skillState: Record<string, SkillStateLevel> = {};
  for (const row of skillRes.data ?? []) skillState[row.exercise_id] = row.current_level;

  const regressions = new Map<string, string>();
  for (const row of regRes.data ?? []) {
    if (!regressions.has(row.from_exercise_id)) {
      regressions.set(row.from_exercise_id, row.to_exercise_id);
    }
  }

  const history = historyRes.data ?? [];

  return {
    candidates,
    byExerciseId: new Map(candidates.map((c) => [c.exerciseId, c])),
    skillState,
    regressions,
    // Reads past unstamped sessions (a catalog workout served whole) to the
    // last day that actually moved the rotation.
    lastCompletedSplitDay: lastStampedSplitDay(
      history.map((h: any) => ({
        sessionDate: h.session_date,
        createdAt: h.created_at ?? "",
        splitDay: h.split_day,
        status: h.status,
      })),
    ),
    firstSessionDate: history[0]?.session_date ?? null,
  };
}

// ---------- Generated sessions ----------

export async function fetchTodaySession(
  userId: string,
  date: string,
): Promise<StoredSession | null> {
  // A date can hold more than one session since catalog workouts became
  // startable: the replaced suggestion stays as a skipped row beside the one
  // you chose, and a second workout after a finished one is a second row.
  const { data: rows, error } = await supabase
    .from("generated_sessions")
    .select(`
      id, session_date, split_day, ramp_week, source, served_captured_workout_id,
      status, workout_instance_id, gym_profile_id, section_minutes,
      compose_signature, created_at,
      items:generated_session_items(
        id, exercise_id, item_order, section, target_sets, target_reps,
        rest_seconds, reason, was_performed, exercise:exercises(name)
      ),
      blocks:generated_session_blocks(
        id, block, name, captured_workout_id, builtin_key, minutes,
        rounds_note, reason
      )
    `)
    .eq("user_id", userId)
    .eq("session_date", date);
  if (error || !rows) {
    if (error) console.error("fetchTodaySession failed:", error);
    return null;
  }
  const data = pickDaySession(
    rows.map((r: any) => ({ ...r, createdAt: r.created_at ?? "" })),
  );
  if (!data) return null;
  return {
    id: data.id,
    sessionDate: data.session_date,
    splitDay: data.split_day,
    rampWeek: data.ramp_week,
    source: data.source,
    servedCapturedWorkoutId: data.served_captured_workout_id,
    status: data.status,
    workoutInstanceId: data.workout_instance_id,
    gymProfileId: data.gym_profile_id,
    // Rows written before the column existed, and workouts served whole, have
    // no stored estimate; the tab derives one from the items instead.
    sectionMinutes: (data.section_minutes ?? {}) as SectionMinutes,
    items: ((data as any).items ?? [])
      .sort((a: any, b: any) => a.item_order - b.item_order)
      .map((i: any) => ({
        id: i.id,
        exerciseId: i.exercise_id,
        name: i.exercise?.name ?? "Unknown",
        section: i.section,
        itemOrder: i.item_order,
        targetSets: i.target_sets,
        targetReps: i.target_reps,
        restSeconds: i.rest_seconds,
        reason: i.reason,
        wasPerformed: i.was_performed,
      })),
    // Empty is the truthful answer for a session composed before blocks and
    // for a workout served whole. The name comes off the row rather than a
    // join, so a block whose workout was later deleted still reads as history.
    blocks: (((data as any).blocks ?? []) as any[])
      .map((b): StoredBlock => ({
        id: b.id,
        block: b.block,
        workoutId: b.captured_workout_id,
        builtinKey: b.builtin_key,
        minutes: b.minutes,
        roundsNote: b.rounds_note,
        reason: b.reason,
        name: b.name,
      }))
      .sort((a, b) => BLOCK_ORDER.indexOf(a.block) - BLOCK_ORDER.indexOf(b.block)),
    composeSignature: data.compose_signature ?? null,
  };
}

export interface SaveSessionInput {
  userId: string;
  date: string;
  gymProfileId: string | null;
  checkinId: string | null;
  session: ComposedSession;
  /** Block plan for a block-composed session; empty for legacy shapes. */
  blocks: BlockPick[];
  /** The compose inputs, hashed by the caller. Stamped onto the row last, so
   *  a session that carries it is one that finished writing. */
  composeSignature: string;
  inputsSnapshot: unknown;
}

/** Upsert today's suggestion. Regeneration (gym/check-in change) replaces the
 *  row's items; an accepted/completed session is never overwritten. */
export async function saveGeneratedSession(input: SaveSessionInput): Promise<string | null> {
  try {
    const existing = await fetchTodaySession(input.userId, input.date);
    // The write boundary holds the same rule as the hook: never overwrite a
    // session the user chose, and never overwrite one already under way.
    if (existing && (existing.status !== "suggested" || existing.source === "user_pick")) {
      return existing.id;
    }

    const row = {
      user_id: input.userId,
      session_date: input.date,
      gym_profile_id: input.gymProfileId,
      checkin_id: input.checkinId,
      split_day: input.session.splitDay,
      ramp_week: input.session.rampWeek,
      source: input.session.source,
      served_captured_workout_id: input.session.servedCapturedWorkoutId,
      section_minutes: Object.keys(input.session.sectionMinutes).length > 0
        ? input.session.sectionMinutes
        : null,
      status: "suggested",
      inputs_snapshot: input.inputsSnapshot ?? null,
    };
    // Not an upsert on (user_id, session_date): that pair is no longer unique.
    // Only one PENDING session per day is, and a partial index can't back
    // ON CONFLICT — so rewrite the suggestion we already have, or start one.
    const { data, error } = existing
      ? await supabase
          .from("generated_sessions")
          .update(row)
          .eq("id", existing.id)
          .select("id")
          .single()
      : await supabase
          .from("generated_sessions")
          .insert(row)
          .select("id")
          .single();
    if (error) throw error;

    const { error: delError } = await supabase
      .from("generated_session_items")
      .delete()
      .eq("session_id", data.id);
    if (delError) throw delError;

    if (input.session.items.length > 0) {
      const { error: insError } = await supabase.from("generated_session_items").insert(
        input.session.items.map((i) => ({
          session_id: data.id,
          exercise_id: i.exerciseId,
          item_order: i.itemOrder,
          section: i.section,
          target_sets: i.targetSets,
          target_reps: i.targetReps,
          rest_seconds: i.restSeconds,
          reason: i.reason,
        })),
      );
      if (insError) throw insError;
    }

    // The amended CHECK is mutual exclusion, not presence: both columns NULL is
    // legal now, so a deleted workout can leave named history behind. That
    // makes this writer the only thing standing between a sourceless pick and a
    // block that can never be rerolled, logged or opened — the client is
    // untyped and the database will not catch it.
    const blocks = input.blocks.filter((b) => {
      if (b.workoutId || b.builtinKey) return true;
      console.error("saveGeneratedSession: dropped block with no source:", b.block, b.name);
      return false;
    });

    // Upsert onto UNIQUE (session_id, block), then prune what this plan no
    // longer claims — the same shape workoutTags uses, and for the same reason.
    // Deleting first would open a window in which a failed insert leaves the
    // session with items and no plan to explain them, and a suggestion is only
    // recomposed when its inputs change, so that window does not close by
    // itself. The rows to prune are the ones read at the top of this function,
    // before any write: an insert made a new session, so it has none. Scoping
    // the delete to those ids means a row another writer INSERTED in the
    // meantime survives — its id cannot be in a list read before it existed.
    // It says nothing about a row updated in place, which the upsert above
    // would have overwritten anyway.
    if (blocks.length > 0) {
      const { error: blkError } = await supabase.from("generated_session_blocks").upsert(
        blocks.map((b) => ({
          session_id: data.id,
          block: b.block,
          name: b.name,
          captured_workout_id: b.workoutId,
          builtin_key: b.builtinKey,
          minutes: b.minutes,
          rounds_note: b.roundsNote,
          reason: b.reason,
        })),
        { onConflict: "session_id,block" },
      );
      if (blkError) throw blkError;
    }

    const keptBlocks = new Set(blocks.map((b) => b.block));
    const staleBlockIds = (existing?.blocks ?? [])
      .filter((b) => !keptBlocks.has(b.block))
      .map((b) => b.id);
    if (staleBlockIds.length > 0) {
      const { error: pruneError } = await supabase
        .from("generated_session_blocks")
        .delete()
        .in("id", staleBlockIds);
      if (pruneError) throw pruneError;
    }

    // Stamped LAST, on its own, and never as part of the row above. The tab
    // treats a session carrying the current signature as one it already built
    // and leaves it alone — which is what lets a rerolled block survive a
    // refetch. Everything above can fail partway; a signature written before
    // them would mark a half-written session as finished and nothing would
    // ever recompose it, so the stamp has to mean "all of that landed".
    //
    // Its own failure is not the save's failure: the session is written and
    // correct, it is merely unclaimed, and the next load composes it again.
    const { error: sigError } = await supabase
      .from("generated_sessions")
      .update({ compose_signature: input.composeSignature })
      .eq("id", data.id);
    if (sigError) console.error("saveGeneratedSession signature stamp failed:", sigError);
    return data.id;
  } catch (e) {
    // The bare object logs as "{"code":"PGRST…" and truncates in the on-device
    // toast, which is exactly where you read it — so name the parts.
    const err = e as { code?: string; message?: string; details?: string };
    console.error(
      "saveGeneratedSession failed:",
      err?.code ?? "", err?.message ?? String(e), err?.details ?? "",
    );
    return null;
  }
}

/** A block plan's catalog workouts as loggable session items — built-in
 *  blocks contribute none (their movements aren't exercise rows). Sections
 *  map per spec §7 (conditioning → accessory).
 *
 *  One query covers every workout, so the rows arrive interleaved by
 *  `exercise_order` across workouts; partitioning a sorted list preserves each
 *  workout's own order within its group. The picks are walked in block order
 *  rather than the caller's, because `itemOrder` is the sequence the logging
 *  screen trains in and a warm-up must not land after the cool-down. */
export async function blockPicksToItems(picks: BlockPick[]): Promise<SessionItem[]> {
  const workoutIds = picks.map((p) => p.workoutId).filter((id): id is string => id !== null);
  if (workoutIds.length === 0) return [];
  const { data, error } = await supabase
    .from("captured_workout_exercises")
    .select("captured_workout_id, exercise_id, exercise_order, target_sets, target_reps, rest_seconds")
    .in("captured_workout_id", workoutIds)
    .order("exercise_order", { ascending: true });
  if (error) {
    console.error("blockPicksToItems failed:", error);
    return [];
  }
  const byWorkout = new Map<string, any[]>();
  for (const row of data ?? []) {
    const list = byWorkout.get(row.captured_workout_id) ?? [];
    list.push(row);
    byWorkout.set(row.captured_workout_id, list);
  }
  const items: SessionItem[] = [];
  const ordered = [...picks].sort(
    (a, b) => BLOCK_ORDER.indexOf(a.block) - BLOCK_ORDER.indexOf(b.block),
  );
  for (const pick of ordered) {
    if (!pick.workoutId) continue;
    for (const row of byWorkout.get(pick.workoutId) ?? []) {
      items.push({
        exerciseId: row.exercise_id,
        section: SECTION_FOR_BLOCK[pick.block],
        itemOrder: items.length,
        targetSets: row.target_sets,
        targetReps: row.target_reps,
        restSeconds: row.rest_seconds,
        reason: null,
      });
    }
  }
  return items;
}

/** Rebuild `item_order` as one sequence across the session, in section order.
 *
 *  A reroll replaces one section's items in place, and whatever numbers those
 *  new rows carry are read by the logging screen as where in the day they
 *  belong — so without this a rerolled warm-up is logged after the cool-down,
 *  and two rerolls of different blocks collide on the same numbers.
 *
 *  Best-effort, and deliberately not fatal: a failure here leaves a correct
 *  plan in a wrong order, which is worse to report as a failed reroll than to
 *  leave standing. */
async function renumberSessionItems(sessionId: string): Promise<void> {
  const { data, error } = await supabase
    .from("generated_session_items")
    .select("id, section, item_order")
    .eq("session_id", sessionId);
  if (error) {
    console.error("renumberSessionItems read failed:", error);
    return;
  }
  const ordered = [...(data ?? [])].sort((a: any, b: any) => {
    const bySection = (SECTION_RANK[a.section as SessionSection] ?? 99)
      - (SECTION_RANK[b.section as SessionSection] ?? 99);
    return bySection !== 0 ? bySection : a.item_order - b.item_order;
  });
  // In parallel, not in sequence: replacing the first block shifts every item
  // after it, so this is most of the session, and a round trip each would be
  // felt on the tap that started it.
  const results = await Promise.all(
    ordered
      .map((row: any, i: number) => ({ row, i }))
      .filter(({ row, i }) => row.item_order !== i)
      .map(({ row, i }) =>
        supabase.from("generated_session_items").update({ item_order: i }).eq("id", row.id),
      ),
  );
  for (const r of results) {
    if (r.error) console.error("renumberSessionItems update failed:", r.error);
  }
}

/** Called by the logging screen when the user starts the session. */
export async function acceptSession(sessionId: string, workoutInstanceId: string): Promise<void> {
  const { error } = await supabase
    .from("generated_sessions")
    .update({ status: "accepted", workout_instance_id: workoutInstanceId })
    .eq("id", sessionId);
  if (error) console.error("acceptSession failed:", error);
}

/** Called on finish: stamp the outcome and backfill suggested-vs-performed. */
export async function completeSession(
  sessionId: string,
  performedExerciseIds: string[],
): Promise<void> {
  const performed = new Set(performedExerciseIds);
  const { data: items, error } = await supabase
    .from("generated_session_items")
    .select("id, exercise_id")
    .eq("session_id", sessionId);
  if (error) {
    console.error("completeSession read failed:", error);
    return;
  }
  for (const item of items ?? []) {
    const { error: upError } = await supabase
      .from("generated_session_items")
      .update({ was_performed: performed.has(item.exercise_id) })
      .eq("id", item.id);
    if (upError) console.error("completeSession item update failed:", upError);
  }
  const { error: sessError } = await supabase
    .from("generated_sessions")
    .update({ status: "completed" })
    .eq("id", sessionId);
  if (sessError) {
    // The day is not on record as trained, so it must not be on record in the
    // ledger either — coverage would then steer tomorrow away from muscles a
    // retried completion has yet to claim.
    console.error("completeSession status failed:", sessError);
    return;
  }

  // The ledger records what actually ran — composed blocks and workouts served
  // whole alike. Muscles are denormalized now, so a later retag never rewrites
  // history. maybeSingle, not single: the row can be gone (deleted, or another
  // device's write) and the status update above has already landed, so there is
  // nothing here worth throwing over.
  const { data: sess, error: readError } = await supabase
    .from("generated_sessions")
    .select(`
      user_id, session_date, served_captured_workout_id,
      blocks:generated_session_blocks(block, captured_workout_id)
    `)
    .eq("id", sessionId)
    .maybeSingle();
  if (readError || !sess) {
    if (readError) console.error("completeSession ledger read failed:", readError);
    return;
  }
  const entries: { capturedWorkoutId: string; block: BlockRole }[] = [];
  for (const b of ((sess as any).blocks ?? []) as any[]) {
    if (b.captured_workout_id) {
      entries.push({ capturedWorkoutId: b.captured_workout_id, block: b.block });
    }
  }
  // A workout served whole writes no block rows — the adopt path, and the
  // composer's own serve-whole answer. It counts as the day's main work.
  if (entries.length === 0 && sess.served_captured_workout_id) {
    entries.push({ capturedWorkoutId: sess.served_captured_workout_id, block: "main" });
  }
  if (entries.length === 0) return;
  const ids = [...new Set(entries.map((e) => e.capturedWorkoutId))];
  const { data: muscleRows, error: muscleError } = await supabase
    .from("captured_workout_muscles")
    .select("captured_workout_id, is_primary, muscle_region:muscle_regions(name)")
    .in("captured_workout_id", ids);
  if (muscleError) {
    // Not recoverable later, so not written now. The muscles are denormalized
    // at time of performance precisely so nothing ever rewrites them — and
    // nothing does; this runs once, from the finish handler. Carrying on past
    // a blip would write rows that are present, unique-constrained and
    // permanently muscle-blind, and coverage would read the day as trained
    // while hitting nothing. A missing row is the same day read as untrained,
    // which at least errs toward more recovery rather than less.
    console.error("completeSession: ledger skipped, muscle read failed:", muscleError);
    return;
  }
  const musclesByWorkout = new Map<string, { name: string; isPrimary: boolean }[]>();
  for (const m of (muscleRows ?? []) as any[]) {
    const name = m.muscle_region?.name;
    if (!name) continue;
    const list = musclesByWorkout.get(m.captured_workout_id) ?? [];
    list.push({ name, isPrimary: !!m.is_primary });
    musclesByWorkout.set(m.captured_workout_id, list);
  }
  // recordUsage returns false on a failed write: the day's training then never
  // counts toward the coverage that steers tomorrow's pick, and the unique
  // constraint makes a retry safe. Log it loudly rather than dropping it on
  // the floor.
  const ledgerWritten = await recordUsage({
    userId: sess.user_id,
    sessionId,
    performedDate: sess.session_date,
    entries: entries.map((e) => ({
      ...e,
      muscles: musclesByWorkout.get(e.capturedWorkoutId) ?? [],
    })),
  });
  if (!ledgerWritten) {
    console.error("completeSession: ledger write failed for session", sessionId);
  }
}

/**
 * Swap ONE block for the next shortlist candidate (spec §6). Only a
 * still-suggested session rerolls — an accepted or completed day is history.
 * The shortlists ride in inputs_snapshot, written at compose time; a session
 * composed before that existed, or a workout adopted whole (which stores no
 * snapshot at all), simply has nothing to cycle and the reroll declines.
 *
 * The day's total re-flows here: a swap is bounded by the block's own
 * envelope, but main's envelope can be 25 minutes wide, so a reroll can push
 * the day past the budget. section_minutes is what the Today tab sums for its
 * planned-minutes line, so it is recomputed from the blocks as they now stand
 * — §6 says the totals re-flow, and nothing else would ever put them right.
 * compose_signature is deliberately left alone: a reroll modifies a plan built
 * from those inputs, it does not compose a new one from different ones.
 *
 * These are four statements and not a transaction, and unlike a compose there
 * is no later pass to tidy up after one — a reroll is a decision the user made
 * and nothing recomputes it. So the block row, which is the half the Today tab
 * renders, is written LAST. A failure before it leaves the plan on screen
 * exactly as it was, which is what returning false says, and the stale half is
 * the invisible one: the session's item rows already belong to the new
 * workout. Starting the day would then log the new block's movements under the
 * old block's name. Better than the reverse — a name the user chose over
 * movements that were never it — but still wrong, and worth knowing about.
 */
export async function rerollBlock(
  sessionId: string,
  block: BlockRole,
): Promise<boolean> {
  try {
    const { data: sess, error } = await supabase
      .from("generated_sessions")
      .select(`
        status, inputs_snapshot, section_minutes,
        blocks:generated_session_blocks(id, block, minutes, captured_workout_id, builtin_key)
      `)
      .eq("id", sessionId)
      .single();
    if (error || !sess) throw error ?? new Error("session not found");
    if (sess.status !== "suggested") return false;

    const shortlists = (sess.inputs_snapshot as any)?.shortlists ?? {};
    const list = (shortlists[block] ?? []) as BlockCandidate[];
    const blockRows = ((sess as any).blocks ?? []) as any[];
    const current = blockRows.find((b) => b.block === block);
    if (!current) return false;
    const next = nextCandidate(list, current.captured_workout_id ?? current.builtin_key ?? "");
    if (!next) return false;
    // Both columns NULL is legal now — it is how a deleted workout leaves named
    // history — so writing a sourceless candidate would quietly turn a live
    // block into one, with nothing left to log or reroll from.
    if (!next.workoutId && !next.builtinKey) {
      console.error("rerollBlock: shortlist candidate has no source:", block, next.name);
      return false;
    }

    // Replace just this block's loggable items. Safe to key on the section
    // because the block→section map is injective: conditioning is the only
    // block that lands in `accessory`, and `bfr` has no block at all. A
    // built-in replacement contributes none, so the delete stands alone.
    const { error: delError } = await supabase
      .from("generated_session_items")
      .delete()
      .eq("session_id", sessionId)
      .eq("section", SECTION_FOR_BLOCK[block]);
    if (delError) throw delError;
    if (next.workoutId) {
      const items = await blockPicksToItems([
        { block, workoutId: next.workoutId, builtinKey: null, name: next.name,
          minutes: next.minutes, roundsNote: next.roundsNote, reason: null },
      ]);
      if (items.length > 0) {
        const { error: insError } = await supabase.from("generated_session_items").insert(
          items.map((i) => ({
            session_id: sessionId,
            exercise_id: i.exerciseId,
            // A staging value, not the answer: renumberSessionItems below puts
            // the sequence back. It is deliberately past every composed item's
            // order, because that renumber is non-fatal — and if it doesn't
            // run, "the rerolled block sorts last" is at least a stable,
            // predictable wrong, where starting from 0 would interleave these
            // rows among the others in no defined order.
            item_order: REROLL_ITEM_ORDER_BASE + i.itemOrder,
            section: i.section,
            target_sets: i.targetSets,
            target_reps: i.targetReps,
            rest_seconds: i.restSeconds,
            reason: null,
          })),
        );
        if (insError) throw insError;
      }
    }
    await renumberSessionItems(sessionId);

    // Last, and the only step whose failure the caller hears about — see the
    // docblock. Everything above is invisible until this names the new pick.
    const { error: upError } = await supabase
      .from("generated_session_blocks")
      .update({
        captured_workout_id: next.workoutId,
        builtin_key: next.builtinKey,
        name: next.name,
        minutes: next.minutes,
        rounds_note: next.roundsNote,
        reason: null, // the model's reason explained the OLD pick
      })
      .eq("id", current.id);
    if (upError) throw upError;

    // Derived from the swap rather than part of it, so it is not allowed to
    // report a reroll that happened as one that didn't.
    const reflowed: SectionMinutes = { ...((sess.section_minutes ?? {}) as SectionMinutes) };
    for (const b of blockRows) {
      const section = SECTION_FOR_BLOCK[b.block as BlockRole];
      if (!section) continue;
      reflowed[section] = b.id === current.id ? next.minutes : b.minutes;
    }
    const { error: minError } = await supabase
      .from("generated_sessions")
      .update({ section_minutes: reflowed })
      .eq("id", sessionId);
    if (minError) console.error("rerollBlock section_minutes re-flow failed:", minError);
    return true;
  } catch (e) {
    console.error("rerollBlock failed:", e);
    return false;
  }
}

// ---------- Adopting a catalog workout ----------

export interface AdoptWorkoutInput {
  userId: string;
  capturedWorkoutId: string;
  /** Sampled once by the caller — the app's no-two-clocks rule. */
  date: string;
}

/**
 * Make a captured workout today's session and return its id.
 *
 * Inside the suggest-only boundary: this runs from the user's tap, never from
 * a compute. Spec §4.
 *
 * The pending session for the day is marked skipped rather than overwritten,
 * so "suggested X, did Y instead" survives as a signal. A session already
 * COMPLETED on this date is left exactly as it is — rewriting it would make
 * the rotation lookback reach past a day that was genuinely trained.
 *
 * The session is stored unstamped (`split_day` NULL): a workout served whole
 * is not a push, pull or legs day, so the rotation stands still.
 */
export async function adoptCapturedWorkout(
  input: AdoptWorkoutInput,
): Promise<string | null> {
  try {
    const workout = await fetchCapturedWorkout(input.capturedWorkoutId);
    if (!workout) throw new Error("workout not found");
    if (workout.items.length === 0) throw new Error("workout has no movements");

    const [{ data: pending }, { data: firstRow }, { data: gym }, checkin] =
      await Promise.all([
        supabase
          .from("generated_sessions")
          .select("id")
          .eq("user_id", input.userId)
          .eq("session_date", input.date)
          .in("status", ["suggested", "accepted"]),
        supabase
          .from("generated_sessions")
          .select("session_date")
          .eq("user_id", input.userId)
          .order("session_date", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("gym_profiles")
          .select("id")
          .eq("user_id", input.userId)
          .eq("is_active", true)
          .maybeSingle(),
        fetchTodayCheckin(input.userId, input.date),
      ]);

    // Stand the pending session down first: the partial unique index allows
    // only one per day, so the insert below would collide with it.
    for (const row of pending ?? []) {
      const { error: skipError } = await supabase
        .from("generated_sessions")
        .update({ status: "skipped" })
        .eq("id", row.id);
      if (skipError) throw skipError;
    }

    const { data: session, error: insError } = await supabase
      .from("generated_sessions")
      .insert({
        user_id: input.userId,
        session_date: input.date,
        gym_profile_id: gym?.id ?? null,
        // No check-in is required to start a workout you chose yourself; the
        // day's check-in is attached when there happens to be one.
        checkin_id: checkin?.id ?? null,
        split_day: null,
        ramp_week: rampWeek(firstRow?.session_date ?? null, input.date),
        source: "user_pick",
        served_captured_workout_id: workout.workoutId,
        // We did not compose its sections, so we do not time them.
        section_minutes: null,
        status: "suggested",
        inputs_snapshot: null,
      })
      .select("id")
      .single();
    if (insError) throw insError;

    const items = capturedWorkoutToSessionItems(
      workout.items.map((i) => ({
        exerciseId: i.exerciseId,
        sets: i.sets,
        reps: i.reps,
        restSeconds: i.restSeconds,
      })),
    );
    const { error: itemError } = await supabase
      .from("generated_session_items")
      .insert(
        items.map((i) => ({
          session_id: session.id,
          exercise_id: i.exerciseId,
          item_order: i.itemOrder,
          section: i.section,
          target_sets: i.targetSets,
          target_reps: i.targetReps,
          rest_seconds: i.restSeconds,
          reason: i.reason,
        })),
      );
    if (itemError) throw itemError;

    return session.id;
  } catch (e) {
    const err = e as { code?: string; message?: string; details?: string };
    console.error(
      "adoptCapturedWorkout failed:",
      err?.code ?? "", err?.message ?? String(e), err?.details ?? "",
    );
    return null;
  }
}

/** Today's session, whatever its state — what Start needs to know before it
 *  replaces the day. */
export async function fetchDayStatus(
  userId: string,
  date: string,
): Promise<{ hasPending: boolean; hasCompleted: boolean; inProgress: boolean }> {
  const { data, error } = await supabase
    .from("generated_sessions")
    .select("status, workout_instance_id")
    .eq("user_id", userId)
    .eq("session_date", date);
  if (error) {
    console.error("fetchDayStatus failed:", error);
    return { hasPending: false, hasCompleted: false, inProgress: false };
  }
  const rows = data ?? [];
  return {
    hasPending: rows.some((r) => r.status === "suggested" || r.status === "accepted"),
    hasCompleted: rows.some((r) => r.status === "completed"),
    inProgress: rows.some((r) => r.status === "accepted" && r.workout_instance_id),
  };
}
