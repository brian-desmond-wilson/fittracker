import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { ScanBarcode, Search, Plus } from "lucide-react-native";
import { colors } from "@/src/lib/colors";

interface QuickActionBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onBarcodePress: () => void;
  onAddPress: () => void;
  onSearchSubmit?: () => void;
}

export function QuickActionBar({
  searchQuery,
  onSearchChange,
  onBarcodePress,
  onAddPress,
  onSearchSubmit,
}: QuickActionBarProps) {
  return (
    <View style={styles.container}>
      {/* Barcode Scan Button */}
      <TouchableOpacity
        style={styles.barcodeButton}
        onPress={onBarcodePress}
        activeOpacity={0.7}
      >
        <ScanBarcode size={22} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Search size={18} color={colors.mutedForeground} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search foods..."
          placeholderTextColor={colors.mutedForeground}
          value={searchQuery}
          onChangeText={onSearchChange}
          onSubmitEditing={onSearchSubmit}
          returnKeyType="search"
        />
      </View>

      {/* Add Button */}
      <TouchableOpacity
        style={styles.addButton}
        onPress={onAddPress}
        activeOpacity={0.7}
      >
        <Plus size={22} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  barcodeButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.foreground,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
  },
});
