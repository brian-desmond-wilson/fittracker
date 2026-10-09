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
