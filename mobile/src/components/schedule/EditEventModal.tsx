import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Alert,
} from "react-native";
import { X, ChevronDown } from "lucide-react-native";
import { ScheduleEvent, EventCategory } from "../../types/schedule";
import * as LucideIcons from "lucide-react-native";

interface EditEventModalProps {
  visible: boolean;
  event: ScheduleEvent | null;
  categories: EventCategory[];
  onClose: () => void;
  onSave: (updates: Partial<ScheduleEvent>) => void;
}

export function EditEventModal({
  visible,
  event,
  categories,
  onClose,
  onSave,
}: EditEventModalProps) {
  const [title, setTitle] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | null>(null);
  const [startHour, setStartHour] = useState("12");
  const [startMinute, setStartMinute] = useState("00");
  const [startAmPm, setStartAmPm] = useState("PM");
  const [endHour, setEndHour] = useState("1");
  const [endMinute, setEndMinute] = useState("00");
  const [endAmPm, setEndAmPm] = useState("PM");
  const [isRecurring, setIsRecurring] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [notes, setNotes] = useState("");

  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showStartHourPicker, setShowStartHourPicker] = useState(false);
  const [showStartMinutePicker, setShowStartMinutePicker] = useState(false);
  const [showEndHourPicker, setShowEndHourPicker] = useState(false);
  const [showEndMinutePicker, setShowEndMinutePicker] = useState(false);

  useEffect(() => {
    if (event && visible) {
      setTitle(event.title);
      setNotes(event.notes || "");
      setIsRecurring(event.is_recurring || false);
      setSelectedDays(event.recurrence_days || []);

      // Set category
      const category = categories.find((c) => c.id === event.category_id);
      setSelectedCategory(category || null);

      // Parse start time
      const [startH, startM] = event.start_time.split(":");
      const startHourNum = parseInt(startH);
      const startAmPmValue = startHourNum >= 12 ? "PM" : "AM";
      const startHour12 = startHourNum === 0 ? 12 : startHourNum > 12 ? startHourNum - 12 : startHourNum;
      setStartHour(startHour12.toString());
      setStartMinute(startM);
      setStartAmPm(startAmPmValue);

      // Parse end time
      const [endH, endM] = event.end_time.split(":");
      const endHourNum = parseInt(endH);
      const endAmPmValue = endHourNum >= 12 ? "PM" : "AM";
      const endHour12 = endHourNum === 0 ? 12 : endHourNum > 12 ? endHourNum - 12 : endHourNum;
      setEndHour(endHour12.toString());
      setEndMinute(endM);
      setEndAmPm(endAmPmValue);
    }
  }, [event, visible, categories]);

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert("Error", "Event title is required");
      return;
    }

    if (!selectedCategory) {
      Alert.alert("Error", "Please select a category");
      return;
    }

    // Convert 12-hour to 24-hour format
    let startHour24 = parseInt(startHour);
    if (startAmPm === "PM" && startHour24 !== 12) startHour24 += 12;
    if (startAmPm === "AM" && startHour24 === 12) startHour24 = 0;

    let endHour24 = parseInt(endHour);
    if (endAmPm === "PM" && endHour24 !== 12) endHour24 += 12;
    if (endAmPm === "AM" && endHour24 === 12) endHour24 = 0;

    const startTime = `${startHour24.toString().padStart(2, "0")}:${startMinute}:00`;
    const endTime = `${endHour24.toString().padStart(2, "0")}:${endMinute}:00`;

    const updates: Partial<ScheduleEvent> = {
      title: title.trim(),
      category_id: selectedCategory.id,
      start_time: startTime,
      end_time: endTime,
      is_recurring: isRecurring,
      recurrence_days: isRecurring ? selectedDays : null,
      notes: notes.trim() || null,
    };

    onSave(updates);
  };

  const toggleDay = (day: number) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      setSelectedDays([...selectedDays, day].sort());
    }
  };

  const hours = Array.from({ length: 12 }, (_, i) => (i + 1).toString());
  const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));
  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];

  const IconComponent = selectedCategory?.icon
    ? (LucideIcons as any)[selectedCategory.icon]
    : null;

  if (!event) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Edit Event</Text>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            {/* Event Title */}
            <Text style={styles.label}>Event Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Event name"
              placeholderTextColor="#6B7280"
            />

            {/* Category */}
            <Text style={styles.label}>Category</Text>
            <TouchableOpacity
              style={styles.select}
              onPress={() => setShowCategoryPicker(true)}
            >
              <View style={styles.selectContent}>
                {IconComponent && (
                  <IconComponent size={20} color={selectedCategory?.color} />
                )}
                <Text style={styles.selectText}>
                  {selectedCategory?.name || "Select category"}
                </Text>
              </View>
              <ChevronDown size={20} color="#9CA3AF" />
            </TouchableOpacity>

            {/* Start Time */}
            <Text style={styles.label}>Start Time</Text>
            <View style={styles.timeRow}>
              <TouchableOpacity
                style={styles.timeSelect}
                onPress={() => setShowStartHourPicker(true)}
              >
                <Text style={styles.timeText}>{startHour}</Text>
                <ChevronDown size={16} color="#9CA3AF" />
              </TouchableOpacity>
              <Text style={styles.timeSeparator}>:</Text>
              <TouchableOpacity
                style={styles.timeSelect}
                onPress={() => setShowStartMinutePicker(true)}
              >
                <Text style={styles.timeText}>{startMinute}</Text>
                <ChevronDown size={16} color="#9CA3AF" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.amPmButton}
                onPress={() => setStartAmPm(startAmPm === "AM" ? "PM" : "AM")}
              >
                <Text style={styles.amPmText}>{startAmPm}</Text>
              </TouchableOpacity>
            </View>

            {/* End Time */}
            <Text style={styles.label}>End Time</Text>
            <View style={styles.timeRow}>
              <TouchableOpacity
                style={styles.timeSelect}
                onPress={() => setShowEndHourPicker(true)}
              >
                <Text style={styles.timeText}>{endHour}</Text>
                <ChevronDown size={16} color="#9CA3AF" />
              </TouchableOpacity>
              <Text style={styles.timeSeparator}>:</Text>
              <TouchableOpacity
                style={styles.timeSelect}
                onPress={() => setShowEndMinutePicker(true)}
              >
                <Text style={styles.timeText}>{endMinute}</Text>
                <ChevronDown size={16} color="#9CA3AF" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.amPmButton}
                onPress={() => setEndAmPm(endAmPm === "AM" ? "PM" : "AM")}
              >
                <Text style={styles.amPmText}>{endAmPm}</Text>
              </TouchableOpacity>
            </View>

            {/* Recurring Event Checkbox */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setIsRecurring(!isRecurring)}
            >
              <View style={[styles.checkbox, isRecurring && styles.checkboxChecked]}>
                {isRecurring && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>Recurring Event</Text>
            </TouchableOpacity>

            {/* Days Selection */}
            {isRecurring && (
              <>
                <Text style={styles.label}>Repeat On (leave empty for daily)</Text>
                <View style={styles.daysRow}>
                  {dayLabels.map((day, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.dayButton,
                        selectedDays.includes(index) && styles.dayButtonSelected,
                      ]}
                      onPress={() => toggleDay(index)}
                    >
                      <Text
                        style={[
                          styles.dayButtonText,
                          selectedDays.includes(index) && styles.dayButtonTextSelected,
                        ]}
                      >
                        {day}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Notes */}
            <Text style={styles.label}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add any additional details..."
              placeholderTextColor="#6B7280"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </ScrollView>

          {/* Action Buttons - Always visible at bottom */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Category Picker Modal */}
      <Modal visible={showCategoryPicker} transparent animationType="fade">
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setShowCategoryPicker(false)}
        >
          <View style={styles.pickerContent}>
            <Text style={styles.pickerTitle}>Select Category</Text>
            <ScrollView style={styles.pickerScroll}>
              {categories.map((category) => {
                const Icon = (LucideIcons as any)[category.icon];
                return (
                  <TouchableOpacity
                    key={category.id}
                    style={styles.pickerItem}
                    onPress={() => {
                      setSelectedCategory(category);
                      setShowCategoryPicker(false);
                    }}
                  >
                    {Icon && <Icon size={20} color={category.color} />}
                    <Text style={styles.pickerItemText}>{category.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Hour/Minute Pickers */}
      {showStartHourPicker && (
        <Modal visible transparent animationType="fade">
          <TouchableOpacity
            style={styles.pickerOverlay}
            activeOpacity={1}
            onPress={() => setShowStartHourPicker(false)}
          >
            <View style={styles.pickerContent}>
              <Text style={styles.pickerTitle}>Hour</Text>
              <ScrollView style={styles.pickerScroll}>
                {hours.map((h) => (
                  <TouchableOpacity
                    key={h}
                    style={styles.pickerItem}
                    onPress={() => {
                      setStartHour(h);
                      setShowStartHourPicker(false);
                    }}
                  >
                    <Text style={styles.pickerItemText}>{h}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {showStartMinutePicker && (
        <Modal visible transparent animationType="fade">
          <TouchableOpacity
            style={styles.pickerOverlay}
            activeOpacity={1}
            onPress={() => setShowStartMinutePicker(false)}
          >
            <View style={styles.pickerContent}>
              <Text style={styles.pickerTitle}>Minute</Text>
              <ScrollView style={styles.pickerScroll}>
                {minutes.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={styles.pickerItem}
                    onPress={() => {
                      setStartMinute(m);
                      setShowStartMinutePicker(false);
                    }}
                  >
                    <Text style={styles.pickerItemText}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {showEndHourPicker && (
        <Modal visible transparent animationType="fade">
          <TouchableOpacity
            style={styles.pickerOverlay}
            activeOpacity={1}
            onPress={() => setShowEndHourPicker(false)}
          >
            <View style={styles.pickerContent}>
              <Text style={styles.pickerTitle}>Hour</Text>
              <ScrollView style={styles.pickerScroll}>
                {hours.map((h) => (
                  <TouchableOpacity
                    key={h}
                    style={styles.pickerItem}
                    onPress={() => {
                      setEndHour(h);
                      setShowEndHourPicker(false);
                    }}
                  >
                    <Text style={styles.pickerItemText}>{h}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {showEndMinutePicker && (
        <Modal visible transparent animationType="fade">
          <TouchableOpacity
            style={styles.pickerOverlay}
            activeOpacity={1}
            onPress={() => setShowEndMinutePicker(false)}
          >
            <View style={styles.pickerContent}>
              <Text style={styles.pickerTitle}>Minute</Text>
              <ScrollView style={styles.pickerScroll}>
                {minutes.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={styles.pickerItem}
                    onPress={() => {
                      setEndMinute(m);
                      setShowEndMinutePicker(false);
                    }}
                  >
                    <Text style={styles.pickerItemText}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
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
    alignItems: "center",
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  closeButton: {
    padding: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#D1D5DB",
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: "#374151",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: "#FFFFFF",
    borderWidth: 2,
    borderColor: "transparent",
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  select: {
    backgroundColor: "#374151",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selectText: {
    fontSize: 15,
    color: "#FFFFFF",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timeSelect: {
    flex: 1,
    backgroundColor: "#374151",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timeText: {
    fontSize: 15,
    color: "#FFFFFF",
  },
  timeSeparator: {
    fontSize: 20,
    color: "#9CA3AF",
    fontWeight: "600",
  },
  amPmButton: {
    backgroundColor: "#374151",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  amPmText: {
    fontSize: 15,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
    marginBottom: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#4B5563",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#3B82F6",
    borderColor: "#3B82F6",
  },
  checkmark: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  checkboxLabel: {
    fontSize: 15,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  daysRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  dayButton: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: "#374151",
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  dayButtonSelected: {
    backgroundColor: "#3B82F6",
  },
  dayButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  dayButtonTextSelected: {
    color: "#FFFFFF",
  },
  scrollContent: {
    paddingBottom: 16,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#374151",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#374151",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#22C55E",
    alignItems: "center",
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0A0F1E",
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  pickerContent: {
    backgroundColor: "#1F2937",
    borderRadius: 16,
    padding: 16,
    width: "80%",
    maxHeight: "60%",
    borderWidth: 1,
    borderColor: "#374151",
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  pickerScroll: {
    maxHeight: 300,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  pickerItemText: {
    fontSize: 15,
    color: "#FFFFFF",
  },
});
