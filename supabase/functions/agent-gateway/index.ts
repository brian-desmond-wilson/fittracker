// ─────────────────────────────────────────────────────────────────────────────
// agent-gateway.ts — FitTracker agent data layer (Supabase Edge Function, Deno)
//
// WHAT IT IS
//   A tiny, allowlisted HTTP gateway between Brian's Muse agent and FitTracker.
//   It validates a long-lived API key, serves versioned read endpoints off a
//   resource allowlist, and audit-logs every call. The agent never sees the
//   service-role key and can only touch the resources listed in CONFIG.
//
// DEPLOY
//   1. Fill in CONFIG below with your real table names (+ date columns).
//   2. Run the SQL at the bottom once (creates agent_audit_log).
//   3. supabase secrets set AGENT_API_KEY="$(openssl rand -hex 32)"
//   4. supabase functions deploy agent-gateway
//   5. Hand the API key to the agent via Secure Vault (never chat).
//
// BASE URL (after deploy)
//   https://<project-ref>.supabase.co/functions/v1/agent-gateway
//   Every request carries:  x-agent-key: <AGENT_API_KEY>
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

const VERSION = "v1";

// ── CONFIG ───────────────────────────────────────────────────────────────────
// BRIAN: this is the ONLY block you need to edit. One entry per resource the
// agent may read. `table` = your Postgres table name, `dateCol` = the column
// holding the row's date/timestamp (used for ?since= / ?date= filtering and
// ordering). Leave `table: ""` to disable a resource. dateCol can be "" for
// resources where date filtering makes no sense (exercises, equipment, goals).

interface Resource {
  table: string;
  dateCol: string;
}

const CONFIG: {
  resources: Record<string, Resource>;
  writeEnabled: boolean; // Phase 3 — keep false until writes are wanted
  maxLimit: number;
} = {
  resources: {
    // — daily state —
    checkins:     { table: "daily_checkins", dateCol: "checkin_date" }, // "set up my day": gym, energy, time, soreness (soreness rows live in daily_checkin_soreness)
    // — training —
    workouts:     { table: "generated_sessions", dateCol: "session_date" }, // the day's training session: status (suggested/accepted/completed/skipped/rested), split, source
    workout_blocks: { table: "generated_session_blocks", dateCol: "" }, // a session's blocks (warmup/mobility/main/conditioning/cooldown) in block_position order, linked by session_id; a role may repeat
    workout_items:  { table: "generated_session_items", dateCol: "" }, // a session's loggable movements in item_order, linked by session_id (and by block_id to their block row)
    lifts:        { table: "set_instances", dateCol: "created_at" }, // logged sets; hang off exercise_instances → workout_instances
    exercises:    { table: "exercises", dateCol: "" }, // exercise library
    equipment:    { table: "equipment", dateCol: "" }, // equipment catalog (per-gym availability is the gym_profile_equipment junction)
    // — goals / plan —
    goals:        { table: "profiles", dateCol: "" }, // body goals: target_weight_kg, target_calories, macro + water targets
    rest:         { table: "weekly_goals", dateCol: "effective_from" }, // weekly sessions_target (rest days are the remainder), one row per Sunday it takes effect
    routines:     { table: "morning_routine_templates", dateCol: "" }, // morning routines (tasks in morning_routine_tasks, runs in morning_routine_completions)
    // — nutrition / body —
    meals:        { table: "meal_logs", dateCol: "date" },
    hydration:    { table: "water_logs", dateCol: "date" },
    weight:       { table: "weight_logs", dateCol: "date" },
    measurements: { table: "body_measurements", dateCol: "date" },
    inventory:    { table: "food_inventory", dateCol: "" }, // food inventory (current state)
    shopping:     { table: "shopping_list", dateCol: "created_at" }, // shopping list
    // — joined views (migration 20261008110000) —
    soreness:               { table: "agent_soreness", dateCol: "checkin_date" }, // soreness per region per check-in day
    equipment_availability: { table: "agent_gym_equipment", dateCol: "" }, // which equipment each gym profile has
    exercise_muscles:       { table: "agent_exercise_muscles", dateCol: "" }, // exercise → muscle region names
    session_muscles:        { table: "agent_session_muscles", dateCol: "session_date" }, // session day → muscle regions trained
    lift_exercises:         { table: "exercise_instances", dateCol: "created_at" }, // lifts' exercise_instance_id → exercise_id
    // — workout library (migration 20261008120000) —
    workout_library:           { table: "agent_workout_library", dateCol: "created_at" }, // captured creator workouts: name, creator, format, muscles, equipment
    workout_library_exercises: { table: "agent_workout_library_exercises", dateCol: "" }, // a workout's exercises in order with sets/reps; filter ?where[workout_id]=
  },
  writeEnabled: true,
  maxLimit: 500,
};

// ── helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "x-agent-key, content-type",
    },
  });
}

const ok = (data: unknown) => json({ ok: true, data });
const err = (code: string, message: string, status = 400) =>
  json({ ok: false, error: { code, message } }, status);

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// Best-effort per-minute rate cap (per isolate — fine for single-agent use).
const hits = new Map<string, { count: number; reset: number }>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const slot = hits.get(key);
  if (!slot || now > slot.reset) {
    hits.set(key, { count: 1, reset: now + 60_000 });
    return false;
  }
  slot.count++;
  return slot.count > 120;
}

// Exclusive upper bound for a one-day window: the next calendar day. Exact
// for date columns (where "< T23:59:59" collapses to "< today" and loses the
// day) and for timestamptz columns alike.
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ── server ───────────────────────────────────────────────────────────────────

serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  // The edge runtime passes the full path (/agent-gateway/v1/...); drop the
  // function-name prefix so the routes below see /v1/... as drafted.
  const path = url.pathname.replace(/^\/agent-gateway/, "").replace(/\/$/, "");

  if (req.method === "OPTIONS") return json({}, 204);

  // — auth —
  const presented = req.headers.get("x-agent-key") ?? "";
  const expected = Deno.env.get("AGENT_API_KEY") ?? "";
  if (!timingSafeEqual(presented, expected)) {
    return err("unauthorized", "Bad or missing x-agent-key.", 401);
  }
  if (rateLimited(presented.slice(0, 12))) {
    return err("rate_limited", "Slow down.", 429);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Audit every call (best-effort — never fail the request over it).
  const audit = (route: string, resource: string | null, rows: number, okFlag: boolean) => {
    supabase
      .from("agent_audit_log")
      .insert({ at: new Date().toISOString(), route, resource, rows, ok: okFlag })
      .then(() => {}, () => {});
  };

  // GET /v1/health
  if (req.method === "GET" && path === `/${VERSION}/health`) {
    const configured = Object.entries(CONFIG.resources)
      .filter(([, r]) => r.table)
      .map(([name]) => name);
    audit("health", null, 0, true);
    return ok({ version: VERSION, resources: configured, writes: CONFIG.writeEnabled });
  }

  // GET /v1/today — composite daily snapshot, best-effort per resource.
  // Never 500s because one piece is unconfigured; reports what it skipped.
  if (req.method === "GET" && path === `/${VERSION}/today`) {
    const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const want = ["checkins", "workouts", "meals", "hydration", "weight"];
    const snapshot: Record<string, unknown> = { date };
    const skipped: string[] = [];
    for (const name of want) {
      const res = CONFIG.resources[name];
      if (!res?.table) {
        skipped.push(name);
        continue;
      }
      let q = supabase.from(res.table).select("*").limit(50);
      if (res.dateCol) {
        q = q.gte(res.dateCol, date).lt(res.dateCol, nextDay(date));
      }
      const { data, error } = await q;
      if (error) skipped.push(`${name} (${error.message})`);
      else snapshot[name] = data;
    }
    // Latest weight even if none logged today — useful context, cheap.
    if (CONFIG.resources.weight?.table && !(snapshot.weight as unknown[] | undefined)?.length) {
      const r = CONFIG.resources.weight;
      const { data } = await supabase
        .from(r.table).select("*")
        .order(r.dateCol || "created_at", { ascending: false }).limit(1);
      if (data?.length) snapshot["latest_weight"] = data[0];
    }
    if (skipped.length) snapshot["_skipped"] = skipped;
    audit("today", null, 1, true);
    return ok(snapshot);
  }

  // GET /v1/read/:resource?since=&date=&limit=&where[col]=val
  const readMatch = path.match(new RegExp(`^/${VERSION}/read/([a-z_]+)$`));
  if (req.method === "GET" && readMatch) {
    const name = readMatch[1];
    const res = CONFIG.resources[name];
    if (!res?.table) {
      audit("read", name, 0, false);
      return err("unknown_resource", `Resource '${name}' is not configured.`, 404);
    }
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
      CONFIG.maxLimit,
    );
    let q = supabase.from(res.table).select("*").limit(limit);
    const since = url.searchParams.get("since");
    const date = url.searchParams.get("date");
    if (since && res.dateCol) q = q.gte(res.dateCol, since);
    if (date && res.dateCol) {
      q = q.gte(res.dateCol, date).lt(res.dateCol, nextDay(date));
    }
    // Generic equality filters: ?where[location]=Trans%20Bay
    for (const [k, v] of url.searchParams) {
      const m = k.match(/^where\[(.+)\]$/);
      if (m) q = q.eq(m[1], v);
    }
    if (res.dateCol) q = q.order(res.dateCol, { ascending: false });
    const { data, error } = await q;
    if (error) {
      audit("read", name, 0, false);
      return err("query_failed", error.message, 500);
    }
    audit("read", name, data?.length ?? 0, true);
    return ok({ resource: name, rows: data });
  }

  // POST /v1/jobs/compose-session — the one allowlisted ACTION. Proxies the
  // app's own composer (supabase/functions/compose-session) under the service
  // role and returns its result verbatim inside the envelope. The composer is
  // suggest-only: it writes nothing, so this is not gated by writeEnabled.
  if (req.method === "POST" && path === `/${VERSION}/jobs/compose-session`) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      audit("jobs/compose-session", null, 0, false);
      return err("bad_json", "Request body must be JSON.", 400);
    }
    const upstream = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/compose-session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify(body ?? {}),
    });
    const payload = await upstream.json().catch(() => null) as
      { composition?: unknown; error?: string } | null;
    if (!upstream.ok || !payload || payload.error) {
      audit("jobs/compose-session", null, 0, false);
      return err("compose_failed", payload?.error ?? `composer answered ${upstream.status}`, 502);
    }
    audit("jobs/compose-session", null, 1, true);
    return ok(payload);
  }

  // POST /v1/jobs/save-session — persist a composed session atomically:
  // { session, blocks, items } go through agent_save_session (one Postgres
  // function, one transaction). The blocks array is the performance order
  // and a role may repeat (a 2-hour day: warmup, main, main, abs,
  // conditioning, cooldown); each item may name its block with block_index
  // and must when its role repeats. Any failure unwinds everything and the
  // function's message names the row ("item[3]: block_index is required
  // because block \"main\" appears more than once"). An action, not gated
  // by writeEnabled; audit-logged like the rest. Recipe:
  // docs/agent-session-save-recipe.md §7.
  if (req.method === "POST" && path === `/${VERSION}/jobs/save-session`) {
    let body: { session?: unknown; blocks?: unknown; items?: unknown } | null = null;
    try {
      body = await req.json();
    } catch {
      audit("jobs/save-session", null, 0, false);
      return err("bad_json", "Request body must be JSON.", 400);
    }
    const { data, error } = await supabase.rpc("agent_save_session", {
      p_session: body?.session ?? null,
      p_blocks: body?.blocks ?? [],
      p_items: body?.items ?? [],
    });
    if (error) {
      audit("jobs/save-session", "workouts", 0, false);
      return err("save_failed", error.message, 400);
    }
    audit("jobs/save-session", "workouts", 1, true);
    return ok({ session_id: data });
  }

  // POST /v1/jobs/update-session-items — correct an already-saved SUGGESTED
  // session's prescription: { session_id, items: [{ id, weight_note?,
  // target_reps?, target_sets? }] }. Scoped on purpose: only those three
  // columns, only items of the named session, only while the session is still
  // `suggested` (once Brian starts it the app owns it). Everything is
  // validated before the first UPDATE so a bad item rejects the whole batch
  // and nothing is written. An action, not gated by writeEnabled;
  // audit-logged like the rest. Recipe: docs/agent-session-save-recipe.md §8.
  if (req.method === "POST" && path === `/${VERSION}/jobs/update-session-items`) {
    const ROUTE = "jobs/update-session-items";
    const RESOURCE = "workout_items";
    const EDITABLE = ["weight_note", "target_reps", "target_sets"] as const;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const reject = (code: string, message: string, status = 400) => {
      audit(ROUTE, RESOURCE, 0, false);
      return err(code, message, status);
    };

    let body: { session_id?: unknown; items?: unknown } | null = null;
    try {
      body = await req.json();
    } catch {
      return reject("bad_json", "Request body must be JSON.", 400);
    }

    const sessionId = typeof body?.session_id === "string" ? body.session_id : "";
    if (!UUID_RE.test(sessionId)) {
      return reject("session_not_found", `No session with id ${String(body?.session_id ?? "")}.`);
    }
    const items = body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return reject("no_items", "items must be a non-empty array.");
    }

    // Shape-check every item before touching the database.
    const edits: { id: string; patch: Record<string, unknown> }[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return reject("invalid_item", `item[${i}]: must be an object.`);
      }
      const rec = item as Record<string, unknown>;
      for (const f of Object.keys(rec)) {
        if (f !== "id" && !(EDITABLE as readonly string[]).includes(f)) {
          return reject("invalid_field", `item[${i}]: field '${f}' is not editable.`);
        }
      }
      if (typeof rec.id !== "string" || !UUID_RE.test(rec.id)) {
        return reject("item_not_found", `item[${i}]: id ${String(rec.id ?? "")} does not belong to session ${sessionId}.`);
      }
      const patch: Record<string, unknown> = {};
      for (const f of EDITABLE) {
        if (!(f in rec)) continue;
        const v = rec[f];
        if (f === "target_sets") {
          if (v !== null && (typeof v !== "number" || !Number.isInteger(v))) {
            return reject("invalid_value", `item[${i}]: target_sets must be an integer or null.`);
          }
        } else if (v !== null && typeof v !== "string") {
          return reject("invalid_value", `item[${i}]: ${f} must be a string or null.`);
        }
        patch[f] = v;
      }
      if (Object.keys(patch).length === 0) {
        return reject("no_fields", `item[${i}]: at least one of weight_note, target_reps, target_sets is required.`);
      }
      edits.push({ id: rec.id, patch });
    }

    // Guard 1 + 2: the session exists and is still suggested.
    const sessions = CONFIG.resources.workouts.table;
    const { data: session, error: sErr } = await supabase
      .from(sessions).select("id, status").eq("id", sessionId).maybeSingle();
    if (sErr) return reject("query_failed", sErr.message, 500);
    if (!session) return reject("session_not_found", `No session with id ${sessionId}.`);
    if (session.status !== "suggested") {
      return reject("session_not_editable", `Only suggested sessions can be edited (status is '${session.status}').`);
    }

    // Guard 4: every item belongs to this session.
    const table = CONFIG.resources.workout_items.table;
    const { data: owned, error: oErr } = await supabase
      .from(table).select("id").eq("session_id", sessionId)
      .in("id", edits.map((e) => e.id));
    if (oErr) return reject("query_failed", oErr.message, 500);
    const ownedIds = new Set((owned ?? []).map((r: { id: string }) => r.id));
    for (let i = 0; i < edits.length; i++) {
      if (!ownedIds.has(edits[i].id)) {
        return reject("item_not_found", `item[${i}]: id ${edits[i].id} does not belong to session ${sessionId}.`);
      }
    }

    // All checks passed — apply the patches (session_id repeated as a belt
    // and braces filter so a row can never be edited across sessions).
    const updatedIds: string[] = [];
    for (const e of edits) {
      const { data: row, error: uErr } = await supabase
        .from(table).update(e.patch).eq("id", e.id).eq("session_id", sessionId)
        .select("id").maybeSingle();
      if (uErr) {
        audit(ROUTE, RESOURCE, updatedIds.length, false);
        return err("update_failed", `item ${e.id}: ${uErr.message}`, 500);
      }
      if (row) updatedIds.push(row.id);
    }
    audit(ROUTE, RESOURCE, updatedIds.length, true);
    return ok({ session_id: sessionId, updated: updatedIds.length, item_ids: updatedIds });
  }

  // POST /v1/jobs/delete-session — delete an entire SUGGESTED session.
  // { session_id }. The one-pending-session-per-day partial unique index
  // (generated_sessions_pending_day) means a replacement session for the
  // same day cannot be saved while a suggested one stands, so deleting the
  // standing session is the only way back to a clean day. Blocks and items
  // go with it via ON DELETE CASCADE (as do debriefs and movement ratings);
  // captured_workout_usage and session_adjustments rows are SET NULL.
  // Suggested-only (once Brian starts it the app owns it), and the DELETE
  // itself filters on status as belt-and-braces, so a concurrent start
  // leaves the row untouched and the route reports deleted: 0. An action,
  // not gated by writeEnabled; audit-logged like the rest.
  if (req.method === "POST" && path === `/${VERSION}/jobs/delete-session`) {
    const ROUTE = "jobs/delete-session";
    const RESOURCE = "workouts";
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const reject = (code: string, message: string, status = 400) => {
      audit(ROUTE, RESOURCE, 0, false);
      return err(code, message, status);
    };

    let body: { session_id?: unknown } | null = null;
    try {
      body = await req.json();
    } catch {
      return reject("bad_json", "Request body must be JSON.", 400);
    }

    const sessionId = typeof body?.session_id === "string" ? body.session_id : "";
    if (!UUID_RE.test(sessionId)) {
      return reject("session_not_found", `No session with id ${String(body?.session_id ?? "")}.`);
    }

    const sessions = CONFIG.resources.workouts.table;
    const { data: session, error: sErr } = await supabase
      .from(sessions).select("id, status").eq("id", sessionId).maybeSingle();
    if (sErr) return reject("query_failed", sErr.message, 500);
    if (!session) return reject("session_not_found", `No session with id ${sessionId}.`);
    if (session.status !== "suggested") {
      return reject("session_not_editable", `Only suggested sessions can be deleted (status is '${session.status}').`);
    }

    const { data: row, error: dErr } = await supabase
      .from(sessions).delete().eq("id", sessionId).eq("status", "suggested")
      .select("id").maybeSingle();
    if (dErr) {
      audit(ROUTE, RESOURCE, 0, false);
      return err("delete_failed", dErr.message, 500);
    }
    audit(ROUTE, RESOURCE, row ? 1 : 0, true);
    return ok({ session_id: sessionId, deleted: row ? 1 : 0 });
  }

  // POST /v1/jobs/delete-session-blocks — dismiss or delete blocks of a
  // SUGGESTED session, with their items. { session_id, block_ids: [...],
  // action?: "dismiss" | "delete" } — action defaults to "dismiss".
  //
  // Dismiss vs delete is a real choice, not a synonym. Dismiss sets the
  // block's existing `dismissed` flag — exactly what the app's own
  // setBlockDismissed does when Brian waves a block off: the Today tab
  // hides the block, the recency view reads NOT dismissed as "actually
  // ran", and nothing is lost (Brian can still see the block in the app).
  // Delete removes the block rows and their items outright — the shape
  // for "these blocks should never have been here", e.g. rebuilding a
  // day around one appended block. Dismiss is the default because it is
  // reversible and matches the app's semantics; delete is irreversible.
  //
  // Items of a deleted block are the items whose block_id names the block.
  // Items with a NULL block_id predate repeated roles (the column's own
  // comment: NULL means "the first block whose role owns this section"),
  // so they are deleted too only when their section's role is unique
  // among the session's blocks — otherwise the section alone cannot say
  // which block they belonged to, and they are left and reported as
  // skipped_null_items instead of risking a surviving block's items.
  // Block role "conditioning" maps to item section "accessory"; every
  // other role maps to its own name.
  // Suggested-only, block-belongs-to-session validated before any write,
  // audit-logged like the rest.
  if (req.method === "POST" && path === `/${VERSION}/jobs/delete-session-blocks`) {
    const ROUTE = "jobs/delete-session-blocks";
    const RESOURCE = "workout_blocks";
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const reject = (code: string, message: string, status = 400) => {
      audit(ROUTE, RESOURCE, 0, false);
      return err(code, message, status);
    };
    const roleToSection = (role: string) => (role === "conditioning" ? "accessory" : role);

    let body: { session_id?: unknown; block_ids?: unknown; action?: unknown } | null = null;
    try {
      body = await req.json();
    } catch {
      return reject("bad_json", "Request body must be JSON.", 400);
    }

    const sessionId = typeof body?.session_id === "string" ? body.session_id : "";
    if (!UUID_RE.test(sessionId)) {
      return reject("session_not_found", `No session with id ${String(body?.session_id ?? "")}.`);
    }
    const blockIds = body?.block_ids;
    if (!Array.isArray(blockIds) || blockIds.length === 0) {
      return reject("no_blocks", "block_ids must be a non-empty array.");
    }
    for (let i = 0; i < blockIds.length; i++) {
      if (typeof blockIds[i] !== "string" || !UUID_RE.test(blockIds[i])) {
        return reject("block_not_found", `block[${i}]: id ${String(blockIds[i] ?? "")} does not belong to session ${sessionId}.`);
      }
    }
    const action = body?.action === undefined ? "dismiss" : body.action;
    if (action !== "dismiss" && action !== "delete") {
      return reject("invalid_action", `action must be "dismiss" or "delete".`);
    }

    const sessions = CONFIG.resources.workouts.table;
    const { data: session, error: sErr } = await supabase
      .from(sessions).select("id, status").eq("id", sessionId).maybeSingle();
    if (sErr) return reject("query_failed", sErr.message, 500);
    if (!session) return reject("session_not_found", `No session with id ${sessionId}.`);
    if (session.status !== "suggested") {
      return reject("session_not_editable", `Only suggested sessions can be edited (status is '${session.status}').`);
    }

    const blocksTable = CONFIG.resources.workout_blocks.table;
    const { data: owned, error: oErr } = await supabase
      .from(blocksTable).select("id, block").eq("session_id", sessionId)
      .in("id", blockIds as string[]);
    if (oErr) return reject("query_failed", oErr.message, 500);
    const ownedIds = new Set((owned ?? []).map((r: { id: string }) => r.id));
    for (let i = 0; i < blockIds.length; i++) {
      if (!ownedIds.has(blockIds[i] as string)) {
        return reject("block_not_found", `block[${i}]: id ${blockIds[i]} does not belong to session ${sessionId}.`);
      }
    }

    if (action === "dismiss") {
      const { data: rows, error: uErr } = await supabase
        .from(blocksTable).update({ dismissed: true })
        .eq("session_id", sessionId).in("id", blockIds as string[]).select("id");
      if (uErr) {
        audit(ROUTE, RESOURCE, 0, false);
        return err("update_failed", uErr.message, 500);
      }
      const ids = (rows ?? []).map((r: { id: string }) => r.id);
      audit(ROUTE, RESOURCE, ids.length, true);
      return ok({ session_id: sessionId, action: "dismiss", block_ids: ids });
    }

    // action === "delete": items first, then blocks. All filters repeat
    // session_id so a row can never be deleted across sessions.
    const itemsTable = CONFIG.resources.workout_items.table;
    const { data: linked, error: liErr } = await supabase
      .from(itemsTable).delete().eq("session_id", sessionId)
      .in("block_id", blockIds as string[]).select("id");
    if (liErr) {
      audit(ROUTE, RESOURCE, 0, false);
      return err("delete_failed", liErr.message, 500);
    }
    let itemsDeleted = (linked ?? []).length;

    // NULL-block_id items: only when their section's role is unique in
    // the session, so the section alone identifies their block.
    const { data: allBlocks, error: abErr } = await supabase
      .from(blocksTable).select("id, block").eq("session_id", sessionId);
    if (abErr) {
      audit(ROUTE, RESOURCE, 0, false);
      return err("delete_failed", abErr.message, 500);
    }
    const roleCounts = new Map<string, number>();
    for (const b of (allBlocks ?? []) as { id: string; block: string }[]) {
      roleCounts.set(b.block, (roleCounts.get(b.block) ?? 0) + 1);
    }
    const ownedById = new Map<string, string>();
    for (const r of (owned ?? []) as { id: string; block: string }[]) {
      ownedById.set(r.id, r.block);
    }
    const uniqueSections = new Set<string>();
    for (const id of blockIds as string[]) {
      const role = ownedById.get(id);
      if (role && roleCounts.get(role) === 1) uniqueSections.add(roleToSection(role));
    }
    let skippedNullItems = 0;
    if (uniqueSections.size > 0) {
      const { data: nullItems, error: niErr } = await supabase
        .from(itemsTable).select("id, section").eq("session_id", sessionId)
        .is("block_id", null).in("section", [...uniqueSections]);
      if (niErr) {
        audit(ROUTE, RESOURCE, 0, false);
        return err("delete_failed", niErr.message, 500);
      }
      if ((nullItems ?? []).length > 0) {
        const { error: ndErr } = await supabase
          .from(itemsTable).delete().eq("session_id", sessionId)
          .in("id", (nullItems as { id: string }[]).map((r) => r.id));
        if (ndErr) {
          audit(ROUTE, RESOURCE, 0, false);
          return err("delete_failed", ndErr.message, 500);
        }
        itemsDeleted += (nullItems as { id: string }[]).length;
      }
    }
    // Count NULL-block_id items left behind because their role repeats.
    const deletedRoles = new Set([...(owned ?? [])].map((r: { block: string }) => r.block));
    const repeatedSections = [...deletedRoles]
      .filter((role) => (roleCounts.get(role) ?? 0) > 1)
      .map(roleToSection);
    if (repeatedSections.length > 0) {
      const { data: skipped, error: skErr } = await supabase
        .from(itemsTable).select("id").eq("session_id", sessionId)
        .is("block_id", null).in("section", repeatedSections);
      if (skErr) {
        audit(ROUTE, RESOURCE, 0, false);
        return err("delete_failed", skErr.message, 500);
      }
      skippedNullItems = (skipped ?? []).length;
    }

    const { data: rows, error: dErr } = await supabase
      .from(blocksTable).delete().eq("session_id", sessionId)
      .in("id", blockIds as string[]).select("id");
    if (dErr) {
      audit(ROUTE, RESOURCE, 0, false);
      return err("delete_failed", dErr.message, 500);
    }
    const ids = (rows ?? []).map((r: { id: string }) => r.id);
    audit(ROUTE, RESOURCE, ids.length, true);
    return ok({
      session_id: sessionId, action: "delete", block_ids: ids,
      items_deleted: itemsDeleted, skipped_null_items: skippedNullItems,
    });
  }

  // POST /v1/jobs/delete-session-items — delete individual items of a
  // SUGGESTED session. { session_id, item_ids: [...] }. Items carry no
  // dismissed flag, so delete is the only shape. Suggested-only,
  // item-belongs-to-session validated before any write, audit-logged
  // like the rest.
  if (req.method === "POST" && path === `/${VERSION}/jobs/delete-session-items`) {
    const ROUTE = "jobs/delete-session-items";
    const RESOURCE = "workout_items";
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const reject = (code: string, message: string, status = 400) => {
      audit(ROUTE, RESOURCE, 0, false);
      return err(code, message, status);
    };

    let body: { session_id?: unknown; item_ids?: unknown } | null = null;
    try {
      body = await req.json();
    } catch {
      return reject("bad_json", "Request body must be JSON.", 400);
    }

    const sessionId = typeof body?.session_id === "string" ? body.session_id : "";
    if (!UUID_RE.test(sessionId)) {
      return reject("session_not_found", `No session with id ${String(body?.session_id ?? "")}.`);
    }
    const itemIds = body?.item_ids;
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return reject("no_items", "item_ids must be a non-empty array.");
    }
    for (let i = 0; i < itemIds.length; i++) {
      if (typeof itemIds[i] !== "string" || !UUID_RE.test(itemIds[i])) {
        return reject("item_not_found", `item[${i}]: id ${String(itemIds[i] ?? "")} does not belong to session ${sessionId}.`);
      }
    }

    const sessions = CONFIG.resources.workouts.table;
    const { data: session, error: sErr } = await supabase
      .from(sessions).select("id, status").eq("id", sessionId).maybeSingle();
    if (sErr) return reject("query_failed", sErr.message, 500);
    if (!session) return reject("session_not_found", `No session with id ${sessionId}.`);
    if (session.status !== "suggested") {
      return reject("session_not_editable", `Only suggested sessions can be edited (status is '${session.status}').`);
    }

    const itemsTable = CONFIG.resources.workout_items.table;
    const { data: owned, error: oErr } = await supabase
      .from(itemsTable).select("id").eq("session_id", sessionId)
      .in("id", itemIds as string[]);
    if (oErr) return reject("query_failed", oErr.message, 500);
    const ownedIds = new Set((owned ?? []).map((r: { id: string }) => r.id));
    for (let i = 0; i < itemIds.length; i++) {
      if (!ownedIds.has(itemIds[i] as string)) {
        return reject("item_not_found", `item[${i}]: id ${itemIds[i]} does not belong to session ${sessionId}.`);
      }
    }

    const { data: rows, error: dErr } = await supabase
      .from(itemsTable).delete().eq("session_id", sessionId)
      .in("id", itemIds as string[]).select("id");
    if (dErr) {
      audit(ROUTE, RESOURCE, 0, false);
      return err("delete_failed", dErr.message, 500);
    }
    const ids = (rows ?? []).map((r: { id: string }) => r.id);
    audit(ROUTE, RESOURCE, ids.length, true);
    return ok({ session_id: sessionId, deleted: ids.length, item_ids: ids });
  }

  // POST /v1/log/:resource — Phase 3, gated by CONFIG.writeEnabled.
  const logMatch = path.match(new RegExp(`^/${VERSION}/log/([a-z_]+)$`));
  if (req.method === "POST" && logMatch) {
    const name = logMatch[1];
    if (!CONFIG.writeEnabled) {
      audit("log", name, 0, false);
      return err("writes_disabled", "Writes are disabled (CONFIG.writeEnabled = false).", 403);
    }
    const res = CONFIG.resources[name];
    if (!res?.table) {
      audit("log", name, 0, false);
      return err("unknown_resource", `Resource '${name}' is not configured.`, 404);
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return err("bad_json", "Request body must be JSON.", 400);
    }
    const { data, error } = await supabase.from(res.table).insert(body as never).select();
    if (error) {
      audit("log", name, 0, false);
      return err("insert_failed", error.message, 500);
    }
    audit("log", name, data?.length ?? 0, true);
    return ok({ resource: name, rows: data });
  }

  audit("not_found", null, 0, false);
  return err("not_found", "Unknown route.", 404);
});

// ── one-time SQL (run in the Supabase SQL editor) ────────────────────────────
/*
create table if not exists agent_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  route text not null,
  resource text,
  rows int not null default 0,
  ok boolean not null default true
);
-- Only the service role (this function) writes here; nobody else needs access.
alter table agent_audit_log enable row level security;
*/
