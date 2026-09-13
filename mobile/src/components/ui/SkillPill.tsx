// The 3-segment skill pill: 1 green / 2 amber / 3 red. Extracted from the
// curated Exercises card so the captured card reads identically.
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, tint } from "@/src/theme/tokens";
import { skillFill } from "@/src/lib/skillLevel";

interface SkillPillProps {
  level: string | null | undefined;
  /** Also print the level word beside the pill, in the pill's colour. */
  showLabel?: boolean;
}

const TONE = { brand: colors.brand, warning: colors.warning, danger: colors.danger } as const;

// A faint neutral that shows on both the page (surface) and a card (surface2) — the whole point of the pill is seeing the unlit segments.
const EMPTY = tint(colors.text, 0.12);

export function SkillPill({ level, showLabel = false }: SkillPillProps) {
  const { filled, tone } = skillFill(level);
  const lit = tone ? TONE[tone] : EMPTY;
  // An unrecognised level still gets a readable word — never the 12% neutral.
  const labelColor = tone ? TONE[tone] : colors.textMuted;
  return (
    <View style={styles.row} accessible={!showLabel && !!level} accessibilityLabel={level ? `Skill: ${level}` : undefined}>
      <View style={styles.pill}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.segment,
              i === 0 && styles.segmentLeft,
              i === 2 && styles.segmentRight,
              { backgroundColor: i < filled ? lit : EMPTY },
            ]}
          />
        ))}
      </View>
      {showLabel && level ? <Text style={[styles.label, { color: labelColor }]}>{level}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  pill: { flexDirection: "row", height: 8, width: 40, gap: 2 },
  segment: { flex: 1, height: "100%" },
  segmentLeft: { borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  segmentRight: { borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  label: { fontSize: 11.5, fontWeight: "600" },
});
