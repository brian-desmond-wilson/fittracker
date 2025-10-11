import { createClient } from "@/lib/supabase/server";
import { BackgroundLogo } from "@/components/ui/background-logo";
import { ScheduleView } from "@/components/schedule/schedule-view";
import { ScheduleErrorBoundary } from "@/components/schedule/schedule-error-boundary";
import { AddEventModal } from "@/components/schedule/add-event-modal";
import { DateNavigator } from "@/components/schedule/date-navigator";
import { CategoryManagerButton } from "@/components/schedule/category-manager-button";
import { formatDateHeader, getEventsForDate } from "@/lib/schedule-utils";
import { ScheduleEvent, EventCategory, EventTemplate } from "@/types/schedule";

async function getScheduleData(userId: string, targetDate: Date) {
  const supabase = await createClient();

  // Fetch all categories (user's + defaults)
  const { data: categories } = await supabase
    .from("event_categories")
    .select("*")
    .or(`user_id.eq.${userId},is_default.eq.true`)
    .order("name");

  // Fetch event templates (user's + system)
  const { data: templates } = await supabase
    .from("event_templates")
    .select("*")
    .or(`user_id.eq.${userId},is_system_template.eq.true`)
    .order("title");

  // Fetch all events (recurring and target date's one-time events)
  const targetDateStr = targetDate.toISOString().split("T")[0];

  const { data: allEvents, error } = await supabase
    .from("schedule_events")
    .select("*")
    .eq("user_id", userId)
    .or(`is_recurring.eq.true,date.eq.${targetDateStr}`)
    .order("start_time");

  if (error) {
    console.error('Failed to fetch events:', error);
  }

  // Filter events for target date based on recurrence rules
  const dateEvents = allEvents
    ? getEventsForDate(allEvents as ScheduleEvent[], targetDate)
    : [];

  return {
    events: dateEvents as ScheduleEvent[],
    categories: (categories || []) as EventCategory[],
    templates: (templates || []) as EventTemplate[],
  };
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Parse date from query params or use today (in local timezone)
  const targetDate = searchParams.date
    ? new Date(searchParams.date + "T00:00:00")
    : (() => {
        const now = new Date();
        // Create a date in local timezone by getting local date components
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      })();

  const { events, categories, templates } = await getScheduleData(user.id, targetDate);

  return (
    <div className="relative bg-gray-950">
      <BackgroundLogo />

      <div className="relative z-10 max-w-4xl mx-auto">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-gray-950/95 backdrop-blur-lg border-b border-gray-800 px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">
                {formatDateHeader(targetDate)}
              </h1>
              <CategoryManagerButton categories={categories} />
            </div>
            <AddEventModal categories={categories} />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              {events.length} {events.length === 1 ? "event" : "events"} scheduled
            </p>
            <DateNavigator currentDate={targetDate} />
          </div>
        </div>

        {/* Schedule View - Fixed height accounting for header (88px) and bottom nav (80px) */}
        <div className="relative" style={{ height: "calc(100vh - 168px)" }}>
          <ScheduleErrorBoundary>
            <ScheduleView events={events} categories={categories} templates={templates} />
          </ScheduleErrorBoundary>
        </div>
      </div>
    </div>
  );
}
