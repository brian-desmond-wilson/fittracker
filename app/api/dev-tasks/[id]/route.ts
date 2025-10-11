import { NextResponse } from "next/server";
import { requireAdmin, AdminAuthError } from "@/lib/supabase/admin";

const ALLOWED_SECTIONS = [
  "home",
  "schedule",
  "track",
  "progress",
  "profile",
  "settings",
  "training",
  "other",
] as const;

const ALLOWED_STATUS = ["open", "in_progress", "done"] as const;
const ALLOWED_PRIORITY = ["low", "medium", "high"] as const;

type Section = (typeof ALLOWED_SECTIONS)[number];
type Status = (typeof ALLOWED_STATUS)[number];
type Priority = (typeof ALLOWED_PRIORITY)[number];

interface UpdatePayload {
  section?: Section;
  title?: string;
  description?: string | null;
  status?: Status;
  priority?: Priority;
  completed_at?: string | null;
}

function validateUpdatePayload(body: any): UpdatePayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid payload");
  }

  const payload: UpdatePayload = {};

  if (body.section !== undefined) {
    const section = String(body.section).trim().toLowerCase();
    if (!ALLOWED_SECTIONS.includes(section as Section)) {
      throw new Error("Invalid section");
    }
    payload.section = section as Section;
  }

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) {
      throw new Error("Title cannot be empty");
    }
    payload.title = title;
  }

  if (body.description !== undefined) {
    const description =
      typeof body.description === "string" && body.description.trim().length
        ? body.description.trim()
        : null;
    payload.description = description;
  }

  if (body.status !== undefined) {
    const status = String(body.status).trim().toLowerCase();
    if (!ALLOWED_STATUS.includes(status as Status)) {
      throw new Error("Invalid status");
    }
    payload.status = status as Status;
  }

  if (body.priority !== undefined) {
    const priority = String(body.priority).trim().toLowerCase();
    if (!ALLOWED_PRIORITY.includes(priority as Priority)) {
      throw new Error("Invalid priority");
    }
    payload.priority = priority as Priority;
  }

  if (body.completed_at !== undefined && body.completed_at !== null) {
    const completedAt = new Date(body.completed_at);
    if (Number.isNaN(completedAt.getTime())) {
      throw new Error("Invalid completed_at timestamp");
    }
    payload.completed_at = completedAt.toISOString();
  } else if (body.completed_at === null) {
    payload.completed_at = null;
  }

  return payload;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await context.params;
    if (!taskId) {
      return NextResponse.json({ error: "Task id is required" }, { status: 400 });
    }

    const { supabase, user } = await requireAdmin();
    const body = await request.json();
    const updatePayload = validateUpdatePayload(body);

    if (
      updatePayload.status &&
      updatePayload.status !== "done" &&
      body.completed_at === undefined
    ) {
      updatePayload.completed_at = null;
    }

    if (updatePayload.status === "done" && updatePayload.completed_at === undefined) {
      updatePayload.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("dev_tasks")
      .update(updatePayload)
      .eq("id", taskId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof Error && error.message.startsWith("Invalid")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to update dev task", error);
    return NextResponse.json({ error: "Failed to update dev task" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await context.params;
    if (!taskId) {
      return NextResponse.json({ error: "Task id is required" }, { status: 400 });
    }

    const { supabase, user } = await requireAdmin();

    const { error } = await supabase
      .from("dev_tasks")
      .delete()
      .eq("id", taskId)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Failed to delete dev task", error);
    return NextResponse.json({ error: "Failed to delete dev task" }, { status: 500 });
  }
}
