import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from "react-native";
import {
  X,
  Clock,
  Calendar,
  Repeat,
  CheckCircle,
  Circle,
  Pencil,
  Trash2,
} from "lucide-react-native";
import { ScheduleEvent } from "../../types/schedule";
import * as LucideIcons from "lucide-react-native";

interface EventDetailModalProps {
  visible: boolean;
  event: ScheduleEvent | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onUpdateStatus: (status: string) => void;
}

export function EventDetailModal({
  visible,
  event,
  onClose,
  onEdit,
  onDelete,
  onUpdateStatus,
}: EventDetailModalProps) {
  if (!event) return null;

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours);
    const ampm = h >= 12 ? "PM" : "AM";
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getRecurrenceText = () => {
    if (!event.is_recurring) return null;
    if (!event.recurrence_days || event.recurrence_days.length === 0) {
      return "Daily";
    }
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const selectedDays = event.recurrence_days.map((d) => dayNames[d]).join(", ");
    return selectedDays;
  };

  // Get icon component from lucide-react-native
  const IconComponent = event.category?.icon
    ? (LucideIcons as any)[event.category.icon]
    : null;

  const statusButtons = [
    { value: "pending", label: "Pending", icon: Calendar },
    { value: "in_progress", label: "In Progress", icon: Clock },
    { value: "completed", label: "Completed", icon: CheckCircle },
    { value: "cancelled", label: "Cancelled", icon: X },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                {IconComponent && (
                  <IconComponent size={32} color={event.category?.color || "#22C55E"} />
                )}
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            {/* Title */}
            <Text style={styles.title}>{event.title}</Text>

            {/* Category */}
            {event.category && (
              <View style={styles.infoRow}>
                <View
                  style={[
                    styles.categoryBadge,
                    { backgroundColor: `${event.category.color}20` },
                  ]}
                >
                  <View
                    style={[
                      styles.categoryDot,
                      { backgroundColor: event.category.color },
                    ]}
                  />
                  <Text
                    style={[styles.categoryText, { color: event.category.color }]}
                  >
                    {event.category.name}
                  </Text>
                </View>
              </View>
            )}

            {/* Time */}
            <View style={styles.infoRow}>
              <Clock size={16} color="#9CA3AF" />
              <Text style={styles.infoText}>
                {formatTime(event.start_time)} - {formatTime(event.end_time)}
              </Text>
            </View>

            {/* Recurring */}
            {event.is_recurring && (
              <View style={styles.recurringSection}>
                <View style={styles.infoRow}>
                  <Calendar size={16} color="#9CA3AF" />
                  <Text style={styles.recurringTitle}>Recurring Event</Text>
                </View>
                <Text style={styles.recurringSubtitle}>
                  Repeats: {getRecurrenceText()}
                </Text>
              </View>
            )}

            {/* Notes */}
            {event.notes && (
              <View style={styles.notesSection}>
                <Text style={styles.notesText}>{event.notes}</Text>
              </View>
            )}

            {/* Status */}
            <Text style={styles.sectionTitle}>Status</Text>
            <View style={styles.statusGrid}>
              {statusButtons.map((btn) => {
                const Icon = btn.icon;
                const isSelected = event.status === btn.value;
                return (
                  <TouchableOpacity
                    key={btn.value}
                    style={[
                      styles.statusButton,
                      isSelected && styles.statusButtonSelected,
                    ]}
                    onPress={() => onUpdateStatus(btn.value)}
                  >
                    <Icon
                      size={16}
                      color={isSelected ? "#0A0F1E" : "#9CA3AF"}
                    />
                    <Text
                      style={[
                        styles.statusButtonText,
                        isSelected && styles.statusButtonTextSelected,
                      ]}
                    >
                      {btn.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Action Buttons */}
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.editButton} onPress={onEdit}>
                <Pencil size={16} color="#FFFFFF" />
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={onDelete}>
                <Trash2 size={16} color="#EF4444" />
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContent: {
    backgroundColor: "#1F2937",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 500,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: "#374151",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButton: {
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: "600",
  },
  infoText: {
    fontSize: 14,
    color: "#D1D5DB",
  },
  recurringSection: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  recurringTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  recurringSubtitle: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 8,
    marginLeft: 28,
  },
  notesSection: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  notesText: {
    fontSize: 14,
    color: "#D1D5DB",
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9CA3AF",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 24,
  },
  statusButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#374151",
    flex: 1,
    minWidth: "47%",
    maxWidth: "48%",
  },
  statusButtonSelected: {
    backgroundColor: "#22C55E",
  },
  statusButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  statusButtonTextSelected: {
    color: "#0A0F1E",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
  },
  editButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#374151",
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  deleteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#7F1D1D",
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#EF4444",
  },
});
