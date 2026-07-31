import React, { useState } from "react";
import { Alert, Linking, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { NutritionVendor } from "@/src/types/nutrition-preferences";
import { colors } from "@/src/lib/colors";
import { nutritionStyles as s } from "./styles";

interface VendorsSectionProps {
  vendors: NutritionVendor[];
  onToggleActive: (vendor: NutritionVendor, isActive: boolean) => void;
  onPatch: (vendor: NutritionVendor, patch: { name?: string; app_url?: string | null }) => void;
}

export function VendorsSection({ vendors, onToggleActive, onPatch }: VendorsSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const startEdit = (v: NutritionVendor) => {
    setEditingId(v.id);
    setName(v.name);
    setUrl(v.app_url ?? "");
  };
  const commit = (v: NutritionVendor) => {
    setEditingId(null);
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    const patch: { name?: string; app_url?: string | null } = {};
    if (trimmedName && trimmedName !== v.name) patch.name = trimmedName;
    if ((trimmedUrl || null) !== v.app_url) patch.app_url = trimmedUrl || null;
    if (Object.keys(patch).length > 0) onPatch(v, patch);
  };

  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>Vendors</Text>
      {vendors.map((v) => (
        <View key={v.id}>
          <View style={s.row}>
            <TouchableOpacity
              style={s.flexShrinkColumn}
              onPress={() => (editingId === v.id ? commit(v) : startEdit(v))}
            >
              <Text style={s.rowLabel}>{v.name}</Text>
              {v.app_url ? (
                <Text
                  style={[s.mutedText, { color: colors.primary }]}
                  onPress={() =>
                    Linking.openURL(v.app_url!).catch((e) =>
                      Alert.alert("Failed to open link", e instanceof Error ? e.message : "Unknown error")
                    )
                  }
                >
                  {v.app_url} ↗
                </Text>
              ) : null}
            </TouchableOpacity>
            <Switch
              value={v.is_active}
              onValueChange={(val) => onToggleActive(v, val)}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
          {editingId === v.id && (
            <View style={{ marginBottom: 8 }}>
              <TextInput
                style={s.input}
                value={name}
                onChangeText={setName}
                placeholder="Vendor name"
                placeholderTextColor={colors.mutedForeground}
              />
              <TextInput
                style={s.input}
                value={url}
                onChangeText={setUrl}
                placeholder="App / web URL (optional)"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                keyboardType="url"
                onEndEditing={() => commit(v)}
              />
            </View>
          )}
        </View>
      ))}
      <Text style={s.mutedText}>Tap a vendor to edit its name or link.</Text>
    </View>
  );
}
