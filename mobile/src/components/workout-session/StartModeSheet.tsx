// Doing it now, or recording one you already did.
//
// Asked once, on Start, because it changes what every set control on the next
// screen is for: a timer you press, or a time you type. The header on the
// session itself can flip it later when you answer this wrong.
import React, { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Clock, Play } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { WhenSheet } from "@/src/components/ui/WhenSheet";

export type SessionMode = "live" | "backfill";

interface StartModeSheetProps {
  visible: boolean;
  workoutName: string;
  onStart: (mode: SessionMode, startedAtMs: number) => void;
  onClose: () => void;
}

const clockLabel = (ms: number): string =>
  new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function StartModeSheet({
  visible, workoutName, onStart, onClose,
}: StartModeSheetProps) {
  const [mode, setMode] = useState<SessionMode>("live");
  const [startedAtMs, setStartedAtMs] = useState(() => Date.now());
  const [picking, setPicking] = useState(false);

  // One clock sample per opening. Re-reading it on every render would make the
  // time drift while you sit on the sheet deciding.
  useEffect(() => {
    if (!visible) return;
    setMode("live");
    setStartedAtMs(Date.now());
  }, [visible]);

  const option = (
    value: SessionMode,
    Icon: typeof Play,
    title: string,
    detail: string,
  ) => {
    const on = mode === value;
    return (
      <TouchableOpacity
        style={[styles.option, on && styles.optionOn]}
        onPress={() => setMode(value)}
        activeOpacity={0.7}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${title}. ${detail}`}
      >
        <View style={styles.optionHead}>
          <Icon size={16} color={on ? colors.primary : colors.mutedForeground} />
          <Text style={styles.optionTitle}>{title}</Text>
        </View>
        <Text style={styles.optionDetail}>{detail}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={styles.caption}>{workoutName}</Text>
        <Text style={styles.title}>How are you recording this?</Text>

        {option("live", Play, "I'm doing it now", "Each set times itself")}
        {option("backfill", Clock, "I already did it", "You fill in the times")}

        <TouchableOpacity
          style={styles.whenRow}
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          accessibilityLabel={`Started at ${clockLabel(startedAtMs)}. Change it.`}
        >
          <Text style={styles.whenLabel}>Started</Text>
          <Text style={styles.whenValue}>Today, {clockLabel(startedAtMs)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.start}
          onPress={() => onStart(mode, startedAtMs)}
          accessibilityRole="button"
        >
          <Text style={styles.startText}>Start</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancel} onPress={onClose} accessibilityRole="button">
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <WhenSheet
        visible={picking}
        loggedAt={new Date(startedAtMs)}
        onLoggedAtChange={(next) => setStartedAtMs(next.getTime())}
        onClose={() => setPicking(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.background, padding: 20 },
  grabber: {
    width: 32, height: 3, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: "center", marginBottom: 16,
  },
  caption: { fontSize: 12, color: colors.mutedForeground, marginBottom: 6 },
  title: { fontSize: 17, color: colors.foreground, fontWeight: "700", marginBottom: 16 },
  option: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: 14, marginBottom: 10,
  },
  optionOn: { borderColor: colors.primary, borderWidth: 2 },
  optionHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  optionTitle: { fontSize: 15, color: colors.foreground, fontWeight: "600" },
  optionDetail: { fontSize: 12, color: colors.mutedForeground, marginTop: 5, marginLeft: 24 },
  whenRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14, marginTop: 6,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  whenLabel: { fontSize: 14, color: colors.mutedForeground },
  whenValue: { fontSize: 14, color: colors.primary, fontWeight: "600" },
  start: {
    backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14,
    alignItems: "center", marginTop: 16,
  },
  startText: { color: "#052E16", fontSize: 15, fontWeight: "600" },
  cancel: { alignItems: "center", paddingVertical: 14 },
  cancelText: { color: colors.mutedForeground, fontSize: 14 },
});
