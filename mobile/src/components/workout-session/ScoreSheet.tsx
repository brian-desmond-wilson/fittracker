// mobile/src/components/workout-session/ScoreSheet.tsx
// "How did it go?" — the score for one served-whole session, in the
// workout's own units (spec 2026-09-13 §4.1–4.2). Opened at Finish on the
// live screen (Save / Skip) and from a history row on the workout page
// (Save / Remove score). The sheet owns its input state; the caller owns
// the write and reports failure back through onSave's result so the typed
// values survive a retry. Scrim taps do not dismiss: this holds typed
// content.
import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Switch, ActivityIndicator, Alert } from "react-native";
import { X } from "lucide-react-native";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { ClockInput } from "@/src/components/ui/ClockInput";
import { colors, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { SCORE_LABELS } from "@/src/lib/workoutFormatVocab";
import { splitDuration } from "@/src/lib/setTiming";
import { formatDuration } from "@/src/lib/timeFormat";
import { parseClock, QUALITIES, QUALITY_LABELS } from "@/src/lib/workoutScore";
import type { Score, ScorableType, Quality, CountedType } from "@/src/lib/workoutScore";
import type { ScoreWriteResult } from "@/src/lib/supabase/sessionScores";

interface ScoreSheetProps {
  visible: boolean;
  workoutName: string;
  scoreType: ScorableType;
  /** Seconds the session clock recorded; null in backfill mode or when unknown. */
  elapsedSeconds: number | null;
  /** The workout's time cap in minutes; null when none. */
  capMinutes: number | null;
  /** Present when editing; drives "Remove score" instead of "Skip". */
  existing: Score | null;
  onSave: (score: Score) => Promise<ScoreWriteResult>;
  onSkip: () => void;
  onRemove?: () => Promise<ScoreWriteResult>;
  onClose: () => void;
}

const COUNTED_CAPTION: Record<Exclude<CountedType, "duration">, string> = {
  reps: "reps", load: "lb", distance: "m", calories: "cal", height: "in",
};

const digitsOnly = (v: string): string => v.replace(/[^0-9]/g, "");
const num = (v: string): number | null => (v === "" ? null : parseInt(v, 10));

export function ScoreSheet({
  visible, workoutName, scoreType, elapsedSeconds, capMinutes, existing, onSave, onSkip, onRemove, onClose,
}: ScoreSheetProps) {
  const [rounds, setRounds] = useState("");
  const [reps, setReps] = useState("");
  const [clock, setClock] = useState({ mins: "", secs: "" });
  const [capped, setCapped] = useState(false);
  const [value, setValue] = useState("");
  const [quality, setQuality] = useState<Quality | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill: an existing score when editing; otherwise the session clock for
  // a time score (live mode only — backfill passes null). Reset on every open
  // so a sheet reopened for another session never shows the last one's numbers.
  useEffect(() => {
    if (!visible) return;
    setError(null);
    setBusy(false);
    setCapped(false);
    setQuality(null);
    setRounds(""); setReps(""); setValue("");
    setClock({ mins: "", secs: "" });
    if (existing) {
      switch (existing.type) {
        case "rounds_reps": setRounds(String(existing.rounds)); setReps(String(existing.reps)); break;
        case "time": {
          const d = splitDuration(existing.seconds);
          setClock({ mins: String(d.mins), secs: String(d.secs) });
          setCapped(existing.capped);
          break;
        }
        case "duration": {
          const d = splitDuration(existing.value);
          setClock({ mins: String(d.mins), secs: String(d.secs) });
          break;
        }
        case "quality": setQuality(existing.quality); break;
        default: setValue(String(existing.value));
      }
      return;
    }
    if (scoreType === "time" && elapsedSeconds !== null && elapsedSeconds > 0) {
      const d = splitDuration(elapsedSeconds);
      setClock({ mins: String(d.mins), secs: String(d.secs) });
    }
  }, [visible, existing, scoreType, elapsedSeconds]);

  const toggleCap = (on: boolean) => {
    setCapped(on);
    if (on && capMinutes !== null) {
      setClock({ mins: String(capMinutes), secs: "0" });
    } else if (!on) {
      const d = splitDuration(elapsedSeconds ?? 0);
      setClock(elapsedSeconds ? { mins: String(d.mins), secs: String(d.secs) } : { mins: "", secs: "" });
    }
  };

  /** The score the inputs describe, or null while they are not yet a score. */
  const draft = (): Score | null => {
    switch (scoreType) {
      case "rounds_reps": {
        const r = num(rounds) ?? 0;
        const p = num(reps) ?? 0;
        if (rounds === "" && reps === "") return null;
        if (r === 0 && p === 0) return null;
        return { type: "rounds_reps", rounds: r, reps: p };
      }
      case "time": {
        if (capped && capMinutes !== null) return { type: "time", seconds: capMinutes * 60, capped: true };
        const s = parseClock(clock.mins, clock.secs);
        return s === null ? null : { type: "time", seconds: s, capped: false };
      }
      case "duration": {
        const s = parseClock(clock.mins, clock.secs);
        return s === null ? null : { type: "duration", value: s };
      }
      case "quality":
        return quality === null ? null : { type: "quality", quality };
      default: {
        const v = num(value);
        return v === null || v <= 0 ? null : { type: scoreType, value: v };
      }
    }
  };

  const score = draft();

  const save = async () => {
    if (!score || busy) return;
    setBusy(true);
    setError(null);
    const result = await onSave(score);
    setBusy(false);
    if (!result.ok) setError(result.message);
  };

  const remove = () => {
    if (!onRemove || busy) return;
    Alert.alert("Remove this score?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          setBusy(true);
          setError(null);
          const result = await onRemove();
          setBusy(false);
          if (!result.ok) setError(result.message);
        },
      },
    ]);
  };

  const input = (() => {
    switch (scoreType) {
      case "rounds_reps":
        return (
          <View style={styles.pair}>
            <View style={styles.pairCell}>
              <TextInput style={styles.field} value={rounds} onChangeText={(v) => setRounds(digitsOnly(v))}
                keyboardType="number-pad" selectTextOnFocus maxLength={3} accessibilityLabel="Rounds" placeholder="0" placeholderTextColor={colors.textFaint} />
              <Text style={styles.unit}>rounds</Text>
            </View>
            <Text style={styles.plus}>+</Text>
            <View style={styles.pairCell}>
              <TextInput style={styles.field} value={reps} onChangeText={(v) => setReps(digitsOnly(v))}
                keyboardType="number-pad" selectTextOnFocus maxLength={3} accessibilityLabel="Partial reps" placeholder="0" placeholderTextColor={colors.textFaint} />
              <Text style={styles.unit}>reps</Text>
            </View>
          </View>
        );
      case "time":
        return (
          <>
            <ClockInput mins={clock.mins} secs={clock.secs} onChange={setClock} disabled={capped} label="Finish time" />
            {capMinutes !== null && (
              <View style={styles.capRow}>
                <Text style={styles.capText}>Hit the time cap ({capMinutes} min)</Text>
                <Switch value={capped} onValueChange={toggleCap} trackColor={{ true: colors.brand, false: colors.border }} />
              </View>
            )}
          </>
        );
      case "duration":
        return <ClockInput mins={clock.mins} secs={clock.secs} onChange={setClock} label="Duration" />;
      case "quality":
        return (
          <View style={styles.pillRow}>
            {QUALITIES.map((qk) => (
              <TouchableOpacity key={qk} style={[styles.pill, quality === qk && styles.pillActive]} onPress={() => setQuality(qk)}
                accessibilityRole="button" accessibilityState={{ selected: quality === qk }}>
                <Text style={[styles.pillText, quality === qk && styles.pillTextActive]}>{QUALITY_LABELS[qk]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      default:
        return (
          <View style={styles.single}>
            <TextInput style={[styles.field, styles.fieldWide]} value={value} onChangeText={(v) => setValue(digitsOnly(v))}
              keyboardType="number-pad" selectTextOnFocus maxLength={6} accessibilityLabel={SCORE_LABELS[scoreType]} placeholder="0" placeholderTextColor={colors.textFaint} />
            <Text style={styles.unit}>{COUNTED_CAPTION[scoreType as Exclude<CountedType, "duration">]}</Text>
          </View>
        );
    }
  })();

  const subtitle = [workoutName, elapsedSeconds !== null && elapsedSeconds > 0 ? `Duration ${formatDuration(elapsedSeconds)}` : null]
    .filter(Boolean).join(" · ");

  return (
    <BottomSheet visible={visible} onClose={onClose} dismissOnScrim={false} closeLabel="Close the score sheet">
      <View style={styles.header}>
        <Text style={styles.title}>How did it go?</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Close">
          <X size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
      <Text style={styles.caption}>{SCORE_LABELS[scoreType]}</Text>
      <View style={styles.inputWrap}>{input}</View>

      <TouchableOpacity
        style={[styles.save, (busy || !score) && styles.saveDisabled]}
        onPress={save}
        disabled={busy || !score}
        accessibilityRole="button"
        accessibilityLabel="Save score"
        accessibilityState={{ disabled: busy || !score, busy }}
      >
        {busy ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Text style={styles.saveText}>Save</Text>}
      </TouchableOpacity>
      {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      {existing && onRemove ? (
        <TouchableOpacity style={styles.quiet} onPress={remove} disabled={busy} accessibilityRole="button">
          <Text style={styles.quietDanger}>Remove score</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.quiet} onPress={onSkip} disabled={busy} accessibilityRole="button">
          <Text style={styles.quietText}>Skip</Text>
        </TouchableOpacity>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  title: { fontSize: 17, fontWeight: "700", color: colors.text, flexShrink: 1 },
  subtitle: { fontSize: 12.5, color: colors.textMuted, marginTop: 4 },
  caption: { ...typography.caption, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11, marginTop: spacing.lg, marginBottom: spacing.sm },
  inputWrap: { marginBottom: spacing.md },
  pair: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md },
  pairCell: { alignItems: "center", gap: 4 },
  plus: { fontSize: 22, color: colors.textMuted, marginBottom: 18 },
  single: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  field: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.control, paddingVertical: 12, paddingHorizontal: 18,
    fontSize: 20, color: colors.text, minWidth: 74, textAlign: "center",
  },
  fieldWide: { minWidth: 120 },
  unit: { fontSize: 13, color: colors.textMuted },
  capRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
  capText: { fontSize: 14, color: colors.text },
  pillRow: { flexDirection: "row", gap: 8 },
  pill: {
    flex: 1, alignItems: "center", paddingVertical: 11,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill,
  },
  pillActive: { borderColor: colors.brand, backgroundColor: tint(colors.brand) },
  pillText: { fontSize: 13.5, color: colors.textMuted },
  pillTextActive: { color: colors.brand, fontWeight: "600" },
  save: { backgroundColor: colors.brand, borderRadius: radii.control, paddingVertical: 14, alignItems: "center", marginTop: spacing.sm },
  saveDisabled: { opacity: 0.5 },
  saveText: { color: colors.onBrand, ...typography.button },
  error: { fontSize: 13, color: colors.danger, textAlign: "center", marginTop: spacing.sm },
  quiet: { alignItems: "center", paddingVertical: 14 },
  quietText: { color: colors.textMuted, fontSize: 14 },
  quietDanger: { color: colors.danger, fontSize: 14 },
});
