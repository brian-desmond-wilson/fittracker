import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import webpush from "npm:web-push@3.6.6";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ScheduleEvent {
  id: string;
  user_id: string;
  title: string;
  start_time: string;
  date: string | null;
  is_recurring: boolean;
  recurrence_days: number[] | null;
}

interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_id: string;
}
interface SentNotificationRow {
  event_id: string;
  user_id: string;
}
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const vapidPublicKey = Deno.env.get("PUSH_PUBLIC_KEY");
const vapidPrivateKey = Deno.env.get("PUSH_PRIVATE_KEY");
const notificationEmail = Deno.env.get("PUSH_CONTACT_EMAIL") ?? "notifications@fittracker.app";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase credentials for Edge Function");
}

if (!vapidPublicKey || !vapidPrivateKey) {
  throw new Error("Missing VAPID keys. Set PUSH_PUBLIC_KEY and PUSH_PRIVATE_KEY env vars.");
}

webpush.setVapidDetails(`mailto:${notificationEmail}`, vapidPublicKey, vapidPrivateKey);

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function toLocalDateString(date: Date) {
  return date.toISOString().split("T")[0];
}

function floorToMinute(date: Date) {
  const time = new Date(date);
  time.setSeconds(0, 0);
  return time;
}

function shouldEventTrigger(event: ScheduleEvent, targetDate: Date): boolean {
  if (!event.is_recurring) {
    if (!event.date) return false;
    const [year, month, day] = event.date.split("-").map(Number);
    const eventDate = new Date(year, month - 1, day);
    return (
      eventDate.getFullYear() === targetDate.getFullYear() &&
      eventDate.getMonth() === targetDate.getMonth() &&
      eventDate.getDate() === targetDate.getDate()
    );
  }

  if (!event.recurrence_days || event.recurrence_days.length === 0) {
    return true;
  }

  const dow = targetDate.getDay();
  return event.recurrence_days.includes(dow);
}

serve(async () => {
  try {
    const now = floorToMinute(new Date());
    const todayStr = toLocalDateString(now);
    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, user_id");

    if (subError) {
      console.error("Failed to load subscriptions", subError);
      return new Response(JSON.stringify({ error: subError.message }), { status: 500 });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ delivered: 0 }), { status: 200 });
    }

    const userIds = [...new Set(subscriptions.map((s) => s.user_id))];

    const bufferMinutes = Number(Deno.env.get("NOTIFICATION_BUFFER_MINUTES") ?? "10");
    const bufferStart = new Date(now.getTime() - bufferMinutes * 60 * 1000);

    const { data: events, error: eventsError } = await supabase
      .from("schedule_events")
      .select("id, user_id, title, start_time, date, is_recurring, recurrence_days")
      .in("user_id", userIds)
      .or(`date.eq.${todayStr},is_recurring.eq.true`);

    if (eventsError) {
      console.error("Failed to load events", eventsError);
      return new Response(JSON.stringify({ error: eventsError.message }), { status: 500 });
    }

    const dueByUser = new Map<string, ScheduleEvent[]>();

    for (const event of events ?? []) {
      if (!shouldEventTrigger(event, now)) continue;

      const eventStart = new Date(`${todayStr}T${event.start_time}Z`);
      if (eventStart < bufferStart || eventStart > now) continue;

      const bucket = dueByUser.get(event.user_id) ?? [];
      bucket.push(event);
      dueByUser.set(event.user_id, bucket);
    }

    const { data: sentRecords } = await supabase
      .from("sent_notifications")
      .select("event_id, user_id");

    const sentSet = new Set(sentRecords?.map((row: SentNotificationRow) => `${row.event_id}:${row.user_id}`) ?? []);

    const messages: Promise<void>[] = [];
    let delivered = 0;

    for (const subscription of subscriptions as PushSubscriptionRow[]) {
      const dueEvents = dueByUser.get(subscription.user_id);
      if (!dueEvents || dueEvents.length === 0) continue;

      const pendingEvents = dueEvents.filter(
        (event) => !sentSet.has(`${event.id}:${subscription.user_id}`)
      );

      if (pendingEvents.length === 0) continue;

      const payload = {
        title: pendingEvents[0].title,
        body: pendingEvents.length > 1
          ? `${pendingEvents.length} events starting now`
          : `${pendingEvents[0].title} starts now`,
        data: {
          url: `${Deno.env.get("PWA_BASE_URL") ?? "https://fittracker.app/app2"}/schedule?date=${todayStr}`,
        },
      };

      const pushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      };

      messages.push(
        webpush
          .sendNotification(pushSubscription, JSON.stringify(payload))
          .then(() => {
            delivered += 1;
        pendingEvents.forEach((event) => {
          sentSet.add(`${event.id}:${subscription.user_id}`);
        });
      })
          .catch(async (error: any) => {
            console.error("Push notification failed", error);
            if (error?.statusCode === 410 || error?.statusCode === 404) {
              await supabase
                .from("push_subscriptions")
                .delete()
                .eq("endpoint", subscription.endpoint);
            }
          })
      );
    }

    await Promise.all(messages);

    if (sentSet.size > 0) {
      const rows = Array.from(sentSet).map((key) => {
        const [event_id, user_id] = key.split(":");
        return { event_id, user_id };
      });
      await supabase.from("sent_notifications").upsert(rows, { ignoreDuplicates: true });
    }

    return new Response(JSON.stringify({ delivered }), { status: 200 });
  } catch (error) {
    console.error("Unexpected error", error);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 });
  }
});
