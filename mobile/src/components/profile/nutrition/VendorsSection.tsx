import React, { useEffect, useRef, useState } from "react";
import { Alert, Linking, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { NutritionVendor } from "@/src/types/nutrition-preferences";
import { colors } from "@/src/lib/colors";
import { nutritionStyles as s } from "./styles";

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
  onToggleExpand: () => void;
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
      <View style={s.row}>
        <TouchableOpacity
          style={s.flexShrinkColumn}
          onPress={onToggleExpand}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={s.rowLabel}>{vendor.name}</Text>
          {vendor.app_url ? (
            <Text
              style={[s.mutedText, { color: colors.primary }]}
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
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
      {expanded && (
        <View style={{ marginBottom: 8 }}>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={(text) => {
              setName(text);
              dirtyRef.current = true;
            }}
            onEndEditing={flush}
            placeholder="Vendor name"
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            style={s.input}
            value={url}
            onChangeText={(text) => {
              setUrl(text);
              dirtyRef.current = true;
            }}
            onEndEditing={flush}
            placeholder="App / web URL (optional)"
            placeholderTextColor={colors.mutedForeground}
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

  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>Vendors</Text>
      {vendors.map((v) => (
        <VendorRow
          key={v.id}
          vendor={v}
          expanded={expandedId === v.id}
          onToggleExpand={() => setExpandedId((prev) => (prev === v.id ? null : v.id))}
          onToggleActive={onToggleActive}
          onPatch={onPatch}
        />
      ))}
      <Text style={s.mutedText}>Tap a vendor to edit its name or link.</Text>
    </View>
  );
}
