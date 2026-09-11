// mobile/src/components/training/daily/filterSheet/FilterSheetFrame.tsx
// The page-sheet shell every filter sheet shares (mockup A3): close on the
// left, title, Reset on the right, a scroll for the axes, and the "Show N"
// button at the END of the scroll — never pinned. A pushed page (muscles,
// creators) replaces the whole body; the caller decides which.
import React from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

interface FilterSheetFrameProps {
  visible: boolean;
  /** When set, this page renders instead of the root content. */
  pushed: React.ReactNode | null;
  onClose: () => void;
  /** Android back / swipe-down: pops the pushed page or closes the sheet. */
  onRequestClose: () => void;
  onReset: () => void;
  /** "Show 12 exercises" */
  ctaLabel: string;
  onCta: () => void;
  children: React.ReactNode;
}

export function FilterSheetFrame({
  visible, pushed, onClose, onRequestClose, onReset, ctaLabel, onCta, children,
}: FilterSheetFrameProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onRequestClose}>
      {pushed ?? (
        <View style={styles.page}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button" accessibilityLabel="Close filters">
              <X size={22} color={colors.textMuted} />
            </TouchableOpacity>
            <Text style={styles.title}>Filters</Text>
            <TouchableOpacity onPress={onReset} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.reset}>Reset</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
            {children}
            <TouchableOpacity style={styles.cta} onPress={onCta} accessibilityRole="button">
              <Text style={styles.ctaText}>{ctaLabel}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}
    </Modal>
  );
}

/** Section header; shared so every sheet's headings match. */
export function FilterSection({ title, hint }: { title: string; hint?: string }) {
  if (!hint) return <Text style={styles.section}>{title}</Text>;
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.screenGutter, paddingTop: spacing.lg, paddingBottom: spacing.sm,
  },
  title: { fontSize: 17, fontWeight: "600", color: colors.text },
  reset: { fontSize: 15, fontWeight: "600", color: colors.brand },
  sectionRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    paddingRight: spacing.screenGutter,
  },
  section: {
    fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase",
    color: colors.textMuted, paddingHorizontal: spacing.screenGutter, paddingTop: spacing.lg, paddingBottom: spacing.sm,
  },
  hint: { fontSize: 12, fontWeight: "600", color: colors.brand, paddingBottom: spacing.sm },
  cta: {
    marginHorizontal: spacing.screenGutter, marginTop: spacing.xl, height: 48,
    backgroundColor: colors.brand, borderRadius: radii.control, alignItems: "center", justifyContent: "center",
  },
  ctaText: { color: colors.onBrand, ...typography.button },
});
