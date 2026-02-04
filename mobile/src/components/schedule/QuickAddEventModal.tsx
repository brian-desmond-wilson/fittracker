import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  PanResponder,
  TouchableWithoutFeedback,
} from "react-native";
import { X } from "lucide-react-native";
import { EventCategory } from "@/src/types/schedule";
import { supabase } from "@/src/lib/supabase";

interface QuickAddEventModalProps {
  visible: boolean;
  onClose: () => void;
  categories: EventCategory[];
  selectedDate: Date;
  startTime: string; // HH:MM format
  onEventCreated: () => void;
}

// Convert 24-hour time string to 12-hour format for display
const formatTime = (time24: string): string => {
  const [hours, minutes] = time24.split(":").map(Number);
  const isPM = hours >= 12;
  let hour = hours % 12;
  if (hour === 0) hour = 12;
  const meridiem = isPM ? "PM" : "AM";
  const minuteStr = minutes.toString().padStart(2, "0");
  return `${hour}:${minuteStr} ${meridiem}`;
};

// Calculate end time (30 minutes after start)
const calculateEndTime = (startTime: string): string => {
  const [hours, minutes] = startTime.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes + 30;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;
  return `${endHours.toString().padStart(2, "0")}:${endMinutes.toString().padStart(2, "0")}`;
};

// Get local date string in YYYY-MM-DD format
const getLocalDateString = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function QuickAddEventModal({
  visible,
  onClose,
  categories,
  selectedDate,
  startTime,
  onEventCreated,
}: QuickAddEventModalProps) {
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  console.log('QuickAddEventModal startTime:', startTime);

  const endTime = React.useMemo(() => calculateEndTime(startTime), [startTime]);
  const duration = 30; // minutes

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      setTitle("");
      setCategoryId("");
    }
  }, [visible]);

  // Pan responder for swipe-down gesture
  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          // Could add animation here if desired
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          onClose();
        }
      },
    })
  ).current;

  const handleSubmit = async () => {
    if (!title.trim()) {
      alert("Please enter an event title");
      return;
    }

    if (!categoryId) {
      alert("Please select a category");
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert("You must be logged in to create events");
        return;
      }

      const payload = {
        user_id: user.id,
        title: title.trim(),
        category_id: categoryId,
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
        date: getLocalDateString(selectedDate),
        is_recurring: false,
        recurrence_days: null,
        notes: null,
        status: "pending",
      };

      const { error } = await supabase.from("schedule_events").insert(payload);

      if (error) throw error;

      onEventCreated();
      onClose();
    } catch (error) {
      console.error("Failed to create event:", error);
      alert("Failed to create event. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalContent}>
              {/* Drag Handle Area */}
              <View {...panResponder.panHandlers} style={styles.modalDragArea}>
                <View style={styles.modalHandle} />
              </View>

              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.title}>Quick Add Event</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <X size={24} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              {/* Time Display */}
              <View style={styles.timeDisplay}>
                <Text style={styles.timeText}>
                  {formatTime(startTime)} - {formatTime(endTime)}
                </Text>
                <Text style={styles.durationText}>{duration} minutes</Text>
              </View>

              {/* Event Title */}
              <View style={styles.field}>
                <TextInput
                  style={styles.input}
                  placeholder="Event title..."
                  placeholderTextColor="#6B7280"
                  value={title}
                  onChangeText={setTitle}
                  autoFocus
                />
              </View>

              {/* Category */}
              <View style={styles.field}>
                <TouchableOpacity
                  style={styles.select}
                  onPress={() => setShowCategoryDropdown(true)}
                >
                  <Text
                    style={[
                      styles.selectText,
                      !categoryId && styles.selectPlaceholder,
                    ]}
                  >
                    {categoryId
                      ? categories.find((c) => c.id === categoryId)?.name
                      : "Select category..."}
                  </Text>
                  <Text style={styles.selectIcon}>▼</Text>
                </TouchableOpacity>
              </View>

              {/* Action Buttons */}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={onClose}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.addButton]}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  <Text style={styles.addButtonText}>
                    {loading ? "Adding..." : "Add"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Category Dropdown Modal */}
              {showCategoryDropdown && (
                <Modal transparent visible={showCategoryDropdown} animationType="fade">
                  <TouchableOpacity
                    style={styles.dropdownModalOverlay}
                    activeOpacity={1}
                    onPress={() => setShowCategoryDropdown(false)}
                  >
                    <View style={styles.dropdownModalContent}>
                      <Text style={styles.dropdownModalTitle}>Category</Text>
                      <Text style={styles.dropdownModalSubtitle}>
                        Choose a category for this event
                      </Text>
                      {categories.map((cat) => (
                        <TouchableOpacity
                          key={cat.id}
                          style={[
                            styles.dropdownModalItem,
                            categoryId === cat.id && styles.dropdownModalItemSelected,
                          ]}
                          onPress={() => {
                            setCategoryId(cat.id);
                            setShowCategoryDropdown(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.dropdownModalItemText,
                              categoryId === cat.id &&
                                styles.dropdownModalItemTextSelected,
                            ]}
                          >
                            {cat.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </TouchableOpacity>
                </Modal>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#1F2937",
    borderRadius: 16,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 20,
    width: "100%",
    maxWidth: 400,
  },
  modalDragArea: {
    paddingVertical: 8,
    marginHorizontal: -20,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  modalHandle: {
    width: 36,
    height: 5,
    backgroundColor: "#374151",
    borderRadius: 3,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  closeButton: {
    padding: 4,
  },
  timeDisplay: {
    alignItems: "center",
    marginBottom: 20,
  },
  timeText: {
    fontSize: 24,
    fontWeight: "600",
    color: "#22C55E",
    marginBottom: 4,
  },
  durationText: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  field: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#FFFFFF",
  },
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  selectText: {
    fontSize: 16,
    color: "#FFFFFF",
  },
  selectPlaceholder: {
    color: "#6B7280",
  },
  selectIcon: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#374151",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  addButton: {
    backgroundColor: "#22C55E",
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0A0F1E",
  },
  dropdownModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  dropdownModalContent: {
    backgroundColor: "#111827",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#374151",
    width: "100%",
    maxWidth: 400,
    maxHeight: 400,
  },
  dropdownModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  dropdownModalSubtitle: {
    fontSize: 14,
    color: "#9CA3AF",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: "#374151",
  },
  dropdownModalItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  dropdownModalItemSelected: {
    backgroundColor: "rgba(34, 197, 94, 0.1)",
  },
  dropdownModalItemText: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "400",
  },
  dropdownModalItemTextSelected: {
    color: "#22C55E",
    fontWeight: "600",
  },
});
