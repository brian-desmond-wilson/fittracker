import React, { memo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { ScheduleEvent } from "../../types/schedule";
import * as LucideIcons from "lucide-react-native";
import { Clock, Repeat, Check, X } from "lucide-react-native";

interface EventCardProps {
  event: ScheduleEvent;
  style: any;
  onClick: () => void;
}

export const EventCard = memo(function EventCard({
  event,
  style,
  onClick,
}: EventCardProps) {
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours);
    const ampm = h >= 12 ? "PM" : "AM";
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getStatusIcon = () => {
    switch (event.status) {
      case "completed":
        return <Check size={16} color="#22C55E" />;
      case "cancelled":
        return <X size={16} color="#EF4444" />;
      case "in_progress":
        return <Clock size={16} color="#3B82F6" />;
      default:
        return null;
    }
  };

  // Get icon component from lucide-react-native
  const IconComponent = event.category?.icon
    ? (LucideIcons as any)[event.category.icon]
    : null;

  // Calculate event duration in minutes
  const getDurationMinutes = () => {
    const [startHours, startMinutes] = event.start_time.split(":").map(Number);
    const [endHours, endMinutes] = event.end_time.split(":").map(Number);
    const startTotal = startHours * 60 + startMinutes;
    const endTotal = endHours * 60 + endMinutes;
    return endTotal - startTotal;
  };

  const durationMinutes = getDurationMinutes();
  const isShortEvent = false; // Disable ultra-compact layout
  const isMediumEvent = durationMinutes < 45; // Use consistent medium layout for all events < 45 min
  const showCategory = durationMinutes >= 60; // Only show category for events 60+ minutes

  const borderColor = event.category?.color || "#6B7280";

  return (
    <View
      style={[
        styles.card,
        style,
        { borderLeftColor: borderColor },
        event.status === "completed" && styles.completed,
        event.status === "cancelled" && styles.cancelled,
        isShortEvent ? styles.shortPadding : styles.normalPadding,
      ]}
    >
      {isShortEvent ? (
        // Compact layout for short events
        <View style={styles.shortLayout}>
          <View style={styles.shortContent}>
            {IconComponent && (
              <IconComponent
                size={12}
                color={event.category?.color}
                style={styles.icon}
              />
            )}
            <Text
              style={[
                styles.shortTitle,
                event.status === "cancelled" && styles.strikethrough,
              ]}
              numberOfLines={1}
            >
              {event.title}
            </Text>
            {event.is_recurring && (
              <Repeat size={10} color="#6B7280" style={styles.icon} />
            )}
            <Text style={styles.shortTime} numberOfLines={1}>
              {formatTime(event.start_time)} - {formatTime(event.end_time)}
            </Text>
          </View>
          {getStatusIcon() && (
            <View style={styles.statusIcon}>{getStatusIcon()}</View>
          )}
        </View>
      ) : isMediumEvent ? (
        // Medium event layout - title and time on same row
        <View style={styles.header}>
          <View style={styles.titleRow}>
            {IconComponent && (
              <IconComponent
                size={14}
                color={event.category?.color}
                style={styles.icon}
              />
            )}
            <Text
              style={[
                styles.titleMedium,
                event.status === "cancelled" && styles.strikethrough,
              ]}
              numberOfLines={1}
            >
              {event.title}
            </Text>
            {event.is_recurring && (
              <Repeat size={10} color="#6B7280" style={styles.icon} />
            )}
            <Text style={styles.timeInline} numberOfLines={1}>
              {formatTime(event.start_time)} - {formatTime(event.end_time)}
            </Text>
          </View>
          {getStatusIcon() && (
            <View style={styles.statusIcon}>{getStatusIcon()}</View>
          )}
        </View>
      ) : (
        // Standard layout for longer events
        <>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              {IconComponent && (
                <IconComponent
                  size={16}
                  color={event.category?.color}
                  style={styles.icon}
                />
              )}
              <Text
                style={[
                  styles.title,
                  event.status === "cancelled" && styles.strikethrough,
                ]}
                numberOfLines={1}
              >
                {event.title}
              </Text>
              {event.is_recurring && (
                <Repeat size={12} color="#6B7280" style={styles.icon} />
              )}
            </View>
            {getStatusIcon() && (
              <View style={styles.statusIcon}>{getStatusIcon()}</View>
            )}
          </View>
          <Text style={styles.time} numberOfLines={1}>
            {formatTime(event.start_time)} - {formatTime(event.end_time)}
          </Text>
          {showCategory && event.category && (
            <Text style={styles.category} numberOfLines={1}>
              {event.category.name}
            </Text>
          )}
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(17, 24, 39, 0.9)",
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: "#1F2937",
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    justifyContent: "center",
  },
  normalPadding: {
    padding: 8,
    gap: 4,
  },
  shortPadding: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  completed: {
    opacity: 0.6,
  },
  cancelled: {
    opacity: 0.4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  icon: {
    flexShrink: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: "500",
    color: "#FFFFFF",
    flex: 1,
  },
  titleMedium: {
    fontSize: 13,
    fontWeight: "500",
    color: "#FFFFFF",
    flexShrink: 1,
  },
  time: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  timeInline: {
    fontSize: 11,
    color: "#9CA3AF",
    flexShrink: 0,
    marginLeft: 8,
  },
  category: {
    fontSize: 12,
    color: "#6B7280",
  },
  statusIcon: {
    flexShrink: 0,
  },
  strikethrough: {
    textDecorationLine: "line-through",
  },
  shortLayout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  shortContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  shortTitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "#FFFFFF",
    flex: 1,
  },
  shortTime: {
    fontSize: 10,
    color: "#9CA3AF",
  },
});
