import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      title,
      category_id,
      start_time,
      end_time,
      date,
      is_recurring,
      recurrence_days,
      notes,
    } = body;

    const { data, error } = await supabase
      .from("schedule_events")
      .insert({
        user_id: user.id,
        title,
        category_id,
        start_time,
        end_time,
        date,
        is_recurring,
        recurrence_days,
        status: "pending",
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create event" },
      { status: 500 }
    );
  }
}
