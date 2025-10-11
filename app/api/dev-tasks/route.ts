import { NextResponse } from "next/server";
import { requireAdmin, AdminAuthError } from "@/lib/supabase/admin";

const ALLOWED_SECTIONS = [
  "home",
  "schedule",
  "track",
  "progress",
  "profile",
  "settings",
  "other",
] as const;

const ALLOWED_STATUS = ["open", "in_progress", "done"] as const;
const ALLOWED_PRIORITY = ["low", "medium", "high"] as const;

type Section = (typeof ALLOWED_SECTIONS)[number];
type Status = (typeof ALLOWED_STATUS)[number];
type Priority = (typeof ALLOWED_PRIORITY)[number];

const SORT_OPTIONS = new Set([
  "created_desc",
  "created_asc",
  "priority_desc",
  "priority_asc",
  "section",
  "status",
  "completed_desc",
  "completed_asc",
]);

const PRIORITY_WEIGHT: Record<Priority, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

function escapeLike(value: string) {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

function normalizeSections(values: string[]): Section[] | undefined {
  const normalized = values
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is Section => ALLOWED_SECTIONS.includes(value as Section));
  return normalized.length ? normalized : undefined;
}

function normalizeStatuses(values: string[]): Status[] | undefined {
  const normalized = values
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is Status => ALLOWED_STATUS.includes(value as Status));
  return normalized.length ? normalized : undefined;
}

function normalizePriorities(values: string[]): Priority[] | undefined {
  const normalized = values
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is Priority => ALLOWED_PRIORITY.includes(value as Priority));
  return normalized.length ? normalized : undefined;
}

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireAdmin();
    const { searchParams } = new URL(request.url);

    const q = searchParams.get("q");
    const sections = normalizeSections(searchParams.getAll("section"));
    const statuses = normalizeStatuses(searchParams.getAll("status"));
    const priorities = normalizePriorities(searchParams.getAll("priority"));
    const sort = searchParams.get("sort");

    let query = supabase.from("dev_tasks").select("*").eq("user_id", user.id);

    if (sections) {
      query = sections.length === 1 ? query.eq("section", sections[0]) : query.in("section", sections);
    }

    if (statuses) {
      query = statuses.length === 1 ? query.eq("status", statuses[0]) : query.in("status", statuses);
    }

    if (priorities) {
      query =
        priorities.length === 1
          ? query.eq("priority", priorities[0])
          : query.in("priority", priorities);
    }

    if (q) {
      const likeValue = `%${escapeLike(q)}%`;
      query = query.or(`title.ilike.${likeValue},description.ilike.${likeValue}`);
    }

    const sortKey = sort && SORT_OPTIONS.has(sort) ? sort : "created_desc";

    switch (sortKey) {
      case "created_asc":
        query = query.order("created_at", { ascending: true, nullsFirst: false });
        break;
      case "priority_desc":
        query = query.order("priority", { ascending: false, nullsFirst: false });
        break;
      case "priority_asc":
        query = query.order("priority", { ascending: true, nullsFirst: false });
        break;
      case "section":
        query = query.order("section", { ascending: true, nullsFirst: false });
        break;
      case "status":
        query = query.order("status", { ascending: true, nullsFirst: false });
        break;
      case "completed_desc":
        query = query.order("completed_at", { ascending: false, nullsFirst: false });
        break;
      case "completed_asc":
        query = query.order("completed_at", { ascending: true, nullsFirst: true });
        break;
      case "created_desc":
      default:
        query = query.order("created_at", { ascending: false, nullsFirst: false });
        break;
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let tasks = data ?? [];

    if (sort === "priority_desc" || sort === "priority_asc") {
      const ascending = sort === "priority_asc";
      tasks = tasks.sort((a, b) => {
        const diff = PRIORITY_WEIGHT[a.priority as Priority] - PRIORITY_WEIGHT[b.priority as Priority];
        return ascending ? diff : -diff;
      });
    }

    return NextResponse.json({ tasks });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to fetch dev tasks", error);
    return NextResponse.json({ error: "Failed to fetch dev tasks" }, { status: 500 });
  }
}

interface CreateTaskBody {
  section: Section;
  title: string;
  description?: string;
  status?: Status;
  priority?: Priority;
}

function validateCreatePayload(body: any): CreateTaskBody {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid payload");
  }

  const section = String(body.section || "").trim().toLowerCase();
  const title = String(body.title || "").trim();
  const description =
    typeof body.description === "string" && body.description.trim().length
      ? body.description.trim()
      : undefined;
  const status = body.status ? String(body.status).trim().toLowerCase() : undefined;
  const priority = body.priority ? String(body.priority).trim().toLowerCase() : undefined;

  if (!ALLOWED_SECTIONS.includes(section as Section)) {
    throw new Error("Invalid section");
  }

  if (!title) {
    throw new Error("Title is required");
  }

  if (status && !ALLOWED_STATUS.includes(status as Status)) {
    throw new Error("Invalid status");
  }

  if (priority && !ALLOWED_PRIORITY.includes(priority as Priority)) {
    throw new Error("Invalid priority");
  }

  return {
    section: section as Section,
    title,
    description,
    status: status as Status | undefined,
    priority: priority as Priority | undefined,
  };
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireAdmin();
    const body = await request.json();
    const { section, title, description, status, priority } = validateCreatePayload(body);

    const isDone = status === "done";
    const completedAt = isDone ? new Date().toISOString() : null;

    const { data, error } = await supabase
      .from("dev_tasks")
      .insert({
        user_id: user.id,
        section,
        title,
        description: description ?? null,
        status: status ?? "open",
        priority: priority ?? "medium",
        completed_at: completedAt,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof Error && error.message.startsWith("Invalid")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to create dev task", error);
    return NextResponse.json({ error: "Failed to create dev task" }, { status: 500 });
  }
}
