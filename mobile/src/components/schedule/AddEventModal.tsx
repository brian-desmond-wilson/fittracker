import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  PanResponder,
  TouchableWithoutFeedback,
} from "react-native";
import { X, Calendar } from "lucide-react-native";
import { EventCategory } from "@/src/types/schedule";
import { supabase } from "@/src/lib/supabase";
import DateTimePicker from "@react-native-community/datetimepicker";

interface AddEventModalProps {
  visible: boolean;
  onClose: () => void;
  categories: EventCategory[];
  selectedDate: Date;
  onEventCreated: () => void;
}

type Meridiem = "AM" | "PM";

interface TimeValue {
  hour: number;
  minute: number;
  meridiem: Meridiem;
}

const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = [0, 15, 30, 45];

const from24HourString = (time: string): TimeValue => {
  const [rawHour = 0, rawMinute = 0] = time.split(":").map((part) => Number(part));
  const isPM = rawHour >= 12;
  let hour = rawHour % 12;
  if (hour === 0) {
    hour = 12;
  }

  return {
    hour,
    minute: rawMinute,
    meridiem: isPM ? "PM" : "AM",
  };
};

const to24HourString = (time: TimeValue) => {
  let hour = time.hour % 12;
  if (time.meridiem === "PM") {
    hour += 12;
  }
  if (time.meridiem === "AM" && hour === 12) {
    hour = 0;
  }

  return `${hour.toString().padStart(2, "0")}:${time.minute
    .toString()
    .padStart(2, "0")}`;
};

const DEFAULT_START: TimeValue = from24HourString("09:00");
const DEFAULT_END: TimeValue = from24HourString("09:30");

// Convert TimeValue to Date object for DateTimePicker
const timeValueToDate = (time: TimeValue): Date => {
  const date = new Date();
  let hour = time.hour % 12;
  if (time.meridiem === "PM") {
    hour += 12;
  }
  if (time.meridiem === "AM" && time.hour === 12) {
    hour = 0;
  }
  date.setHours(hour, time.minute, 0, 0);
  return date;
};

// Convert Date object to TimeValue
const dateToTimeValue = (date: Date): TimeValue => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const isPM = hours >= 12;
  let hour = hours % 12;
  if (hour === 0) {
    hour = 12;
  }
  return {
    hour,
    minute: minutes,
    meridiem: isPM ? "PM" : "AM",
  };
};

// Compare two TimeValues to see if time1 is after time2
const isTimeAfter = (time1: TimeValue, time2: TimeValue): boolean => {
  const date1 = timeValueToDate(time1);
  const date2 = timeValueToDate(time2);
  return date1.getTime() > date2.getTime();
};

// Get local date string in YYYY-MM-DD format
const getLocalDateString = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function AddEventModal({
  visible,
  onClose,
  categories,
  selectedDate,
  onEventCreated,
}: AddEventModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    category_id: "",
    start_time: { ...DEFAULT_START },
    end_time: { ...DEFAULT_END },
    is_recurring: false,
    recurrence_days: [] as number[],
    date: getLocalDateString(),
    notes: "",
  });

  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Pan responder for swipe-down gesture
  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to vertical swipes
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow downward swipes
        if (gestureState.dy > 0) {
          // Could add animation here if desired
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // If swiped down more than 100 pixels, close the modal
        if (gestureState.dy > 100) {
          onClose();
        }
      },
    })
  ).current;

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      alert("Please enter an event title");
      return;
    }

    if (!formData.category_id) {
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
        title: formData.title.trim(),
        category_id: formData.category_id,
        start_time: `${to24HourString(formData.start_time)}:00`,
        end_time: `${to24HourString(formData.end_time)}:00`,
        date: formData.is_recurring ? null : formData.date,
        is_recurring: formData.is_recurring,
        recurrence_days:
          formData.is_recurring && formData.recurrence_days.length === 0
            ? null
            : formData.recurrence_days,
        notes: formData.notes.trim() || null,
        status: "pending",
      };

      const { error } = await supabase.from("schedule_events").insert(payload);

      if (error) throw error;

      // Reset form
      setFormData({
        title: "",
        category_id: "",
        start_time: { ...DEFAULT_START },
        end_time: { ...DEFAULT_END },
        is_recurring: false,
        recurrence_days: [],
        date: getLocalDateString(),
        notes: "",
      });

      onEventCreated();
      onClose();
    } catch (error) {
      console.error("Failed to create event:", error);
      alert("Failed to create event. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (day: number) => {
    setFormData((prev) => ({
      ...prev,
      recurrence_days: prev.recurrence_days.includes(day)
        ? prev.recurrence_days.filter((d) => d !== day)
        : [...prev.recurrence_days, day],
    }));
  };

  const setRecurrencePattern = (pattern: number[]) => {
    setFormData((prev) => ({ ...prev, recurrence_days: pattern }));
  };

  const days = [
    { label: "S", value: 0 },
    { label: "M", value: 1 },
    { label: "T", value: 2 },
    { label: "W", value: 3 },
    { label: "T", value: 4 },
    { label: "F", value: 5 },
    { label: "S", value: 6 },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
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
                <Text style={styles.title}>Add New Event</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <X size={24} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {/* Event Title */}
            <View style={styles.field}>
              <Text style={styles.label}>Event Title</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Breakfast"
                placeholderTextColor="#6B7280"
                value={formData.title}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, title: text }))}
              />
            </View>

            {/* Category */}
            <View style={styles.field}>
              <Text style={styles.label}>Category</Text>
              <TouchableOpacity
                style={styles.select}
                onPress={() => setShowCategoryDropdown(true)}
              >
                <Text style={styles.selectText}>
                  {formData.category_id
                    ? categories.find((c) => c.id === formData.category_id)?.name
                    : "Select a category"}
                </Text>
                <Text style={styles.selectIcon}>▼</Text>
              </TouchableOpacity>
            </View>

            {/* Time Range */}
            <View style={styles.timeRow}>
              {/* Start Time */}
              <View style={styles.timeField}>
                <Text style={styles.label}>Start Time</Text>
                <TouchableOpacity
                  style={styles.timeInput}
                  onPress={() => setShowStartTimePicker(true)}
                >
                  <Text style={styles.timeInputText}>
                    {formData.start_time.hour}:{formData.start_time.minute.toString().padStart(2, "0")} {formData.start_time.meridiem}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* End Time */}
              <View style={styles.timeField}>
                <Text style={styles.label}>End Time</Text>
                <TouchableOpacity
                  style={styles.timeInput}
                  onPress={() => setShowEndTimePicker(true)}
                >
                  <Text style={styles.timeInputText}>
                    {formData.end_time.hour}:{formData.end_time.minute.toString().padStart(2, "0")} {formData.end_time.meridiem}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Recurring Toggle */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() =>
                setFormData((prev) => ({ ...prev, is_recurring: !prev.is_recurring }))
              }
            >
              <View
                style={[
                  styles.checkbox,
                  formData.is_recurring && styles.checkboxChecked,
                ]}
              >
                {formData.is_recurring && (
                  <View style={styles.checkboxInner} />
                )}
              </View>
              <Text style={styles.checkboxLabel}>Recurring Event</Text>
            </TouchableOpacity>

            {/* Recurrence Days */}
            {formData.is_recurring && (
              <View style={styles.field}>
                <Text style={styles.label}>Repeat On</Text>

                {/* Quick patterns */}
                <View style={styles.patternRow}>
                  <TouchableOpacity
                    style={[
                      styles.patternButton,
                      formData.recurrence_days.length === 0 &&
                        styles.patternButtonSelected,
                    ]}
                    onPress={() => setRecurrencePattern([])}
                  >
                    <Text
                      style={[
                        styles.patternButtonText,
                        formData.recurrence_days.length === 0 &&
                          styles.patternButtonTextSelected,
                      ]}
                    >
                      Daily
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.patternButton,
                      JSON.stringify(formData.recurrence_days.sort()) ===
                        JSON.stringify([1, 2, 3, 4, 5]) && styles.patternButtonSelected,
                    ]}
                    onPress={() => setRecurrencePattern([1, 2, 3, 4, 5])}
                  >
                    <Text
                      style={[
                        styles.patternButtonText,
                        JSON.stringify(formData.recurrence_days.sort()) ===
                          JSON.stringify([1, 2, 3, 4, 5]) &&
                          styles.patternButtonTextSelected,
                      ]}
                    >
                      Weekdays
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.patternButton,
                      JSON.stringify(formData.recurrence_days.sort()) ===
                        JSON.stringify([0, 6]) && styles.patternButtonSelected,
                    ]}
                    onPress={() => setRecurrencePattern([0, 6])}
                  >
                    <Text
                      style={[
                        styles.patternButtonText,
                        JSON.stringify(formData.recurrence_days.sort()) ===
                          JSON.stringify([0, 6]) && styles.patternButtonTextSelected,
                      ]}
                    >
                      Weekends
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Individual days */}
                <View style={styles.daysRow}>
                  {days.map((day) => (
                    <TouchableOpacity
                      key={day.value}
                      style={[
                        styles.dayButton,
                        formData.recurrence_days.includes(day.value) &&
                          styles.dayButtonSelected,
                      ]}
                      onPress={() => toggleDay(day.value)}
                    >
                      <Text
                        style={[
                          styles.dayButtonText,
                          formData.recurrence_days.includes(day.value) &&
                            styles.dayButtonTextSelected,
                        ]}
                      >
                        {day.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Date (for one-time events) */}
            {!formData.is_recurring && (
              <View style={styles.field}>
                <Text style={styles.label}>Date</Text>
                <TouchableOpacity
                  style={styles.dateInput}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text style={styles.dateInputText}>{formData.date}</Text>
                  <Calendar size={20} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
            )}

            {/* Notes */}
            <View style={styles.field}>
              <Text style={styles.label}>Notes (optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Add any additional details..."
                placeholderTextColor="#6B7280"
                value={formData.notes}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, notes: text }))}
                multiline
                numberOfLines={3}
              />
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.createButton]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.createButtonText}>
                {loading ? "Creating..." : "Create Event"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Start Time Picker */}
          {showStartTimePicker && Platform.OS === "ios" && (
            <Modal transparent visible={showStartTimePicker} animationType="fade">
              <TouchableOpacity
                style={styles.datePickerModal}
                activeOpacity={1}
                onPress={() => setShowStartTimePicker(false)}
              >
                <View style={styles.datePickerModalContent}>
                  <View style={styles.datePickerHeader}>
                    <Text style={styles.datePickerTitle}>Start Time</Text>
                    <TouchableOpacity onPress={() => setShowStartTimePicker(false)}>
                      <Text style={styles.datePickerDone}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={timeValueToDate(formData.start_time)}
                    mode="time"
                    display="spinner"
                    textColor="#FFFFFF"
                    onChange={(event, date) => {
                      if (date) {
                        const newStartTime = dateToTimeValue(date);
                        setFormData((prev) => {
                          // If new start time is after current end time, update end time to match start time
                          const newEndTime = !isTimeAfter(prev.end_time, newStartTime)
                            ? newStartTime
                            : prev.end_time;

                          return {
                            ...prev,
                            start_time: newStartTime,
                            end_time: newEndTime,
                          };
                        });
                      }
                    }}
                  />
                </View>
              </TouchableOpacity>
            </Modal>
          )}

          {/* End Time Picker */}
          {showEndTimePicker && Platform.OS === "ios" && (
            <Modal transparent visible={showEndTimePicker} animationType="fade">
              <TouchableOpacity
                style={styles.datePickerModal}
                activeOpacity={1}
                onPress={() => setShowEndTimePicker(false)}
              >
                <View style={styles.datePickerModalContent}>
                  <View style={styles.datePickerHeader}>
                    <Text style={styles.datePickerTitle}>End Time</Text>
                    <TouchableOpacity onPress={() => setShowEndTimePicker(false)}>
                      <Text style={styles.datePickerDone}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={timeValueToDate(formData.end_time)}
                    mode="time"
                    display="spinner"
                    textColor="#FFFFFF"
                    onChange={(event, date) => {
                      if (date) {
                        setFormData((prev) => ({
                          ...prev,
                          end_time: dateToTimeValue(date),
                        }));
                      }
                    }}
                  />
                </View>
              </TouchableOpacity>
            </Modal>
          )}

          {/* Date Picker */}
          {showDatePicker && Platform.OS === "ios" && (
            <Modal transparent visible={showDatePicker} animationType="fade">
              <TouchableOpacity
                style={styles.datePickerModal}
                activeOpacity={1}
                onPress={() => setShowDatePicker(false)}
              >
                <View style={styles.datePickerModalContent}>
                  <View style={styles.datePickerHeader}>
                    <Text style={styles.datePickerTitle}>Select Date</Text>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                      <Text style={styles.datePickerDone}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={new Date(formData.date)}
                    mode="date"
                    display="spinner"
                    textColor="#FFFFFF"
                    onChange={(event, date) => {
                      if (date) {
                        setFormData((prev) => ({
                          ...prev,
                          date: date.toISOString().split("T")[0],
                        }));
                      }
                    }}
                  />
                </View>
              </TouchableOpacity>
            </Modal>
          )}

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
                  <ScrollView style={styles.dropdownModalScroll}>
                    {categories.map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          styles.dropdownModalItem,
                          formData.category_id === cat.id &&
                            styles.dropdownModalItemSelected,
                        ]}
                        onPress={() => {
                          setFormData((prev) => ({ ...prev, category_id: cat.id }));
                          setShowCategoryDropdown(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.dropdownModalItemText,
                            formData.category_id === cat.id &&
                              styles.dropdownModalItemTextSelected,
                          ]}
                        >
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
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
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#111827",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 34,
    maxHeight: "90%",
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
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    maxHeight: "70%",
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#D1D5DB",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#FFFFFF",
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectText: {
    fontSize: 16,
    color: "#FFFFFF",
  },
  selectIcon: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  timeRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  timeField: {
    flex: 1,
  },
  timeInput: {
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  timeInputText: {
    fontSize: 16,
    color: "#FFFFFF",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#374151",
    backgroundColor: "#1F2937",
    marginRight: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    borderColor: "#22C55E",
    backgroundColor: "#22C55E",
  },
  checkboxInner: {
    width: 10,
    height: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 2,
  },
  checkboxLabel: {
    fontSize: 14,
    color: "#D1D5DB",
  },
  patternRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  patternButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#1F2937",
    borderRadius: 6,
  },
  patternButtonSelected: {
    backgroundColor: "#22C55E",
  },
  patternButtonText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#9CA3AF",
  },
  patternButtonTextSelected: {
    color: "#0A0F1E",
  },
  daysRow: {
    flexDirection: "row",
    gap: 8,
  },
  dayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1F2937",
    justifyContent: "center",
    alignItems: "center",
  },
  dayButtonSelected: {
    backgroundColor: "#22C55E",
  },
  dayButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#9CA3AF",
  },
  dayButtonTextSelected: {
    color: "#0A0F1E",
  },
  dateInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateInputText: {
    fontSize: 16,
    color: "#FFFFFF",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#374151",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  createButton: {
    backgroundColor: "#22C55E",
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0A0F1E",
  },
  pickerModal: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  pickerModalContent: {
    backgroundColor: "#111827",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#374151",
    width: "100%",
    maxWidth: 300,
    maxHeight: 400,
  },
  datePickerModal: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  datePickerModalContent: {
    backgroundColor: "#1F2937",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    width: "100%",
    paddingBottom: 34,
  },
  datePickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  datePickerDone: {
    fontSize: 16,
    fontWeight: "600",
    color: "#22C55E",
  },
  pickerScroll: {
    maxHeight: 400,
  },
  pickerModalOption: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  pickerModalOptionText: {
    fontSize: 16,
    color: "#FFFFFF",
    textAlign: "center",
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
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
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
  dropdownModalScroll: {
    maxHeight: 300,
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
