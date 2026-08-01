import React from "react";
import { View, StyleSheet, Modal, Platform } from "react-native";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { colors, spacing } from "@/src/theme/tokens";
import { Button, Card } from "@/src/components/ui";

interface WaterCalendarModalProps {
  visible: boolean;
  initialDate: Date;
  onChange: (event: DateTimePickerEvent, picked?: Date) => void;
  onClose: () => void;
}

export function WaterCalendarModal({
  visible,
  initialDate,
  onChange,
  onClose,
}: WaterCalendarModalProps) {
  if (Platform.OS !== "ios") {
    if (!visible) return null;
    return (
      <DateTimePicker
        value={initialDate}
        mode="date"
        display="default"
        maximumDate={new Date()}
        onChange={onChange}
      />
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Card variant="panel" style={styles.card}>
          <DateTimePicker
            value={initialDate}
            mode="date"
            display="spinner"
            maximumDate={new Date()}
            onChange={onChange}
            textColor={colors.text}
          />
          {/* The card is a column, so `fluid` stretches Done to full width. */}
          <Button label="Done" onPress={onClose} fluid />
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  /**
   * The centred-sheet recipe's backdrop / `Card panel` / footer parts, minus
   * the form parts: a native spinner picker is not a form, so there is no
   * title, no scroller, and no Cancel — dismissing the picker IS confirming
   * the date it already committed through `onChange`.
   */
  card: {
    width: "100%",
    maxHeight: "100%",
    gap: spacing.md,
  },
});
