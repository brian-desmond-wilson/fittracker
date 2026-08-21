// Orchestrates the daily loop: rules tier → one AI ask → persisted session.
// Operational scaffolding copies useFuelPlan: module-scope signature cache +
// in-flight coalescing, exactly one retry (token refresh survival),
// event-driven recompute — never timers, one clock sample per compute.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
// Canonical home for the calendar-date helpers — lib/dates.ts, not the
// workout-session re-export, which exists only for older call sites.
import { addDays, getLocalDateString, localDayStartMs, parseLocalDate } from "../lib/dates";
import { rampWeek } from "../lib/dailySplit";
import { muscleCoverage } from "../lib/dailyCoverage";
import { blockEnvelopes } from "../lib/dailyBlockBudget";
import {
  isRecoveryDay,
  effectiveRecovery,
  buildBlockShortlists,
} from "../lib/dailyBlockShortlist";
import {
  bfrFinisherPick,
  BFR_FINISHER_MINUTES,
  composeBlockFallback,
  validateBlockComposition,
  mergeLockedPicks,
  plannedBlockMinutes,
  extractDayReason,
  BLOCK_ORDER,
  SECTION_FOR_BLOCK,
} from "../lib/dailyBlockCompose";
import {
  blockPicksToItems,
  fetchBfrFlag,
  fetchGyms,
  fetchLatestDebrief,
  fetchRecentAdjustments,
  fetchSkillStates,
  fetchTodayCheckin,
  fetchTodaySession,
  saveGeneratedSession,
} from "../lib/supabase/daily";
import { userSkillCeiling } from "../lib/dailySkill";
import {
  classifyWorkout,
  fetchMuscleRegionNames,
  fetchTaggedWorkouts,
  fetchUsage,
} from "../lib/supabase/workoutTags";
import { fetchCapturedWorkouts } from "../lib/supabase/capture";
import type {
  BlockPick,
  BlockRole,
  BlockShortlists,
  StoredBlock,
} from "../types/dailyBlocks";
import type {
  DailyCheckin,
  GymProfile,
  SectionMinutes,
  StoredSession,
} from "../types/daily";

const AI_RETRY_DELAY_MS = 1_200;
/** Keyed by ASK key, not by the stored compose signature: the signature
 *  deliberately ignores locks (flipping one must not recompose the day), but
 *  the locked set changes which blocks the model is even asked about — so two
 *  asks that differ only in locks must not share an answer. */
interface CachedAnswer {
  picks: BlockPick[] | null;
  dayReason: string | null;
}
const aiAnswerByAskKey = new Map<string, CachedAnswer>();
const aiAskInFlight = new Map<string, Promise<unknown>>();

/**
 * How far back the ledger read reaches. `muscleCoverage` weighs performances
 * 0-7 days old and discards the rest, so seven would do; the extra day means
 * the edge of the window is the arithmetic's and never the read's. Nothing
 * here needs to reach further — a workout's own last performance arrives with
 * `fetchTaggedWorkouts`, which keeps its own 30-day horizon.
 */
const COVERAGE_WINDOW_DAYS = 8;

/**
 * Attempts per workout per day. Not one, deliberately: `classifyWorkout`
 * answers null for a caption the model made nothing of AND for a call that
 * never reached it, and a single attempt treats those the same — eleven
 * workouts failing together on a spotty connection would bench the whole
 * catalog until tomorrow, and the pull-to-refresh that follows the signal
 * coming back would compose a built-ins-only day instead of repairing it.
 * Three attempts cost three calls in the worst case and cover a transient
 * failure; a caption that can never be classified still stops costing calls.
 */
const CLASSIFY_ATTEMPTS_PER_DAY = 3;
/** In-flight classify calls at once. Each is an OpenAI round trip, and the
 *  compose blocks on all of them. */
const CLASSIFY_POOL = 4;
/**
 * Workouts one compose will try to classify. The backfill exists to bring
 * today's catalog into play, not to process a library: today's eleven fit
 * inside this in a single run, and the share extension's several hundred would
 * otherwise mean several hundred concurrent OpenAI calls, near-certain rate
 * limiting, and a spinner measured in minutes. The overflow is not lost — the
 * catalog arrives newest-first, so a run takes the most recently captured, and
 * the rest are picked up by the loads that follow.
 */
const CLASSIFY_PER_RUN = 12;

/** What a workout's classification has cost today, and the call still on the
 *  wire if there is one. Module scope, so tomorrow or a restart starts over. */
interface ClassifyState {
  date: string;
  attempts: number;
  inFlight: Promise<unknown> | null;
}

/**
 * Lazy classification state, keyed by workout id.
 *
 * `inFlight` coalesces overlapping loads onto one call, because the run-id
 * guard cannot cancel a request already on the wire — it only stops the caller
 * from reading the answer, so a pull-to-refresh during a first-run backfill
 * would otherwise put a second copy of every classify call out there.
 * `attempts` is what stops a workout that can never be classified from costing
 * a call on every single refresh, forever.
 */
const classifyByWorkout = new Map<string, ClassifyState>();

/** Run `task` over `items`, at most `limit` at a time. `next++` needs no lock:
 *  the read and the increment are one synchronous step. */
async function pooled<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<unknown>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await task(items[next++]);
    }),
  );
}

async function askComposeSession(body: object): Promise<unknown> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, AI_RETRY_DELAY_MS));
    try {
      const { data, error } = await supabase.functions.invoke("compose-session", { body });
      if (error) throw error;
      return data?.composition ?? null;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

export interface UseDailySessionValue {
  session: StoredSession | null;
  checkin: DailyCheckin | null;
  activeGym: GymProfile | null;
  gyms: GymProfile[];
  loading: boolean;
  error: Error | null;
  /** Call after any input changes (check-in saved, gym switched). */
  refetch: () => void;
  /** Compose a fresh session on a day already trained. The completed session
   *  keeps its record; a new suggestion is built beside it, steered by what
   *  today's ledger now says was hit. Only meaningful when the day's session
   *  is completed — a no-op otherwise. */
  composeAnother: () => void;
  /** Recompose after a BLOCK-scoped adjust instruction: every other block of
   *  the current suggestion is held fixed for this one compose, so the
   *  instruction can only move the block it was aimed at. Day-scoped
   *  instructions just use refetch — the new instruction already changes the
   *  signature. */
  recomposeBlock: (block: BlockRole) => void;
}

export function useDailySession(refreshKey = 0): UseDailySessionValue {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [checkin, setCheckin] = useState<DailyCheckin | null>(null);
  const [gyms, setGyms] = useState<GymProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const runIdRef = useRef(0);
  // One-shot: set by composeAnother, consumed by the next load() run. A ref,
  // not state — it must not survive the run it was asked for, and it must
  // never itself trigger a render.
  const composeAnotherRef = useRef(false);
  // One-shot, same shape: the block a block-scoped adjust wants re-picked.
  // Consumed by the next run, which holds every OTHER block fixed for that
  // one compose.
  const adjustFocusRef = useRef<BlockRole | null>(null);

  const load = useCallback(async () => {
    const runId = ++runIdRef.current;
    try {
      // Every run re-enters the loading state, not just the first mount: a
      // recompute (check-in saved, gym switched) takes as long as the AI ask,
      // and without this the tab renders its "nothing yet" empty state for the
      // whole wait before snapping to the finished session.
      setLoading(true);
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not signed in");
      const today = getLocalDateString(); // one clock sample per compute

      const [gymList, todayCheckin, existing] = await Promise.all([
        fetchGyms(user.id),
        fetchTodayCheckin(user.id, today),
        fetchTodaySession(user.id, today),
      ]);
      if (runId !== runIdRef.current) return;
      setGyms(gymList);
      setCheckin(todayCheckin);

      // No check-in yet → nothing to compose; the sheet gates the day.
      if (!todayCheckin) {
        setSession(existing);
        setLoading(false);
        return;
      }
      // Already accepted/completed → show it as stored, never recompose.
      // A workout you picked yourself is never recomposed either, whatever its
      // status: recomposing would quietly undo the choice the moment the tab
      // reloaded or the check-in changed.
      //
      // The one sanctioned way past this gate is composeAnother on a COMPLETED
      // day — a second session composed beside the record, not over it. The
      // flag is consumed here so a pull-to-refresh a minute later goes back to
      // showing the stored day. Completed only: an accepted day is still in
      // progress, and the pending-per-day index couldn't hold two anyway.
      const appendToDay =
        composeAnotherRef.current && existing?.status === "completed";
      composeAnotherRef.current = false;
      // Consumed whether or not this run can honor it — a stale focus must
      // not leak into some later, unrelated recompose.
      const adjustFocus = adjustFocusRef.current;
      adjustFocusRef.current = null;
      if (
        !appendToDay &&
        existing && (existing.status !== "suggested" || existing.source === "user_pick")
      ) {
        setSession(existing);
        setLoading(false);
        return;
      }

      const activeGym = gymList.find((g) => g.isActive) ?? null;
      // Calendar arithmetic, not 24-hour arithmetic: a day either side of a
      // clock change is still a day, and formatting the result back through
      // toISOString would hand the database a UTC date, which is the wrong day
      // for half the world.
      const sinceDate = getLocalDateString(
        addDays(parseLocalDate(today), -COVERAGE_WINDOW_DAYS),
      );
      const [captured, usage, muscleNames, firstRow, adjustments, debrief, skillStates, bfrBands] =
        await Promise.all([
          fetchCapturedWorkouts(user.id),
          fetchUsage(user.id, sinceDate),
          fetchMuscleRegionNames(),
          supabase
            .from("generated_sessions")
            .select("session_date")
            .eq("user_id", user.id)
            .order("session_date", { ascending: true })
            .limit(1)
            .maybeSingle()
            .then((r) => r.data),
          fetchRecentAdjustments(user.id),
          // The coverage window (8 days) is a fine horizon for "how did the
          // last one land" too — a week-old debrief is the newest worth hearing.
          fetchLatestDebrief(user.id, `${sinceDate}T00:00:00`),
          fetchSkillStates(user.id),
          fetchBfrFlag(user.id),
        ]);
      if (runId !== runIdRef.current) return;

      // ---- Lazy classification backfill (spec §3.1, §8): tag what isn't
      // tagged, in place, before shortlisting. A failure leaves that workout
      // out of play today; the next refresh retries it, up to its budget, and
      // tomorrow starts over. See classifyByWorkout and the three constants
      // above for what bounds this.
      if (muscleNames.length > 0) {
        const due = captured
          .filter((w) => w.tags.classifiedAt === null)
          .filter((w) => {
            const s = classifyByWorkout.get(w.workoutId);
            // Fresh, still on the wire, or with budget left. A workout that
            // has spent today's budget takes no slot, so it can't crowd out
            // one that has never been tried.
            return !s || s.date !== today
              || s.inFlight !== null || s.attempts < CLASSIFY_ATTEMPTS_PER_DAY;
          })
          .slice(0, CLASSIFY_PER_RUN);
        await pooled(due, CLASSIFY_POOL, (w) => {
          const prior = classifyByWorkout.get(w.workoutId);
          const state: ClassifyState = prior && prior.date === today
            ? prior
            : { date: today, attempts: 0, inFlight: null };
          classifyByWorkout.set(w.workoutId, state);
          // Join the call already out there rather than adding to it; it is
          // the same question and it already spent an attempt.
          if (state.inFlight) return state.inFlight;
          if (state.attempts >= CLASSIFY_ATTEMPTS_PER_DAY) return Promise.resolve(null);
          state.attempts += 1;
          // The catch precedes the bookkeeping, so nothing here can reject and
          // leave `inFlight` pointing at a settled call forever.
          const done = classifyWorkout(w, muscleNames)
            .catch(() => null)
            .then((tags) => {
              state.inFlight = null;
              return tags;
            });
          state.inFlight = done;
          return done;
        });
      }
      const tagged = await fetchTaggedWorkouts(user.id, today);
      if (runId !== runIdRef.current) return;
      // null = the read FAILED, which is not the same as an empty catalog.
      // An empty catalog composes a legitimate built-ins-only day, so saving
      // one on a network blip would persist a recovery-shaped day the user
      // never had. Abort instead — the tab reports it and a pull-to-refresh
      // retries, which is honest in a way a wrong day would not be.
      //
      // Both aborts publish the day already on file first. The tab's
      // banner-over-plan path needs a session to put the banner over, and on a
      // cold start there is nothing in state to fall back to — so without this
      // a blip on the first load of the day replaces a perfectly good stored
      // plan with a full-screen "couldn't build today's session". `existing`
      // was read successfully at the top of this run; null is the honest answer
      // when there is genuinely no plan yet, and the tab takes the screen then.
      if (tagged === null) {
        setSession(existing);
        throw new Error("couldn't read your workout catalog");
      }
      // Same for the ledger: recency-blind, every workout reads as
      // never-performed, the 4-day repeat gate stops holding and the recency
      // score saturates for everything. `[]` is a real state (a week of rest).
      if (usage === null) {
        setSession(existing);
        throw new Error("couldn't read your training history");
      }

      // ---- Rules tier ----
      const week = rampWeek(firstRow?.session_date ?? null, today);
      const recovery = effectiveRecovery(todayCheckin);
      // Only true when the override is actually changing today's shape — it
      // rides into the prompt and the signature, and an override sitting idle
      // on an ordinary day must move neither.
      const overrodeRecovery = isRecoveryDay(todayCheckin) && !recovery;
      const coverage = muscleCoverage(usage, today);
      // When the finisher will run, its minutes come OFF the composable
      // budget rather than riding on top of it — the plan the user sees sums
      // to what they said they had. Same three gates bfrFinisherPick applies,
      // minus the main-focus one it can only answer after composition.
      const bfrReserve =
        bfrBands && !recovery && todayCheckin.minutesAvailable >= 75
          ? BFR_FINISHER_MINUTES
          : 0;
      const envelopes = blockEnvelopes(
        todayCheckin.minutesAvailable - bfrReserve, recovery,
      );
      // The EARNED ceiling, floored at Intermediate: skill states start empty
      // and per-movement levels start beginner, and an unrated history must
      // not gut a mostly-Intermediate catalog. Advanced is the tier that has
      // to be earned (three movements rated up to advanced).
      const earnedCeiling = userSkillCeiling(Object.values(skillStates));
      const userSkill = earnedCeiling === "Advanced" ? "Advanced" : "Intermediate";
      const { shortlists, relaxedMain } = buildBlockShortlists(tagged, {
        coverage,
        soreness: todayCheckin.soreness,
        envelopes,
        rampWeek: week,
        // Told, not inferred: spec §6's "recovery days are mobility and
        // cool-down only" is a rule about the day, not a consequence of the
        // envelope array's shape.
        recoveryDay: recovery,
        userSkill,
      });

      // ---- Blocks the user has pinned ----
      // Locked blocks always hold; a block-scoped adjust additionally freezes
      // every block it was NOT aimed at, for this one compose. Fixed blocks
      // are never re-asked: they leave the shortlists sent to the model, their
      // minutes leave the budget, and they merge back in verbatim at the end.
      // Only a still-suggested day has picks to hold — and an append composes
      // beside a completed day, not on top of it.
      const suggestedBlocks =
        !appendToDay && existing?.status === "suggested" ? existing.blocks : [];
      const fixedByBlock = new Map<BlockRole, StoredBlock>();
      for (const b of suggestedBlocks) {
        if (b.locked || (adjustFocus !== null && b.block !== adjustFocus)) {
          fixedByBlock.set(b.block, b);
        }
      }
      const fixed = [...fixedByBlock.values()];
      const askShortlists = Object.fromEntries(
        Object.entries(shortlists).filter(
          ([block]) => !fixedByBlock.has(block as BlockRole),
        ),
      ) as BlockShortlists;
      // What the model may spend: the day minus what the pinned blocks
      // already cost (a dismissed built-in costs nothing). Clamped, because
      // the validator refuses a budget that isn't a positive number.
      const remainingMinutes = Math.max(
        5, todayCheckin.minutesAvailable - bfrReserve - plannedBlockMinutes(fixed),
      );

      // Budget-aware: the fallback runs precisely when the model's answer was
      // rejected, often for overrunning, so handing back the same overrun
      // would make the rejection meaningless.
      const fallbackPicks = composeBlockFallback(askShortlists, remainingMinutes);

      // The day's standing context for the prompt: instructions given today,
      // and how the last finished session landed.
      // localDayStartMs, not parseLocalDate: that anchor is noon by design,
      // and a noon boundary silently threw away every morning instruction.
      const dayStartMs = localDayStartMs(today);
      const todaysInstructions = adjustments.filter(
        (a) => new Date(a.createdAt).getTime() >= dayStartMs,
      );

      // ---- AI tier: one ask per question signature ----
      // Each id carries the block it was offered for, then the whole lot is
      // sorted. Sorting makes the key a function of what was offered rather
      // than of the order the shortlist builder inserts its keys in; the block
      // prefix is what keeps the sort from also erasing WHICH block each id
      // was offered for, so a retag that moves a workout from conditioning to
      // main is a different question and reads as one.
      const shortlistIds = BLOCK_ORDER
        .flatMap((block) => (shortlists[block] ?? []).map(
          (c) => `${block}:${c.workoutId ?? c.builtinKey ?? ""}`,
        ))
        .sort()
        .join(",");
      // The question the composer was asked, and nothing else.
      //
      // The active gym was part of it for the exercise-level engine and is
      // deliberately not part of it here: a block day picks whole workouts,
      // which are never equipment-filtered, so switching gyms cannot change
      // the answer — and recomposing anyway would spend an AI call and throw
      // away a reroll to arrive back at the same day. The row keeps the gym it
      // was stamped with until something that IS an input changes.
      //
      // Three more things reach the model but are deliberately NOT in the key,
      // so two questions that differ only in these share a cache entry and a
      // stored day. All three are judged worth less than the recompute and the
      // lost reroll they would cost, and all three are recorded here rather
      // than discovered later:
      //   - `soreness` — it steers the shortlists, so any soreness edit that
      //     changes what is on offer already moves `shortlistIds`. One that
      //     doesn't could still change the model's phrasing.
      //   - `relaxedMain` — derived from the same shortlists, and it only
      //     changes how the day is described, never which workouts are in it.
      //   - within-block RANK. The sort discards the order the rules tier put
      //     the candidates in, so a coverage shift that re-ranks an unchanged
      //     set reads as the same question. Same property the exercise-level
      //     signature had, kept knowingly.
      // Locks are deliberately NOT in here: pinning a block must not
      // recompose the rest of the day by itself. Instructions and the debrief
      // ARE: a new instruction is exactly a request to compose again, and a
      // fresh debrief is new information the next compose should act on.
      const signature = [
        today, todayCheckin.id, todayCheckin.minutesAvailable,
        todayCheckin.energy, recovery ? "recovery" : "train",
        overrodeRecovery ? "override" : "",
        `adj:${todaysInstructions.map((a) => a.id).sort().join(",")}`,
        `deb:${debrief?.sessionId ?? ""}`,
        // A promotion that raises the ceiling is new information: the cached
        // day must not outlive it.
        `skill:${userSkill}`,
        shortlistIds,
      ].join("::");
      // The ask cache's key carries the locked set on top of the signature —
      // see aiAnswerByAskKey. A block-scoped adjust changes the signature via
      // its instruction, so the freeze needs no key of its own.
      const askKey = `${signature}::fx:${
        fixed.map((b) => `${b.block}:${b.workoutId ?? b.builtinKey}`).sort().join(",")
      }`;

      // A reroll is a user decision, and recomposing would overwrite it: the
      // hook recomposes any still-suggested session on every load, and
      // saveGeneratedSession replaces the block rows wholesale. So stop early
      // when the day already on file was composed from exactly these inputs —
      // a changed check-in, or a catalog change that moved the shortlists,
      // changes the signature, which is precisely when a recompose IS wanted.
      // Suggested only: an append reaches here with a COMPLETED session whose
      // signature can legitimately match (same check-in, similar shortlists),
      // and matching must not swallow the second session that was asked for.
      if (
        !appendToDay &&
        existing &&
        existing.status === "suggested" &&
        existing.blocks.length > 0 &&
        existing.composeSignature === signature
      ) {
        setSession(existing);
        setLoading(false);
        return;
      }

      const aiBody = {
        mode: "blocks",
        // The REMAINING budget: pinned blocks already spent their share, and
        // the model must add its picks up against what is actually left.
        minutes: remainingMinutes,
        energy: todayCheckin.energy,
        soreness: todayCheckin.soreness,
        relaxedMain,
        overrodeRecovery,
        instructions: todaysInstructions.map((a) => ({
          block: a.block,
          text: a.instruction,
        })),
        debrief: debrief
          ? { verdict: debrief.verdict, note: debrief.note }
          : null,
        fixedBlocks: fixed.map((b) => ({
          block: b.block, name: b.name, minutes: b.minutes,
        })),
        coverage: {
          neglected: coverage.neglected.slice(0, 8),
          yesterday: [...coverage.yesterday],
        },
        shortlists: Object.fromEntries(
          Object.entries(askShortlists).map(([block, list]) => [
            block,
            (list ?? []).map((c) => ({
              id: c.workoutId ?? c.builtinKey,
              name: c.name,
              minutes: c.minutes,
              roundsNote: c.roundsNote,
              focus: c.focus,
              builtin: c.builtinKey !== null,
              muscles: c.muscles.filter((m) => m.isPrimary).map((m) => m.name),
              // Null for a built-in, which has no history to have — and the
              // edge function drops the field for one anyway, because "never
              // done" on a generic reads as an argument for it over a capture.
              lastPerformedDaysAgo:
                tagged.find((w) => w.workoutId === c.workoutId)?.lastPerformedDaysAgo ?? null,
              score: c.score,
            })),
          ]),
        ),
      };

      // Whatever tier answers, the pinned blocks merge back in verbatim.
      let picks: BlockPick[] = mergeLockedPicks(fallbackPicks, fixed);
      let dayReason: string | null = null;
      let source: "ai" | "rules_fallback" = "rules_fallback";
      // With every block pinned there is nothing to ask — spending a call to
      // be told "blocks: []" would be pure waste.
      const anythingToAsk = Object.values(askShortlists)
        .some((list) => (list?.length ?? 0) > 0);
      try {
        let cached = anythingToAsk
          ? aiAnswerByAskKey.get(askKey)
          : { picks: null, dayReason: null };
        if (cached === undefined) {
          let ask = aiAskInFlight.get(askKey);
          if (!ask) {
            ask = askComposeSession(aiBody);
            aiAskInFlight.set(askKey, ask);
            // The cleanup is a chain off `ask`, not a second reference to it,
            // so it is a NEW promise that rejects when both attempts fail —
            // and nothing awaits it. Dropped, that is a LogBox warning on
            // exactly the run where the fallback is being tested. The `catch`
            // ends the chain; the rejection that matters is still `ask`'s own,
            // handled by the await below, and the map still holds `ask`
            // itself, so the coalescing is untouched.
            ask.finally(() => aiAskInFlight.delete(askKey)).catch(() => {});
          }
          const raw = await ask;
          cached = {
            picks: validateBlockComposition(raw, askShortlists, remainingMinutes),
            // Kept even when the picks are refused? No — a reason explaining
            // a day that fell back to rules would narrate blocks the model
            // didn't pick. The reason rides only with a usable answer.
            dayReason: extractDayReason(raw),
          };
          aiAnswerByAskKey.set(askKey, cached);
        }
        if (cached.picks) {
          picks = mergeLockedPicks(cached.picks, fixed);
          dayReason = cached.dayReason;
          source = "ai";
        }
      } catch (e) {
        // AI failure is not an error state — rules stand alone (spec §5).
        console.warn("compose-session ask failed:", e);
      }
      if (runId !== runIdRef.current) return;

      // ---- BFR finisher: rules-appended, never asked (Phase 3). Whether it
      // runs is a fact about bands, time, and soreness — not a judgment call.
      // Its minutes were reserved before composition (bfrReserve above).
      const mainPick = picks.find((p) => p.block === "main");
      const mainCandidate = mainPick
        ? (shortlists.main ?? []).find(
            (c) => c.workoutId === mainPick.workoutId && c.builtinKey === mainPick.builtinKey,
          )
        : null;
      const bfrPick = bfrFinisherPick({
        bandsAvailable: bfrBands,
        minutes: todayCheckin.minutesAvailable,
        recoveryDay: recovery,
        // A locked main isn't in today's shortlists; a day with a main still
        // gets its finisher, defaulting to the arm routine via "full".
        mainFocus: mainCandidate?.focus ?? (mainPick ? "full" : null),
      });
      // A LOCKED finisher already arrived through the fixed-picks merge; a
      // second append would double the block.
      if (bfrPick && !picks.some((p) => p.block === "bfr")) {
        const cooldownIdx = picks.findIndex((p) => p.block === "cooldown");
        picks.splice(cooldownIdx === -1 ? picks.length : cooldownIdx, 0, bfrPick);
      }

      const itemsRead = await blockPicksToItems(picks);
      // Guarded here and not only before the ask: this is the last await before
      // the day is written, and a stale run that got past it would persist a
      // plan built from inputs the user has already changed.
      if (runId !== runIdRef.current) return;
      // A failed read answers null; a day of built-ins answers []. Either way
      // a pick that names a catalog workout always has movements to
      // contribute, so a plan with catalog picks and nothing under them is
      // still written — it is correct and worth showing — but it goes in
      // unclaimed: the gate above would otherwise refuse to recompose it, and
      // a blip would leave the day with a full block plan and nothing under it
      // to log, all day.
      const items = itemsRead ?? [];
      const itemsMissing =
        itemsRead === null ||
        (items.length === 0 && picks.some((p) => p.workoutId !== null));
      if (itemsMissing) {
        console.warn(
          "compose: no loggable items for a plan with catalog workouts —",
          "saving unclaimed so the next load repairs it",
        );
      }
      // One entry per block, and no two blocks share a section — conditioning
      // is the only block that lands in `accessory`, and `bfr` has no block at
      // all — so nothing here can overwrite anything else.
      const sectionMinutes: SectionMinutes = Object.fromEntries(
        picks.map((p) => [SECTION_FOR_BLOCK[p.block], p.minutes]),
      );
      const sessionId = await saveGeneratedSession({
        userId: user.id,
        date: today,
        gymProfileId: activeGym?.id ?? null,
        checkinId: todayCheckin.id,
        session: {
          splitDay: null, // block sessions never move the PPL rotation
          rampWeek: week,
          source,
          servedCapturedWorkoutId: null,
          items,
          sectionMinutes,
          dayReason,
        },
        blocks: picks,
        appendToDay,
        // Written to its own column, LAST, after the items and blocks land —
        // so a partial failure leaves it null and the next load recomposes
        // rather than trusting a plan that was never finished. Withheld here
        // for the same reason when we can already see that they didn't.
        composeSignature: itemsMissing ? null : signature,
        // Shortlists ride along for reroll; aiBody for audit, same as before.
        inputsSnapshot: { aiBody, shortlists },
      });
      if (runId !== runIdRef.current) return;
      if (sessionId) {
        setSession(await fetchTodaySession(user.id, today));
      }
    } catch (e) {
      if (runId === runIdRef.current) setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (runId === runIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const composeAnother = useCallback(() => {
    composeAnotherRef.current = true;
    load();
  }, [load]);

  const recomposeBlock = useCallback((block: BlockRole) => {
    adjustFocusRef.current = block;
    load();
  }, [load]);

  return {
    session,
    checkin,
    gyms,
    activeGym: gyms.find((g) => g.isActive) ?? null,
    loading,
    error,
    refetch: load,
    composeAnother,
    recomposeBlock,
  };
}
