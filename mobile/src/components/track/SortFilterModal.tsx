import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Switch,
} from "react-native";
import { X, Check } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { FoodLocation, StorageType } from "@/src/types/track";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type SortOption =
  | "name-asc"
  | "name-desc"
  | "quantity-low"
  | "quantity-high"
  | "expiration-soon"
  | "expiration-late"
  | "category-asc"
  | "date-newest"
  | "date-oldest";

export interface FilterOptions {
  locations: FoodLocation[];
  categories: string[];
  stockStatus: ("low-stock" | "expiring-soon" | "out-of-stock")[];
  storageTypes: StorageType[];
  showExpired: boolean;
}

interface SortFilterModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (sort: SortOption, filters: FilterOptions) => void;
  availableCategories: string[];
  currentSort: SortOption;
  currentFilters: FilterOptions;
}

const STORAGE_KEY_SORT = "@food_inventory_sort";
const STORAGE_KEY_FILTERS = "@food_inventory_filters";

export function SortFilterModal({
  visible,
  onClose,
  onApply,
  availableCategories,
  currentSort,
  currentFilters,
}: SortFilterModalProps) {
  const [selectedSort, setSelectedSort] = useState<SortOption>(currentSort);
  const [selectedLocations, setSelectedLocations] = useState<FoodLocation[]>(
    currentFilters.locations
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    currentFilters.categories
  );
  const [selectedStockStatus, setSelectedStockStatus] = useState<
    ("low-stock" | "expiring-soon" | "out-of-stock")[]
  >(currentFilters.stockStatus);
  const [selectedStorageTypes, setSelectedStorageTypes] = useState<StorageType[]>(
    currentFilters.storageTypes
  );
  const [showExpired, setShowExpired] = useState(currentFilters.showExpired);

  // Update local state when props change
  useEffect(() => {
    setSelectedSort(currentSort);
    setSelectedLocations(currentFilters.locations);
    setSelectedCategories(currentFilters.categories);
    setSelectedStockStatus(currentFilters.stockStatus);
    setSelectedStorageTypes(currentFilters.storageTypes);
    setShowExpired(currentFilters.showExpired);
  }, [currentSort, currentFilters]);

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: "name-asc", label: "Name (A-Z)" },
    { value: "name-desc", label: "Name (Z-A)" },
    { value: "quantity-low", label: "Quantity (Low to High)" },
    { value: "quantity-high", label: "Quantity (High to Low)" },
    { value: "expiration-soon", label: "Expiring Soon First" },
    { value: "expiration-late", label: "Expiring Late First" },
    { value: "category-asc", label: "Category (A-Z)" },
    { value: "date-newest", label: "Date Added (Newest)" },
    { value: "date-oldest", label: "Date Added (Oldest)" },
  ];

  const locationOptions: { value: FoodLocation; label: string }[] = [
    { value: "fridge", label: "Fridge" },
    { value: "freezer", label: "Freezer" },
    { value: "pantry", label: "Pantry" },
    { value: "cabinet", label: "Cabinet" },
  ];

  const stockStatusOptions: {
    value: "low-stock" | "expiring-soon" | "out-of-stock";
    label: string;
  }[] = [
    { value: "low-stock", label: "Low Stock" },
    { value: "expiring-soon", label: "Expiring Soon (7 days)" },
    { value: "out-of-stock", label: "Out of Stock" },
  ];

  const storageTypeOptions: { value: StorageType; label: string }[] = [
    { value: "single-location", label: "Single Location" },
    { value: "multi-location", label: "Multi Location" },
  ];

  const toggleLocation = (location: FoodLocation) => {
    setSelectedLocations((prev) =>
      prev.includes(location)
        ? prev.filter((l) => l !== location)
        : [...prev, location]
    );
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const toggleStockStatus = (status: "low-stock" | "expiring-soon" | "out-of-stock") => {
    setSelectedStockStatus((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const toggleStorageType = (type: StorageType) => {
    setSelectedStorageTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleClearAll = async () => {
    const clearedFilters: FilterOptions = {
      locations: [],
      categories: [],
      stockStatus: [],
      storageTypes: [],
      showExpired: true,
    };

    // Save cleared filters to AsyncStorage
    try {
      await AsyncStorage.setItem(STORAGE_KEY_SORT, "name-asc");
      await AsyncStorage.setItem(STORAGE_KEY_FILTERS, JSON.stringify(clearedFilters));
    } catch (error) {
      console.error("Error saving cleared filters:", error);
    }

    // Apply the cleared filters
    onApply("name-asc", clearedFilters);
    onClose();
  };

  const handleApply = async () => {
    const filters: FilterOptions = {
      locations: selectedLocations,
      categories: selectedCategories,
      stockStatus: selectedStockStatus,
      storageTypes: selectedStorageTypes,
      showExpired,
    };

    // Save to AsyncStorage for persistence
    try {
      await AsyncStorage.setItem(STORAGE_KEY_SORT, selectedSort);
      await AsyncStorage.setItem(STORAGE_KEY_FILTERS, JSON.stringify(filters));
    } catch (error) {
      console.error("Error saving sort/filter preferences:", error);
    }

    onApply(selectedSort, filters);
    onClose();
  };

  const hasActiveFilters =
    selectedLocations.length > 0 ||
    selectedCategories.length > 0 ||
    selectedStockStatus.length > 0 ||
    selectedStorageTypes.length > 0 ||
    !showExpired;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Sort & Filter</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Sort Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SORT BY</Text>
            {sortOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={styles.optionRow}
                onPress={() => setSelectedSort(option.value)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.optionLabel,
                    selectedSort === option.value && styles.optionLabelSelected,
                  ]}
                >
                  {option.label}
                </Text>
                {selectedSort === option.value && (
                  <Check size={20} color="#8B5CF6" strokeWidth={2.5} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Location Filter */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>FILTER BY LOCATION</Text>
            {locationOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={styles.optionRow}
                onPress={() => toggleLocation(option.value)}
                activeOpacity={0.7}
              >
                <Text style={styles.optionLabel}>{option.label}</Text>
                <View
                  style={[
                    styles.checkbox,
                    selectedLocations.includes(option.value) && styles.checkboxChecked,
                  ]}
                >
                  {selectedLocations.includes(option.value) && (
                    <Check size={16} color="#FFFFFF" strokeWidth={3} />
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Category Filter */}
          {availableCategories.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>FILTER BY CATEGORY</Text>
              {availableCategories.map((category) => (
                <TouchableOpacity
                  key={category}
                  style={styles.optionRow}
                  onPress={() => toggleCategory(category)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.optionLabel}>{category}</Text>
                  <View
                    style={[
                      styles.checkbox,
                      selectedCategories.includes(category) && styles.checkboxChecked,
                    ]}
                  >
                    {selectedCategories.includes(category) && (
                      <Check size={16} color="#FFFFFF" strokeWidth={3} />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Stock Status Filter */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>FILTER BY STOCK STATUS</Text>
            {stockStatusOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={styles.optionRow}
                onPress={() => toggleStockStatus(option.value)}
                activeOpacity={0.7}
              >
                <Text style={styles.optionLabel}>{option.label}</Text>
                <View
                  style={[
                    styles.checkbox,
                    selectedStockStatus.includes(option.value) && styles.checkboxChecked,
                  ]}
                >
                  {selectedStockStatus.includes(option.value) && (
                    <Check size={16} color="#FFFFFF" strokeWidth={3} />
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Storage Type Filter */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>FILTER BY STORAGE TYPE</Text>
            {storageTypeOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={styles.optionRow}
                onPress={() => toggleStorageType(option.value)}
                activeOpacity={0.7}
              >
                <Text style={styles.optionLabel}>{option.label}</Text>
                <View
                  style={[
                    styles.checkbox,
                    selectedStorageTypes.includes(option.value) && styles.checkboxChecked,
                  ]}
                >
                  {selectedStorageTypes.includes(option.value) && (
                    <Check size={16} color="#FFFFFF" strokeWidth={3} />
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Show Expired Toggle */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>OTHER OPTIONS</Text>
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>Show Expired Items</Text>
              <Switch
                value={showExpired}
                onValueChange={setShowExpired}
                trackColor={{ false: colors.border, true: "#8B5CF6" }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Footer Actions */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClearAll}
            activeOpacity={0.7}
          >
            <Text style={styles.clearButtonText}>Clear All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.applyButton, !hasActiveFilters && { opacity: 0.6 }]}
            onPress={handleApply}
            activeOpacity={0.7}
          >
            <Text style={styles.applyButtonText}>
              Apply {hasActiveFilters ? "Filters" : "Sort"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// Helper function to load saved preferences
export async function loadSortFilterPreferences(): Promise<{
  sort: SortOption;
  filters: FilterOptions;
}> {
  try {
    const savedSort = await AsyncStorage.getItem(STORAGE_KEY_SORT);
    const savedFilters = await AsyncStorage.getItem(STORAGE_KEY_FILTERS);

    return {
      sort: (savedSort as SortOption) || "name-asc",
      filters: savedFilters
        ? JSON.parse(savedFilters)
        : {
            locations: [],
            categories: [],
            stockStatus: [],
            storageTypes: [],
            showExpired: true,
          },
    };
  } catch (error) {
    console.error("Error loading sort/filter preferences:", error);
    return {
      sort: "name-asc",
      filters: {
        locations: [],
        categories: [],
        stockStatus: [],
        storageTypes: [],
        showExpired: true,
      },
    };
  }
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
  section: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.mutedForeground,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  optionLabel: {
    fontSize: 16,
    color: colors.foreground,
  },
  optionLabelSelected: {
    fontWeight: "600",
    color: "#8B5CF6",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#8B5CF6",
    borderColor: "#8B5CF6",
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
  clearButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  clearButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  applyButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
