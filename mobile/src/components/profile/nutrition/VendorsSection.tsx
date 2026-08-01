import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { NutritionVendor } from "@/src/types/nutrition-preferences";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { Card, SectionHeader } from "@/src/components/ui";

export type VendorPatch = { name?: string; app_url?: string | null };

interface VendorsSectionProps {
  vendors: NutritionVendor[];
  onToggleActive: (vendor: NutritionVendor, isActive: boolean) => void;
  onPatch: (vendor: NutritionVendor, patch: VendorPatch) => void;
}

// Matches a URI scheme prefix per RFC 3986 §3.1 (a letter, then any run of
// letters/digits/+/-/.), followed by ":" — e.g. "https:" or "instacart:".
// A bare host/path like "instacart.com" has no match and gets "https://"
// prefixed on save; a deep link like "instacart://" already has one and
// passes through untouched. This field is explicitly "App / web URL", so
// app schemes are a first-class case, not an edge case to strip.
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
}

interface VendorRowProps {
  vendor: NutritionVendor;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  onToggleActive: (vendor: NutritionVendor, isActive: boolean) => void;
  onPatch: (vendor: NutritionVendor, patch: VendorPatch) => void;
}

const VendorRow = React.memo(function VendorRow({
  vendor,
  expanded,
  onToggleExpand,
  onToggleActive,
  onPatch,
}: VendorRowProps) {
  const [name, setName] = useState(vendor.name);
  const [url, setUrl] = useState(vendor.app_url ?? "");

  // Same hazard ConceptRow.tsx documents for its form-note field: modal
  // teardown (Done button, Android back) unmounts this row without a
  // guaranteed native blur, and switching to another vendor row collapses
  // this one the same way — so onEndEditing alone can silently drop an
  // in-progress edit. This effect's cleanup is guaranteed to run on unmount
  // (and on every collapse, since it's keyed on `expanded`), giving one code
  // path that flushes a dirty edit regardless of how the row goes away.
  // `dirtyRef` avoids re-sending an edit onEndEditing already saved, and the
  // value comparison avoids sending a no-op patch for an edit that
  // round-tripped back to the original values. Crucially, `flush` never
  // collapses the row itself — closing is the header tap's job alone — so
  // moving focus between the Name and URL fields (both call `flush` on
  // blur) can't collapse the editor out from under the user.
  const dirtyRef = useRef(false);
  const latest = useRef({ vendor, onPatch, name, url });
  latest.current = { vendor, onPatch, name, url };

  const flush = () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const { vendor: v, onPatch: patch, name: n, url: u } = latest.current;
    const trimmedName = n.trim();
    const normalizedUrl = normalizeUrl(u);
    const patchObj: VendorPatch = {};
    if (trimmedName) {
      if (trimmedName !== v.name) patchObj.name = trimmedName;
    } else {
      // An empty name is never persisted (nutrition_vendors.name is NOT
      // NULL with no other guard) — reject it visibly by snapping the field
      // back to the last-saved name rather than silently discarding it.
      setName(v.name);
    }
    if (normalizedUrl !== u) setUrl(normalizedUrl);
    if ((normalizedUrl || null) !== v.app_url) patchObj.app_url = normalizedUrl || null;
    if (Object.keys(patchObj).length > 0) patch(v, patchObj);
  };

  useEffect(() => {
    return () => flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  return (
    <View>
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.flexShrinkColumn}
          onPress={() => onToggleExpand(vendor.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.rowTitle}>{vendor.name}</Text>
          {vendor.app_url ? (
            <Text
              style={styles.linkText}
              onPress={() =>
                Linking.openURL(vendor.app_url!).catch((e) =>
                  Alert.alert("Failed to open link", e instanceof Error ? e.message : "Unknown error")
                )
              }
            >
              {vendor.app_url} ↗
            </Text>
          ) : null}
        </TouchableOpacity>
        <Switch
          value={vendor.is_active}
          onValueChange={(val) => onToggleActive(vendor, val)}
          trackColor={{ true: colors.brand, false: colors.border }}
        />
      </View>
      {expanded && (
        <View style={styles.editor}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(text) => {
              setName(text);
              dirtyRef.current = true;
            }}
            onEndEditing={flush}
            placeholder="Vendor name"
            placeholderTextColor={colors.textMuted}
          />
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={(text) => {
              setUrl(text);
              dirtyRef.current = true;
            }}
            onEndEditing={flush}
            placeholder="App / web URL (optional)"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textContentType="URL"
            keyboardType="url"
          />
        </View>
      )}
    </View>
  );
});

export function VendorsSection({ vendors, onToggleActive, onPatch }: VendorsSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // One stable function shared by every row (matches NutritionPreferencesScreen's
  // handleToggleExpand/ConceptRow precedent) rather than a fresh closure per row
  // per render — otherwise VendorRow's React.memo would never bail, since this
  // was the one non-useCallback prop reaching it.
  const toggleExpanded = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <Card variant="panel" style={styles.cardSpacing}>
      <View style={styles.sectionHeaderWrap}>
        <SectionHeader title="Vendors" />
      </View>
      {vendors.map((v) => (
        <VendorRow
          key={v.id}
          vendor={v}
          expanded={expandedId === v.id}
          onToggleExpand={toggleExpanded}
          onToggleActive={onToggleActive}
          onPatch={onPatch}
        />
      ))}
      <Text style={styles.mutedText}>Tap a vendor to edit its name or link.</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginBottom: spacing.lg },
  sectionHeaderWrap: { marginBottom: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  flexShrinkColumn: { flexShrink: 1 },
  rowTitle: { ...typography.rowTitle, color: colors.text },
  // The vendor's deep link is a control, so it takes brand — never an accent.
  linkText: { ...typography.body, color: colors.brand },
  mutedText: { ...typography.body, color: colors.textMuted },
  editor: { marginBottom: spacing.sm, gap: spacing.sm },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16, // §4.5 defines no input token
    color: colors.text,
  },
});
