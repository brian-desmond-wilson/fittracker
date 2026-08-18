// Client half of the daily loop: gyms, check-ins, generated sessions, and the
// data-assembly the rules tier consumes. Suggest-only boundary: the ONLY
// session writes here are the suggestion record itself and status
// transitions the user's taps cause.
import { supabase } from "../supabase";
import { lastStampedSplitDay, rampWeek } from "../dailySplit";
import { capturedWorkoutToSessionItems, pickDaySession } from "../dailyAdopt";
import { fetchCapturedWorkout } from "./capture";
import type {
  ComposedSession,
  DailyCheckin,
  GymProfile,
  SectionMinutes,
  SessionCandidate,
  SkillStateLevel,
  SplitDay,
  StoredSession,
} from "../../types/daily";

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
      status, workout_instance_id, gym_profile_id, section_minutes, created_at,
      items:generated_session_items(
        id, exercise_id, item_order, section, target_sets, target_reps,
        rest_seconds, reason, was_performed, exercise:exercises(name)
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
    // Not read yet — Task 12 joins generated_session_blocks here. Empty is
    // also the truthful answer for every session composed before blocks.
    blocks: [],
  };
}

export interface SaveSessionInput {
  userId: string;
  date: string;
  gymProfileId: string | null;
  checkinId: string | null;
  session: ComposedSession;
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
  if (sessError) console.error("completeSession status failed:", sessError);
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
