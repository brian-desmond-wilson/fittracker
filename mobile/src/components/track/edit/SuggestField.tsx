// A text field that prefers a word you have already used.
//
// Brand and flavor were free text, which is how one shop becomes "Kirkland",
// "Kirkland Signature" and "KIRKLAND". This keeps typing available — you must
// be able to record something genuinely new — but makes the existing spelling
// the default, and shows how many items already carry each option so a
// one-off typo is visible as a one-off.
import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Check, ChevronDown, Plus } from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { filterOptions, isNewValue } from "@/src/lib/vocabMatch";

export interface SuggestOption {
  value: string;
  /** Shown greyed beside the option — item counts, or a scope note. */
  note?: string;
}

interface SuggestFieldProps {
  label: string;
  value: string;
  placeholder: string;
  options: SuggestOption[];
  onChange: (next: string) => void;
  /** Explains what the list is scoped to, e.g. "Seen for Kirkland Signature". */
  scopeNote?: string;
  /** Word for the "add new" row: "brand", "variety". */
  noun: string;
}

const MAX_VISIBLE = 6;

export function SuggestField({
  label, value, placeholder, options, onChange, scopeNote, noun,
}: SuggestFieldProps) {
  const [open, setOpen] = useState(false);
  // Filter only once you have typed. Opening a filled field with the caret
  // otherwise filters by the value already in it, so the list shows the one
  // brand you have and nothing you might switch to — the opposite of what
  // reaching for the caret means.
  const [typed, setTyped] = useState(false);

  const matches = filterOptions(options, typed ? value : "", (o) => o.value)
    .slice(0, MAX_VISIBLE);
  const canAdd = typed && isNewValue(options.map((o) => o.value), value);

  const pick = (next: string) => {
    onChange(next);
    setTyped(false);
    setOpen(false);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, open && styles.fieldOpen]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(t) => { onChange(t); setTyped(true); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          autoCapitalize="words"
          autoCorrect={false}
        />
        <TouchableOpacity
          onPress={() => { setTyped(false); setOpen((v) => !v); }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={open ? `Hide ${noun} suggestions` : `Show ${noun} suggestions`}
        >
          <ChevronDown size={icons.sm} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
        </TouchableOpacity>
      </View>

      {open && (matches.length > 0 || canAdd) && (
        <View style={styles.menu}>
          {scopeNote && matches.length > 0 && (
            <Text style={styles.scope}>{scopeNote}</Text>
          )}
          {matches.map((o) => {
            const chosen = o.value.toLowerCase() === value.trim().toLowerCase();
            return (
              <TouchableOpacity
                key={o.value}
                style={[styles.row, chosen && styles.rowChosen]}
                onPress={() => pick(o.value)}
                accessibilityRole="button"
                accessibilityLabel={o.note ? `${o.value}, ${o.note}` : o.value}
              >
                <Text style={styles.rowText} numberOfLines={1}>{o.value}</Text>
                {o.note && <Text style={styles.rowNote}>{o.note}</Text>}
                {chosen && (
                  <Check size={icons.sm} color={colors.brand} strokeWidth={icons.strokeWidth} />
                )}
              </TouchableOpacity>
            );
          })}
          {canAdd && (
            <TouchableOpacity
              style={styles.row}
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel={`Use ${value} as a new ${noun}`}
            >
              <Plus size={icons.sm} color={colors.brand} strokeWidth={icons.strokeWidth} />
              <Text style={[styles.rowText, styles.rowNew]} numberOfLines={1}>
                Use “{value.trim()}” as a new {noun}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { ...typography.caption, fontWeight: "600", color: colors.textMuted, marginBottom: spacing.xs },
  field: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
    paddingHorizontal: spacing.md,
  },
  fieldOpen: { borderColor: colors.brand },
  // 16px is the iOS zoom threshold and the app's de-facto input size; the
  // guide records the missing token rather than a different value.
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: spacing.md },
  menu: {
    marginTop: spacing.xs,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
    backgroundColor: colors.surface2, overflow: "hidden",
  },
  scope: {
    ...typography.caption, color: colors.textFaint,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  rowChosen: { backgroundColor: tint(colors.brand) },
  rowText: { ...typography.body, color: colors.text, flex: 1, minWidth: 0 },
  rowNote: { ...typography.caption, color: colors.textFaint },
  rowNew: { color: colors.brand, fontWeight: "600" },
});
