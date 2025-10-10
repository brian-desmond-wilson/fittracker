import { createClient } from "@/lib/supabase/server";
import { BackgroundLogo } from "@/components/ui/background-logo";
import { ScheduleView } from "@/components/schedule/schedule-view";
import { AddEventModal } from "@/components/schedule/add-event-modal";
import { formatDateHeader, getEventsForDate } from "@/lib/schedule-utils";
import { ScheduleEvent, EventCategory } from "@/types/schedule";

async function getScheduleData(userId: string) {
  const supabase = await createClient();
  const today = new Date();

  // Fetch all categories (user's + defaults)
  const { data: categories } = await supabase
    .from("event_categories")
    .select("*")
    .or(`user_id.eq.${userId},is_default.eq.true`)
    .order("name");

  // Fetch all events (recurring and today's one-time events)
  const todayStr = today.toISOString().split("T")[0];
  const { data: allEvents } = await supabase
    .from("schedule_events")
    .select("*")
    .eq("user_id", userId)
    .or(`is_recurring.eq.true,date.eq.${todayStr}`)
    .order("start_time");

  // Filter events for today based on recurrence rules
  const todayEvents = allEvents
    ? getEventsForDate(allEvents as ScheduleEvent[], today)
    : [];

  return {
    events: todayEvents as ScheduleEvent[],
    categories: (categories || []) as EventCategory[],
  };
}

export default async function SchedulePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { events, categories } = await getScheduleData(user.id);
  const today = new Date();

  return (
    <div className="relative min-h-screen bg-gray-950">
      <BackgroundLogo />

      <div className="relative z-10 max-w-4xl mx-auto">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-gray-950/95 backdrop-blur-lg border-b border-gray-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">
                {formatDateHeader(today)}
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                {events.length} {events.length === 1 ? "event" : "events"} scheduled
              </p>
            </div>
            <AddEventModal categories={categories} />
          </div>
        </div>

        {/* Schedule View */}
        <div className="relative">
          <ScheduleView events={events} categories={categories} />
        </div>
      </div>
    </div>
  );
}
