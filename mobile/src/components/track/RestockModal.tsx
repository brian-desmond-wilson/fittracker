import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { X, Package } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { FoodInventoryItemWithLocations, FoodLocation } from "@/src/types/track";

interface RestockModalProps {
  visible: boolean;
  onClose: () => void;
  item: FoodInventoryItemWithLocations | null;
  onConfirm: (sourceLocation: FoodLocation | "store", quantity: number) => void;
}

type SourceOption = FoodLocation | "store";

const LOCATION_LABELS: Record<SourceOption, string> = {
  fridge: "Fridge",
  freezer: "Freezer",
  pantry: "Pantry",
  cabinet: "Cabinet",
  store: "Store (Add New)",
};

export function RestockModal({ visible, onClose, item, onConfirm }: RestockModalProps) {
  const [selectedSource, setSelectedSource] = useState<SourceOption | null>(null);
  const [quantity, setQuantity] = useState("");

  // Reset state when modal opens/closes or item changes
  useEffect(() => {
    if (!visible || !item) {
      setSelectedSource(null);
      setQuantity("");
    }
  }, [visible, item]);

  if (!item) return null;

  // Get available source locations (those with quantity > 0)
  const availableSources: SourceOption[] = [
    ...item.locations
      .filter(loc => loc.quantity > 0)
      .map(loc => loc.location),
    "store", // Always include store
  ];

  // Get quantity available at selected source
  const getSourceQuantity = (source: SourceOption): number => {
    if (source === "store") return Infinity;
    const location = item.locations.find(loc => loc.location === source);
    return location?.quantity || 0;
  };

  // Calculate preview quantities
  const quantityNum = parseInt(quantity) || 0;
  const sourceQuantity = selectedSource ? getSourceQuantity(selectedSource) : 0;
  const isValid = quantityNum > 0 && selectedSource !== null &&
    (selectedSource === "store" || quantityNum <= sourceQuantity);

  // Get the target location (ready to consume location)
  const targetLocation = item.locations.find(loc => loc.is_ready_to_consume);
  const currentTargetQty = targetLocation?.quantity || 0;
  const newTargetQty = currentTargetQty + quantityNum;

  // Calculate new source quantity
  const currentSourceQty = selectedSource ? getSourceQuantity(selectedSource) : 0;
  const newSourceQty = selectedSource === "store"
    ? currentSourceQty
    : currentSourceQty - quantityNum;

  const handleConfirm = () => {
    if (!isValid || !selectedSource) return;
    onConfirm(selectedSource, quantityNum);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Package size={24} color="#8B5CF6" />
            <Text style={styles.title}>Restock Item</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Item Info */}
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{item.name}</Text>
            {item.brand && <Text style={styles.itemBrand}>{item.brand}</Text>}
          </View>

          {/* Current Quantities */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>CURRENT QUANTITIES</Text>
            <View style={styles.quantitiesRow}>
              <View style={styles.quantityBox}>
                <Text style={styles.quantityLabel}>
                  {targetLocation?.location === "fridge" ? "Fridge" :
                   targetLocation?.location === "freezer" ? "Freezer" :
                   targetLocation?.location === "pantry" ? "Pantry" : "Cabinet"}
                </Text>
                <Text style={styles.quantityValue}>{currentTargetQty}</Text>
              </View>
              <View style={styles.quantityBox}>
                <Text style={styles.quantityLabel}>Total</Text>
                <Text style={styles.quantityValue}>{item.total_quantity}</Text>
              </View>
            </View>
          </View>

          {/* Source Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>RESTOCK FROM</Text>
            {availableSources.map((source) => {
              const sourceQty = getSourceQuantity(source);
              const isSelected = selectedSource === source;

              return (
                <TouchableOpacity
                  key={source}
                  style={styles.radioOption}
                  onPress={() => setSelectedSource(source)}
                  activeOpacity={0.7}
                >
                  <View style={styles.radioLeft}>
                    <View style={[styles.radio, isSelected && styles.radioSelected]}>
                      {isSelected && <View style={styles.radioInner} />}
                    </View>
                    <Text style={styles.radioLabel}>{LOCATION_LABELS[source]}</Text>
                  </View>
                  {source !== "store" && (
                    <Text style={styles.sourceQuantity}>Qty: {sourceQty}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Quantity Input */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>QUANTITY TO RESTOCK</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter quantity"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              value={quantity}
              onChangeText={setQuantity}
            />
            {selectedSource && selectedSource !== "store" && quantityNum > sourceQuantity && (
              <Text style={styles.errorText}>
                Exceeds available quantity ({sourceQuantity})
              </Text>
            )}
          </View>

          {/* Preview */}
          {isValid && (
            <View style={styles.previewSection}>
              <Text style={styles.previewTitle}>PREVIEW</Text>

              {/* Target Location Preview */}
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>
                  {targetLocation?.location === "fridge" ? "Fridge" :
                   targetLocation?.location === "freezer" ? "Freezer" :
                   targetLocation?.location === "pantry" ? "Pantry" : "Cabinet"}
                </Text>
                <View style={styles.previewChange}>
                  <Text style={styles.previewOld}>{currentTargetQty}</Text>
                  <Text style={styles.previewArrow}>→</Text>
                  <Text style={styles.previewNew}>{newTargetQty}</Text>
                </View>
              </View>

              {/* Source Location Preview */}
              {selectedSource !== "store" && (
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>
                    {LOCATION_LABELS[selectedSource]}
                  </Text>
                  <View style={styles.previewChange}>
                    <Text style={styles.previewOld}>{currentSourceQty}</Text>
                    <Text style={styles.previewArrow}>→</Text>
                    <Text style={styles.previewNew}>{newSourceQty}</Text>
                  </View>
                </View>
              )}

              {/* Total Preview */}
              <View style={[styles.previewRow, styles.previewTotal]}>
                <Text style={[styles.previewLabel, styles.previewTotalLabel]}>Total Inventory</Text>
                <View style={styles.previewChange}>
                  <Text style={styles.previewOld}>{item.total_quantity}</Text>
                  <Text style={styles.previewArrow}>→</Text>
                  <Text style={[styles.previewNew, styles.previewTotalValue]}>
                    {selectedSource === "store"
                      ? item.total_quantity + quantityNum
                      : item.total_quantity}
                  </Text>
                </View>
              </View>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Footer Actions */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.confirmButton, !isValid && styles.confirmButtonDisabled]}
            onPress={handleConfirm}
            activeOpacity={0.7}
            disabled={!isValid}
          >
            <Text style={styles.confirmButtonText}>Confirm Restock</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.foreground,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  itemInfo: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemName: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.foreground,
    marginBottom: 4,
  },
  itemBrand: {
    fontSize: 16,
    color: colors.mutedForeground,
  },
  section: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.mutedForeground,
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  quantitiesRow: {
    flexDirection: "row",
    gap: 12,
  },
  quantityBox: {
    flex: 1,
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quantityLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.mutedForeground,
    marginBottom: 8,
  },
  quantityValue: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.foreground,
  },
  radioOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  radioLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: "#8B5CF6",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#8B5CF6",
  },
  radioLabel: {
    fontSize: 16,
    color: colors.foreground,
  },
  sourceQuantity: {
    fontSize: 14,
    color: colors.mutedForeground,
    fontWeight: "600",
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.foreground,
  },
  errorText: {
    fontSize: 13,
    color: "#EF4444",
    marginTop: 8,
    fontWeight: "500",
  },
  previewSection: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: "rgba(139, 92, 246, 0.05)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.2)",
  },
  previewTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8B5CF6",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  previewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  previewTotal: {
    borderTopWidth: 1,
    borderTopColor: "rgba(139, 92, 246, 0.2)",
    marginTop: 8,
    paddingTop: 12,
  },
  previewLabel: {
    fontSize: 14,
    color: colors.foreground,
    fontWeight: "500",
  },
  previewTotalLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  previewChange: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  previewOld: {
    fontSize: 14,
    color: colors.mutedForeground,
    fontWeight: "600",
  },
  previewArrow: {
    fontSize: 14,
    color: "#8B5CF6",
    fontWeight: "600",
  },
  previewNew: {
    fontSize: 14,
    color: "#8B5CF6",
    fontWeight: "700",
  },
  previewTotalValue: {
    fontSize: 16,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  confirmButton: {
    flex: 1.5,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
  },
  confirmButtonDisabled: {
    opacity: 0.4,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
