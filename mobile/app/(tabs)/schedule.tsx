import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/src/lib/supabase";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings,
  Zap,
  Bell,
} from "lucide-react-native";
import { TimeGrid, HOUR_HEIGHT } from "@/src/components/schedule/TimeGrid";
import { CurrentTimeIndicator } from "@/src/components/schedule/CurrentTimeIndicator";
import { DraggableEventCard } from "@/src/components/schedule/DraggableEventCard";
import { CategoryManager } from "@/src/components/schedule/CategoryManager";
import { EventDetailModal } from "@/src/components/schedule/EventDetailModal";
import { EditEventModal } from "@/src/components/schedule/EditEventModal";
import { NotificationSettings } from "@/src/components/schedule/NotificationSettings";
import {
  ScheduleEvent,
  EventCategory,
  EventTemplate,
} from "@/src/types/schedule";
import {
  formatDateHeader,
  getEventsForDate,
  detectOverlappingEvents,
} from "@/src/lib/schedule-utils";
import { useNotifications } from "@/src/hooks/useNotifications";

export default function Schedule() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [templates, setTemplates] = useState<EventTemplate[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);

  const timelineHeight = 24 * HOUR_HEIGHT;

  // Initialize notifications hook
  const { rescheduleAll, updateSettings, scheduleNotification, cancelNotification } = useNotifications();

  useEffect(() => {
    loadScheduleData();
  }, [selectedDate]);

  useEffect(() => {
    // Scroll to current time on mount
    setTimeout(() => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();

      let hoursFrom5am = hours - 5;
      if (hoursFrom5am < 0) hoursFrom5am += 24;

      const scrollPosition =
        hoursFrom5am * HOUR_HEIGHT + (minutes / 60) * HOUR_HEIGHT - 100;

      scrollViewRef.current?.scrollTo({
        y: Math.max(0, scrollPosition),
        animated: true,
      });
    }, 100);
  }, []);

  async function loadScheduleData() {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Fetch categories
      const { data: categoriesData } = await supabase
        .from("event_categories")
        .select("*")
        .or(`user_id.eq.${user.id},is_default.eq.true`)
        .order("name");

      // Fetch templates
      const { data: templatesData } = await supabase
        .from("event_templates")
        .select("*")
        .or(`user_id.eq.${user.id},is_system_template.eq.true`)
        .order("title");

      // Fetch events
      const targetDateStr = selectedDate.toISOString().split("T")[0];
      const { data: allEvents } = await supabase
        .from("schedule_events")
        .select("*")
        .eq("user_id", user.id)
        .or(`is_recurring.eq.true,date.eq.${targetDateStr}`)
        .order("start_time");

      // Filter events for target date
      const dateEvents = allEvents
        ? getEventsForDate(allEvents as ScheduleEvent[], selectedDate)
        : [];

      // Enhance events with category data
      const enhancedEvents = dateEvents.map((event) => ({
        ...event,
        category: categoriesData?.find((c) => c.id === event.category_id),
      }));

      setEvents(enhancedEvents);
      setCategories((categoriesData || []) as EventCategory[]);
      setTemplates((templatesData || []) as EventTemplate[]);

      // Schedule notifications for all events
      await rescheduleAll(enhancedEvents, selectedDate);
    } catch (error) {
      console.error("Error loading schedule data:", error);
    } finally {
      setLoading(false);
    }
  }

  const goToPreviousDay = () => {
    const prevDay = new Date(selectedDate);
    prevDay.setDate(prevDay.getDate() - 1);
    setSelectedDate(prevDay);
  };

  const goToNextDay = () => {
    const nextDay = new Date(selectedDate);
    nextDay.setDate(nextDay.getDate() + 1);
    setSelectedDate(nextDay);
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const isToday = () => {
    const today = new Date();
    return (
      selectedDate.getFullYear() === today.getFullYear() &&
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getDate() === today.getDate()
    );
  };

  const handleEventClick = (event: ScheduleEvent) => {
    setSelectedEvent(event);
    setShowEventModal(true);
  };

  const handleUpdateStatus = async (status: string) => {
    if (!selectedEvent) return;

    try {
      const { error } = await supabase
        .from("schedule_events")
        .update({ status })
        .eq("id", selectedEvent.id);

      if (error) throw error;

      // Reload events
      await loadScheduleData();
      // Update selected event
      setSelectedEvent({ ...selectedEvent, status });
    } catch (error) {
      console.error("Error updating event status:", error);
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return;

    try {
      // Cancel notifications for this event
      await cancelNotification(selectedEvent.id);

      const { error } = await supabase
        .from("schedule_events")
        .delete()
        .eq("id", selectedEvent.id);

      if (error) throw error;

      setShowEventModal(false);
      setSelectedEvent(null);
      await loadScheduleData();
    } catch (error) {
      console.error("Error deleting event:", error);
    }
  };

  const handleEditEvent = () => {
    setShowEventModal(false);
    setShowEditModal(true);
  };

  const handleSaveEvent = async (updates: Partial<ScheduleEvent>) => {
    if (!selectedEvent) return;

    try {
      const { error } = await supabase
        .from("schedule_events")
        .update(updates)
        .eq("id", selectedEvent.id);

      if (error) throw error;

      setShowEditModal(false);
      await loadScheduleData();
    } catch (error) {
      console.error("Error updating event:", error);
    }
  };

  const handleEventDrop = async (
    event: ScheduleEvent,
    newStartTime: string,
    newEndTime: string
  ) => {
    try {
      // Optimistically update the local state immediately
      const updatedEvent = { ...event, start_time: newStartTime, end_time: newEndTime };
      setEvents((prevEvents) =>
        prevEvents.map((e) =>
          e.id === event.id ? updatedEvent : e
        )
      );

      // Update the database in the background
      const { error } = await supabase
        .from("schedule_events")
        .update({
          start_time: newStartTime,
          end_time: newEndTime,
        })
        .eq("id", event.id);

      if (error) {
        console.error("Error updating event time:", error);
        // Revert on error by reloading
        await loadScheduleData();
        return;
      }

      // Reschedule notifications for this event with new time
      await cancelNotification(event.id);
      await scheduleNotification(updatedEvent, selectedDate);
    } catch (error) {
      console.error("Error updating event time:", error);
      // Revert on error by reloading
      await loadScheduleData();
    }
  };

  const eventPositions = detectOverlappingEvents(events);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#22C55E" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {formatDateHeader(selectedDate)}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setShowNotificationSettings(true)}
            >
              <Bell size={20} color="#9CA3AF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setShowCategoryManager(true)}
            >
              <Settings size={20} color="#9CA3AF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setShowAddModal(true)}
            >
              <Plus size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.headerBottom}>
          <Text style={styles.eventCount}>
            {events.length} {events.length === 1 ? "event" : "events"} scheduled
          </Text>
          <View style={styles.navigator}>
            <TouchableOpacity
              onPress={goToPreviousDay}
              style={styles.navButton}
            >
              <ChevronLeft size={20} color="#9CA3AF" />
            </TouchableOpacity>
            {!isToday() && (
              <TouchableOpacity onPress={goToToday} style={styles.todayButton}>
                <Text style={styles.todayText}>Today</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={goToNextDay} style={styles.navButton}>
              <ChevronRight size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Schedule View */}
      <View style={styles.scheduleContainer}>
        {events.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🏋️</Text>
            <Text style={styles.emptyStateTitle}>No events yet</Text>
            <Text style={styles.emptyStateText}>
              Start your first event to see it here
            </Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            scrollEnabled={scrollEnabled}
          >
            <View style={{ height: timelineHeight }}>
              <TimeGrid />

              {/* Events container */}
              <View style={[styles.eventsContainer, { paddingLeft: 48 }]}>
                <View style={{ height: timelineHeight }}>
                  {eventPositions.map(
                    ({ event, top, height, column, totalColumns }) => (
                      <DraggableEventCard
                        key={event.id}
                        event={event}
                        style={{
                          position: "absolute",
                          top: top,
                          height: height,
                          left: 48 + column * (100 / totalColumns),
                          width:
                            totalColumns > 1
                              ? `${100 / totalColumns}%`
                              : undefined,
                          right: totalColumns === 1 ? 8 : undefined,
                        }}
                        onClick={() => handleEventClick(event)}
                        onDrop={handleEventDrop}
                        onDragStart={() => setScrollEnabled(false)}
                        onDragEnd={() => setScrollEnabled(true)}
                      />
                    )
                  )}

                  {/* Current time indicator */}
                  <CurrentTimeIndicator />
                </View>
              </View>
            </View>
          </ScrollView>
        )}

        {/* Templates Button */}
        <TouchableOpacity
          style={styles.templatesButton}
          onPress={() => setShowTemplates(true)}
        >
          <Zap size={20} color="#0A0F1E" />
          <Text style={styles.templatesButtonText}>Templates</Text>
        </TouchableOpacity>
      </View>

      {/* Event Detail Modal */}
      <EventDetailModal
        visible={showEventModal}
        event={selectedEvent}
        onClose={() => setShowEventModal(false)}
        onEdit={handleEditEvent}
        onDelete={handleDeleteEvent}
        onUpdateStatus={handleUpdateStatus}
      />

      {/* Edit Event Modal */}
      <EditEventModal
        visible={showEditModal}
        event={selectedEvent}
        categories={categories}
        onClose={() => setShowEditModal(false)}
        onSave={handleSaveEvent}
      />

      {/* Add Event Modal (simplified) */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Event</Text>
            <Text style={styles.modalText}>
              Feature coming soon - will match PWA functionality
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowAddModal(false)}
            >
              <Text style={styles.modalButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Templates Modal (simplified) */}
      <Modal
        visible={showTemplates}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTemplates(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Templates</Text>
            {templates.map((template) => (
              <TouchableOpacity
                key={template.id}
                style={styles.templateItem}
                onPress={() => {
                  // Create event from template
                  setShowTemplates(false);
                }}
              >
                <Text style={styles.templateText}>{template.title}</Text>
                <Text style={styles.templateDuration}>
                  {template.default_duration_minutes} min
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowTemplates(false)}
            >
              <Text style={styles.modalButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Category Manager */}
      <CategoryManager
        visible={showCategoryManager}
        onClose={() => setShowCategoryManager(false)}
        categories={categories}
        onUpdate={loadScheduleData}
      />

      {/* Notification Settings */}
      <NotificationSettings
        visible={showNotificationSettings}
        onClose={() => setShowNotificationSettings(false)}
        onSave={(settings) => updateSettings(settings, events, selectedDate)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0A0F1E",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0A0F1E",
  },
  header: {
    backgroundColor: "rgba(10, 15, 30, 0.95)",
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  headerRight: {
    flexDirection: "row",
    gap: 8,
  },
  headerButton: {
    padding: 10,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  headerBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eventCount: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  navigator: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  navButton: {
    padding: 10,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  todayButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "rgba(34, 197, 94, 0.2)",
    borderRadius: 8,
  },
  todayText: {
    fontSize: 12,
    color: "#22C55E",
    fontWeight: "500",
  },
  scheduleContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  eventsContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  templatesButton: {
    position: "absolute",
    right: 16,
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#22C55E",
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  templatesButtonText: {
    color: "#0A0F1E",
    fontSize: 16,
    fontWeight: "600",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContent: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#1F2937",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 16,
  },
  modalText: {
    fontSize: 14,
    color: "#9CA3AF",
    marginBottom: 12,
  },
  modalButton: {
    backgroundColor: "#22C55E",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 16,
  },
  modalButtonText: {
    color: "#0A0F1E",
    fontSize: 16,
    fontWeight: "600",
  },
  templateItem: {
    backgroundColor: "#1F2937",
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#22C55E",
  },
  templateText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  templateDuration: {
    fontSize: 12,
    color: "#6B7280",
  },
});
