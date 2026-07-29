import React from "react";
import { Switch, Text, View } from "react-native";
import type { NutritionVendor } from "@/src/types/nutrition-preferences";
import { colors } from "@/src/lib/colors";
import { nutritionStyles as s } from "./styles";

interface VendorsSectionProps {
  vendors: NutritionVendor[];
  onToggleActive: (vendor: NutritionVendor, isActive: boolean) => void;
}

export function VendorsSection({ vendors, onToggleActive }: VendorsSectionProps) {
  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>Vendors</Text>
      {vendors.map((v) => (
        <View key={v.id} style={s.row}>
          <View style={s.flexShrinkColumn}>
            <Text style={s.rowLabel}>{v.name}</Text>
            {v.app_url ? <Text style={s.mutedText}>{v.app_url}</Text> : null}
          </View>
          <Switch
            value={v.is_active}
            onValueChange={(val) => onToggleActive(v, val)}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
      ))}
    </View>
  );
}
