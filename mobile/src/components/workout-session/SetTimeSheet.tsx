// When a set happened, entered by hand.
//
// Backfill mode's replacement for the live timer. Two ways in, because the two
// things you remember about a set you did this morning are different: how long
// it took, or when you were doing it. A duration is the cheaper answer and
// chains off the set before it; a start and end pins it to the clock and
// re-anchors everything after.
//
// The clock itself comes up in WhenSheet — pickers come up from the bottom in
// this app, never inline.
import React, { useEffect, useState } from "react";
import {
  Modal, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { colors } from "@/src/lib/colors";
import { WhenSheet } from "@/src/components/ui/WhenSheet";
import { shiftSpanStart, splitDuration } from "@/src/lib/setTiming";
import type { SetTimeInput } from "@/src/lib/setTiming";

type Tab = "duration" | "span";

interface SetTimeSheetProps {
  visible: boolean;
  /** Named in the sheet so you know which set you're timing. */
  setNumber: number;
  exerciseName: string;
  /** What this set already carries, if anything. */
  current: SetTimeInput;
  /** Where a duration-only entry will start — the previous set's end. */
  chainStartMs: number;
  onSave: (input: SetTimeInput) => void;
  onClose: () => void;
}

const numeric = (v: string): number => {
  const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
};

const clockLabel = (ms: number): string =>
  new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function SetTimeSheet({
  visible, setNumber, exerciseName, current, chainStartMs, onSave, onClose,
}: SetTimeSheetProps) {
  const [tab, setTab] = useState<Tab>("duration");
  const [mins, setMins] = useState("0");
  const [secs, setSecs] = useState("0");
  const [startMs, setStartMs] = useState(chainStartMs);
  const [endMs, setEndMs] = useState(chainStartMs);
  const [picking, setPicking] = useState<"start" | "end" | null>(null);

  // Reopening shows what the set already has rather than the last set's
  // leftovers, so a sheet you opened by mistake can be closed without harm.
  useEffect(() => {
    if (!visible) return;
    if (current.kind === "span") {
      setTab("span");
      setStartMs(current.startMs);
      setEndMs(current.endMs);
      const d = splitDuration(Math.round((current.endMs - current.startMs) / 1000));
      setMins(String(d.mins));
      setSecs(String(d.secs));
      return;
    }
    setTab("duration");
    setStartMs(chainStartMs);
    setEndMs(chainStartMs);
    const d = splitDuration(current.kind === "duration" ? current.seconds : 0);
    setMins(String(d.mins));
    setSecs(String(d.secs));
  }, [visible, current, chainStartMs]);

  const save = () => {
    if (tab === "span") {
      onSave({ kind: "span", startMs, endMs });
    } else {
      const seconds = numeric(mins) * 60 + numeric(secs);
      onSave(seconds > 0 ? { kind: "duration", seconds } : { kind: "none" });
    }
    onClose();
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
        <Text style={styles.caption}>
          Set {setNumber} · {exerciseName}
        </Text>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, tab === "duration" && styles.tabOn]}
            onPress={() => setTab("duration")}
            accessibilityRole="button"
            accessibilityState={{ selected: tab === "duration" }}
          >
            <Text style={[styles.tabText, tab === "duration" && styles.tabTextOn]}>
              Duration
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === "span" && styles.tabOn]}
            onPress={() => setTab("span")}
            accessibilityRole="button"
            accessibilityState={{ selected: tab === "span" }}
          >
            <Text style={[styles.tabText, tab === "span" && styles.tabTextOn]}>
              Start and End
            </Text>
          </TouchableOpacity>
        </View>

        {tab === "duration" ? (
          <>
            <View style={styles.durationRow}>
              <TextInput
                style={styles.numberInput}
                value={mins}
                onChangeText={setMins}
                keyboardType="number-pad"
                selectTextOnFocus
                accessibilityLabel="Minutes"
              />
              <Text style={styles.unit}>min</Text>
              <TextInput
                style={styles.numberInput}
                value={secs}
                onChangeText={setSecs}
                keyboardType="number-pad"
                selectTextOnFocus
                accessibilityLabel="Seconds"
              />
              <Text style={styles.unit}>sec</Text>
            </View>
            <Text style={styles.hint}>
              Starts when the set before it ended — {clockLabel(chainStartMs)}
            </Text>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={styles.timeRow}
              onPress={() => setPicking("start")}
              accessibilityRole="button"
            >
              <Text style={styles.timeLabel}>Started</Text>
              <Text style={styles.timeValue}>{clockLabel(startMs)}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.timeRow}
              onPress={() => setPicking("end")}
              accessibilityRole="button"
            >
              <Text style={styles.timeLabel}>Finished</Text>
              <Text style={styles.timeValue}>{clockLabel(endMs)}</Text>
            </TouchableOpacity>
            {endMs < startMs && (
              <Text style={styles.warning}>
                That finishes before it starts. Check the times.
              </Text>
            )}
          </>
        )}

        <TouchableOpacity style={styles.save} onPress={save} accessibilityRole="button">
          <Text style={styles.saveText}>Save</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancel} onPress={onClose} accessibilityRole="button">
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <WhenSheet
        visible={picking !== null}
        loggedAt={new Date(picking === "end" ? endMs : startMs)}
        onLoggedAtChange={(next) => {
          if (picking === "end") {
            setEndMs(next.getTime());
            return;
          }
          // Moving the start moves the finish with it: you're saying the set
          // happened later, not that it took longer.
          const moved = shiftSpanStart(startMs, endMs, next.getTime());
          setStartMs(moved.startMs);
          setEndMs(moved.endMs);
        }}
        onClose={() => setPicking(null)}
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
  caption: { fontSize: 13, color: colors.mutedForeground, marginBottom: 16 },
  tabs: { flexDirection: "row", gap: 6, marginBottom: 20 },
  tab: {
    flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, color: colors.mutedForeground, fontWeight: "600" },
  tabTextOn: { color: "#052E16" },
  durationRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, marginBottom: 14,
  },
  numberInput: {
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, paddingVertical: 12, paddingHorizontal: 18,
    fontSize: 20, color: colors.foreground, minWidth: 74, textAlign: "center",
  },
  unit: { fontSize: 13, color: colors.mutedForeground },
  hint: {
    fontSize: 12, color: colors.mutedForeground, textAlign: "center",
    marginBottom: 8,
  },
  timeRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  timeLabel: { fontSize: 15, color: colors.foreground },
  timeValue: { fontSize: 15, color: colors.primary, fontWeight: "600" },
  warning: { fontSize: 12, color: "#F59E0B", marginTop: 10 },
  save: {
    backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14,
    alignItems: "center", marginTop: 24,
  },
  saveText: { color: "#052E16", fontSize: 15, fontWeight: "600" },
  cancel: { alignItems: "center", paddingVertical: 14 },
  cancelText: { color: colors.mutedForeground, fontSize: 14 },
});
