// Client half of enrich-exercise. Three entry points: fire-and-forget after
// a wizard create, the page's Enrich / Regenerate image, and the weekly
// admin sweep the Training tab kicks off. None of them may block or fail a
// save: every failure here is a logged null.
// Spec: docs/superpowers/specs/2026-09-11-catalog-enrichment-pipeline-design.md §4, §6, §7
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import { SWEEP_BATCH_LIMIT, SWEEP_LAST_RUN_KEY, sweepIsDue } from "../enrichSweepGate";

/** The server's {error} body on a non-2xx, which invoke() hides behind a
 *  generic message; anything else as-is. */
async function reasonOf(e: unknown): Promise<unknown> {
  if (e instanceof FunctionsHttpError) {
    try {
      const body = await e.context.json();
      if (body && typeof body.error === "string") return `${e.context.status}: ${body.error}`;
    } catch {
      /* fall through to the generic error */
    }
  }
  return e;
}

/** enrich-exercise { action: "enrich" } response. */
export interface EnrichResult {
  /** Field names written this call: "description" | "video_url" | "image_url". */
  filled: string[];
  /** Field name → why it was not written ("user", "filled", "images off", a reason). */
  skipped: Record<string, string>;
  /** The new picture's public URL when image_url was filled this call. */
  imageUrl: string | null;
}

export interface EnrichOptions {
  /** Generate a picture for an empty slot. Default false. */
  images?: boolean;
  /** Regenerate over an existing picture — the only overwrite. Implies images. */
  forceImage?: boolean;
}

/** Fill this row's empty fields. Null on any failure. */
export async function enrichExercise(exerciseId: string, opts: EnrichOptions = {}): Promise<EnrichResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke("enrich-exercise", {
      body: {
        action: "enrich",
        exerciseId,
        images: opts.images === true || opts.forceImage === true,
        force_image: opts.forceImage === true,
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return {
      filled: Array.isArray(data?.filled) ? data.filled : [],
      skipped: data?.skipped && typeof data.skipped === "object" ? data.skipped : {},
      imageUrl: typeof data?.imageUrl === "string" ? data.imageUrl : null,
    };
  } catch (e) {
    console.error("enrich failed:", await reasonOf(e));
    return null;
  }
}

/**
 * Fire-and-forget after a wizard create: description, video and image for
 * the new row, with the phone returning to what it was doing. The row
 * exists either way; the page picks the fills up on its next open.
 */
export function enrichExerciseInBackground(exerciseId: string): void {
  void enrichExercise(exerciseId, { images: true }).catch((err) => {
    console.error("Background enrichment failed:", err);
  });
}

export interface SweepOptions {
  images: boolean;
  limit: number;
  dryRun: boolean;
}

/** enrich-exercise { action: "sweep" } response, both modes. */
export interface SweepSummary {
  dryRun: boolean;
  /** Rows with at least one fillable field, before the limit. */
  candidates: number;
  processed: number;
  remaining: number;
  /** Dry run only. */
  wouldFill?: { description: number; video_url: number; image_url: number };
  /** Real run only. */
  filled?: { description: number; video_url: number; image_url: number };
  skipped?: { description: number; video_url: number; image_url: number };
}

/** Run a sweep. Admin only (the function refuses others). Null on failure. */
export async function runEnrichSweep(opts: SweepOptions): Promise<SweepSummary | null> {
  try {
    const { data, error } = await supabase.functions.invoke("enrich-exercise", {
      body: { action: "sweep", images: opts.images, limit: opts.limit, dryRun: opts.dryRun },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data as SweepSummary;
  } catch (e) {
    console.error("enrich sweep failed:", await reasonOf(e));
    return null;
  }
}

/** The signed-in user's admin flag; false when signed out or on any error. */
async function currentUserIsAdmin(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    return data?.is_admin === true;
  } catch {
    return false;
  }
}

/**
 * The periodic self-heal (§4): images on, 20 rows, at most once every seven
 * days per device, only from an admin's device. Returns true when a sweep
 * ran. Never throws.
 */
export async function maybeRunWeeklySweep(now: Date = new Date()): Promise<boolean> {
  try {
    if (!(await currentUserIsAdmin())) return false;
    let lastRun: string | null = null;
    try {
      lastRun = await AsyncStorage.getItem(SWEEP_LAST_RUN_KEY);
    } catch (e) {
      console.warn("enrich sweep gate read failed:", e);
    }
    if (!sweepIsDue(lastRun, now)) return false;
    // Stamp before running so a slow or failed sweep is not retried on every
    // tab open; the next attempt is a week away either way.
    try {
      await AsyncStorage.setItem(SWEEP_LAST_RUN_KEY, now.toISOString());
    } catch (e) {
      console.warn("enrich sweep gate write failed:", e);
    }
    const summary = await runEnrichSweep({ images: true, limit: SWEEP_BATCH_LIMIT, dryRun: false });
    if (summary) console.log("weekly enrich sweep:", JSON.stringify(summary));
    return summary !== null;
  } catch (e) {
    console.error("weekly enrich sweep failed:", e);
    return false;
  }
}
