import { NextResponse } from "next/server";
import { requireAdmin, AdminAuthError } from "@/lib/supabase/admin";

interface PushSubscriptionRequest {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

function validateSubscription(body: any): PushSubscriptionRequest {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid payload");
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  const p256dh = body?.keys?.p256dh ? String(body.keys.p256dh).trim() : "";
  const auth = body?.keys?.auth ? String(body.keys.auth).trim() : "";

  if (!endpoint || !p256dh || !auth) {
    throw new Error("Missing subscription keys");
  }

  return {
    endpoint,
    keys: { p256dh, auth },
  };
}

export async function GET() {
  try {
    const { supabase, user } = await requireAdmin();

    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint")
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ subscriptions: data ?? [] });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Failed to fetch push subscriptions", error);
    return NextResponse.json(
      { error: "Failed to fetch push subscriptions" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireAdmin();
    const body = await request.json();
    const subscription = validateSubscription(body);

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      { onConflict: "endpoint" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof Error && error.message.startsWith("Missing")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to store push subscription", error);
    return NextResponse.json(
      { error: "Failed to store push subscription" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, user } = await requireAdmin();
    const body = await request.json().catch(() => null);
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint : undefined;

    if (!endpoint) {
      return NextResponse.json({ error: "Endpoint is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", endpoint);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Failed to delete push subscription", error);
    return NextResponse.json(
      { error: "Failed to delete push subscription" },
      { status: 500 }
    );
  }
}
