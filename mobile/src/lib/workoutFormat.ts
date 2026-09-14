// How a captured workout is described back to the user.
//
// This exists because the first version rendered every item as "sets × reps".
// For a circuit — four movements at eight reps, repeated three to four times —
// that produced "3 × 8" per exercise, which is a different workout from the
// one the creator posted. The rule here: say only what was prescribed. No
// sets, no "×". Rounds belong to the workout, not to each exercise.
//
// The headline's format and score phrases live here too, so the card and the
// workout screen say the same thing about how a workout runs.
import type { ExtractedWorkoutItem } from "../types/capture";
import type { WorkoutFormat, WorkoutScoreType } from "../types/dailyBlocks";
import { FORMAT_LABELS, SCORE_LABELS, IMPLIED_SCORE } from "./workoutFormatVocab";

/** Only the prescription fields — so this works on an extraction being
 *  reviewed and on a workout already saved, without either knowing about the
 *  other. */
export type Prescription = Pick<
  ExtractedWorkoutItem,
  "sets" | "reps" | "weight" | "duration" | "restSeconds"
>;

/** One exercise's prescription. Empty string when nothing was prescribed —
 *  the caller shows the exercise name alone rather than an invented number. */
export function formatWorkoutItem(item: Prescription): string {
  // Reps carry their own scheme ("8R/8L", "21-15-9"); only bare numbers get
  // the word "reps" appended.
  const effort = item.reps
    ? /^\d+$/.test(item.reps)
      ? `${item.reps} reps`
      : item.reps
    : item.duration ?? null;
  if (!effort) return "";

  let text = item.sets ? `${item.sets} × ${effort}` : effort;
  if (item.weight) text += ` @ ${item.weight}`;
  if (item.restSeconds) text += ` · rest ${item.restSeconds}s`;
  return text;
}

/** The three tag fields the headline reads. Optional on the call, so a
 *  capture being reviewed — which has no tags yet — still gets a headline. */
export interface HeadlineShape {
  format: WorkoutFormat | null;
  formatMinutes: number | null;
  scoreType: WorkoutScoreType | null;
}

/** The format as the card says it. Rounds keeps the creator's text because
 *  "3-4 rounds" is a range the number cannot carry. Spec §8.1 phrase table. */
/** "3-4 rounds", "1 round" — the creator's text, pluralised. */
const roundsText = (rounds: string): string => `${rounds} round${rounds === "1" ? "" : "s"}`;

function formatPhrase(rounds: string | null, s: HeadlineShape): string | null {
  // Zero reads as unstated: no format is built on zero minutes.
  const min = s.formatMinutes;
  switch (s.format) {
    case null: return rounds ? roundsText(rounds) : null;
    case "sets_reps": return null;
    case "rounds": return rounds ? roundsText(rounds) : FORMAT_LABELS.rounds;
    case "amrap": return min ? `AMRAP ${min} min` : "AMRAP";
    case "emom": return min ? `EMOM ${min} min` : "EMOM";
    case "for_time": return min ? `For time · ${min} min cap` : "For time";
    case "intervals": return min ? `Intervals ${min} min` : "Intervals";
    case "chipper": return min ? `Chipper · ${min} min cap` : "Chipper";
    case "ladder": return "Ladder";
  }
}

/** The score, lower-cased, only when it adds information: not implied by the
 *  format, and not "none". */
function scorePhrase(s: HeadlineShape): string | null {
  if (s.scoreType === null || s.scoreType === "none") return null;
  if (s.format !== null && IMPLIED_SCORE[s.format] === s.scoreType) return null;
  // "6 rounds · rounds + reps" says rounds twice; the phrase already has it.
  if (s.format === "rounds" && s.scoreType === "rounds_reps") return null;
  return SCORE_LABELS[s.scoreType].toLowerCase();
}

/** The format and score as one phrase, or null when there is nothing to
 *  say: "AMRAP 15 min", "6 rounds · load", "For time". The workout screen
 *  shows this on its own; the card puts it after the movement count. */
export function describeFormat(rounds: string | null, shape: HeadlineShape): string | null {
  const parts = [formatPhrase(rounds, shape), scorePhrase(shape)].filter((p): p is string => p !== null);
  return parts.length === 0 ? null : parts.join(" · ");
}

/** The workout's shape in one line: how many movements, how it runs, and
 *  what it is scored by when that is not obvious. */
export function formatWorkoutHeadline(
  movementCount: number,
  rounds: string | null,
  shape: HeadlineShape = { format: null, formatMinutes: null, scoreType: null },
): string {
  const movements = `${movementCount} movement${movementCount === 1 ? "" : "s"}`;
  const rest = describeFormat(rounds, shape);
  return rest === null ? movements : `${movements} · ${rest}`;
}

/** The hero badge and the band's gloss. */
export interface FormatBanner {
  badge: string;
  gloss: string;
}

// Reuses roundsText so the badge and the card's phrase can never disagree on
// pluralisation.
const roundsUpper = (rounds: string): string => roundsText(rounds).toUpperCase();
const timesText = (rounds: string): string => `${rounds} time${rounds === "1" ? "" : "s"}`;
/** "1 minute" / "20 minutes" — the pluralised unit for glosses that count
 *  minutes. */
const minutesText = (m: number): string => `${m} minute${m === 1 ? "" : "s"}`;

/** The workout page's format, in two registers: the badge on the hero and
 *  the band over the list (uppercase, the component letter-spaces it), and a
 *  plain-English gloss under the band so AMRAP / EMOM / chipper explain
 *  themselves. One function, two callers, so they can never disagree.
 *  Spec 2026-09-13 §5.2. */
export function formatBanner(rounds: string | null, s: HeadlineShape): FormatBanner | null {
  // Zero reads as unstated: no format is built on zero minutes.
  const min = s.formatMinutes;
  switch (s.format) {
    case null:
      return rounds
        ? { badge: roundsUpper(rounds), gloss: `Repeat the whole list ${timesText(rounds)}` }
        : null;
    case "amrap":
      return {
        badge: min ? `AMRAP · ${min} MIN` : "AMRAP",
        gloss: `As many rounds as possible${min ? ` in ${minutesText(min)}` : ""}`,
      };
    case "emom":
      return {
        badge: min ? `EMOM · ${min} MIN` : "EMOM",
        gloss: `Every minute on the minute${min ? ` for ${minutesText(min)}` : ""}`,
      };
    case "for_time":
      return rounds
        ? {
            badge: `${roundsUpper(rounds)} · FOR TIME`,
            gloss: `Repeat the whole list ${timesText(rounds)}, as fast as you can${min ? `, ${min} minute cap` : ""}`,
          }
        : {
            badge: min ? `FOR TIME · ${min} MIN CAP` : "FOR TIME",
            gloss: `As fast as you can${min ? `, ${min} minute cap` : ""}`,
          };
    case "rounds":
      return rounds
        ? { badge: roundsUpper(rounds), gloss: `Repeat the whole list ${timesText(rounds)}` }
        : { badge: "ROUNDS", gloss: "Repeat the whole list" };
    case "intervals":
      return { badge: min ? `INTERVALS · ${min} MIN` : "INTERVALS", gloss: "Work and rest on the clock" };
    case "chipper":
      return {
        badge: min ? `CHIPPER · ${min} MIN CAP` : "CHIPPER",
        gloss: `Work through the list once, top to bottom${min ? `, ${min} minute cap` : ""}`,
      };
    case "ladder":
      return { badge: "LADDER", gloss: "Reps climb (or fall) each round" };
    case "sets_reps":
      return rounds
        ? { badge: `SETS & REPS · ${roundsUpper(rounds)}`, gloss: `Sets and reps, rest as needed; repeat the list ${timesText(rounds)}` }
        : { badge: "SETS & REPS", gloss: "Sets and reps, rest as needed" };
  }
}
