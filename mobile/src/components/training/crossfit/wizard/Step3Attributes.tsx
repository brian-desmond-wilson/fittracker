// Step 3: identity attributes — what makes this row THIS row.
//
// The movement model gives every identity attribute exactly one FK column,
// so each control is a single-select bottom-sheet picker (house rule: no
// inline pickers). Equipment stays a multi-select junction, and movement
// styles show the IDENTITY styles (Strict, Kipping, Weighted…) — modifier
// styles a loaded edit carries ride along untouched. The variant label is a
// picker over the chosen core's own vocabulary only — never free text (G4).
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import type { WizardFormData } from '../CatalogItemWizard';
import {
  fetchLoadPositions,
  fetchStances,
  fetchMovementStyles,
  fetchSymmetries,
  fetchRangeDepths,
  fetchEquipment,
  fetchGrips,
  fetchDirections,
  fetchSupportPositions,
  fetchArmPositions,
  fetchBenchAngles,
  fetchVariantLabels,
} from '@/src/lib/supabase/crossfit';
import type {
  LoadPosition,
  Stance,
  MovementStyle,
  Symmetry,
  RangeDepth,
  Equipment,
  Grip,
  Direction,
  SupportPosition,
  ArmPosition,
  BenchAngle,
  VariantLabel,
} from '@/src/types/crossfit';
import { AttributePickerSheet, type AttributeOption } from './AttributePickerSheet';

interface Step3AttributesProps {
  formData: WizardFormData;
  updateFormData: (updates: Partial<WizardFormData>) => void;
}

/** The single-select identity columns this step edits via sheets. */
type PickerKey =
  | 'load_position_id'
  | 'stance_id'
  | 'range_depth_id'
  | 'symmetry_id'
  | 'grip_orientation_id'
  | 'grip_width_id'
  | 'bench_angle_id'
  | 'direction_id'
  | 'support_position_id'
  | 'arm_position_id'
  | 'variant_label_id';

export function Step3Attributes({ formData, updateFormData }: Step3AttributesProps) {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loadPositions, setLoadPositions] = useState<LoadPosition[]>([]);
  const [stances, setStances] = useState<Stance[]>([]);
  const [movementStyles, setMovementStyles] = useState<MovementStyle[]>([]);
  const [symmetries, setSymmetries] = useState<Symmetry[]>([]);
  const [depths, setDepths] = useState<RangeDepth[]>([]);
  const [grips, setGrips] = useState<Grip[]>([]);
  const [directions, setDirections] = useState<Direction[]>([]);
  const [supportPositions, setSupportPositions] = useState<SupportPosition[]>([]);
  const [armPositions, setArmPositions] = useState<ArmPosition[]>([]);
  const [benchAngles, setBenchAngles] = useState<BenchAngle[]>([]);
  const [variantLabels, setVariantLabels] = useState<VariantLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [openPicker, setOpenPicker] = useState<PickerKey | null>(null);

  useEffect(() => {
    loadReferenceData();
  }, []);

  // The variant vocabulary is scoped to the chosen core (G2/G4).
  useEffect(() => {
    if (formData.kind === 'derivation' && formData.core_movement_id) {
      fetchVariantLabels(formData.core_movement_id)
        .then(setVariantLabels)
        .catch((error) => {
          console.error('Error loading variant labels:', error);
          setVariantLabels([]);
        });
    } else {
      setVariantLabels([]);
    }
  }, [formData.kind, formData.core_movement_id]);

  const loadReferenceData = async () => {
    try {
      setLoading(true);
      const [
        equipmentData,
        loadPosData,
        stancesData,
        stylesData,
        symmetriesData,
        depthsData,
        gripsData,
        directionsData,
        supportData,
        armData,
        benchData,
      ] = await Promise.all([
        fetchEquipment(),
        fetchLoadPositions(),
        fetchStances(),
        fetchMovementStyles(),
        fetchSymmetries(),
        fetchRangeDepths(),
        fetchGrips(),
        fetchDirections(),
        fetchSupportPositions(),
        fetchArmPositions(),
        fetchBenchAngles(),
      ]);

      setEquipment(equipmentData);
      setLoadPositions(loadPosData);
      setStances(stancesData);
      setMovementStyles(stylesData);
      setSymmetries(symmetriesData);
      setDepths(depthsData);
      setGrips(gripsData);
      setDirections(directionsData);
      setSupportPositions(supportData);
      setArmPositions(armData);
      setBenchAngles(benchData);
    } catch (error) {
      console.error('Error loading reference data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleEquipment = (equipmentId: string) => {
    const isSelected = formData.equipment_ids.includes(equipmentId);
    updateFormData({
      equipment_ids: isSelected
        ? formData.equipment_ids.filter(id => id !== equipmentId)
        : [...formData.equipment_ids, equipmentId],
    });
  };

  const toggleMovementStyle = (styleId: string) => {
    const isSelected = formData.movement_style_ids.includes(styleId);
    updateFormData({
      movement_style_ids: isSelected
        ? formData.movement_style_ids.filter(id => id !== styleId)
        : [...formData.movement_style_ids, styleId],
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Group equipment by category
  const equipmentByCategory = equipment.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, Equipment[]>);

  // Define category order
  const categoryOrder = [
    'Free Weights',
    'Implements',
    'Machines',
    'Bodyweight / Apparatus',
    'Supports / Surfaces',
    'Recovery Tools',
  ];

  const gripOrientations = grips.filter((g) => g.category === 'Orientation');
  const gripWidths = grips.filter((g) => g.category === 'Width');
  const identityStyles = movementStyles.filter((s) => s.is_identity);

  const toOptions = (
    rows: { id: string; name: string; description?: string | null }[],
  ): AttributeOption[] =>
    rows.map((r) => ({ id: r.id, name: r.name, description: r.description ?? null }));

  /** Every single-select picker this step offers, in display order. */
  const pickers: {
    key: PickerKey;
    label: string;
    helper: string;
    options: AttributeOption[];
  }[] = [
    {
      key: 'load_position_id',
      label: 'Load Position',
      helper: 'How external weight is held or positioned',
      options: loadPositions.map((p) => ({
        id: p.id,
        name: p.name,
        description: [p.category, p.description].filter(Boolean).join(' — ') || null,
      })),
    },
    {
      key: 'stance_id',
      label: 'Stance',
      helper: 'Foot and leg positioning during movement',
      options: toOptions(stances),
    },
    {
      key: 'range_depth_id',
      label: 'Range Depth',
      helper: 'Depth or range of motion specification',
      options: toOptions(depths),
    },
    {
      key: 'symmetry_id',
      label: 'Symmetry',
      helper: 'Bilateral vs unilateral loading pattern',
      options: toOptions(symmetries),
    },
    {
      key: 'grip_orientation_id',
      label: 'Grip Orientation',
      helper: 'How the hands face (Pronated, Supinated, Neutral…)',
      options: toOptions(gripOrientations),
    },
    {
      key: 'grip_width_id',
      label: 'Grip Width',
      helper: 'Hand spacing (Close, Standard, Wide)',
      options: toOptions(gripWidths),
    },
    {
      key: 'bench_angle_id',
      label: 'Bench Angle',
      helper: 'Flat, incline or decline surface',
      options: toOptions(benchAngles),
    },
    {
      key: 'direction_id',
      label: 'Direction',
      helper: 'Direction of travel (Forward, Reverse, Lateral…)',
      options: toOptions(directions),
    },
    {
      key: 'support_position_id',
      label: 'Support Position',
      helper: 'Body support during the movement (Seated, Standing…)',
      options: toOptions(supportPositions),
    },
    {
      key: 'arm_position_id',
      label: 'Arm Position',
      helper: 'Where the arms work (Overhead, Front, Behind-the-Neck…)',
      options: toOptions(armPositions),
    },
  ];

  // The variant label picker exists only for derivations whose core HAS a
  // vocabulary — hidden for cores/outliers and for cores without labels (G4).
  const showVariantPicker =
    formData.kind === 'derivation' && !!formData.core_movement_id && variantLabels.length > 0;
  const variantOptions: AttributeOption[] = variantLabels.map((v) => ({
    id: v.id,
    name: v.name_fragment,
  }));

  const selectedName = (options: AttributeOption[], id: string | null) =>
    id ? options.find((o) => o.id === id)?.name ?? null : null;

  const openPickerConfig = openPicker
    ? openPicker === 'variant_label_id'
      ? { label: 'Variant Label', options: variantOptions }
      : (() => {
          const p = pickers.find((x) => x.key === openPicker)!;
          return { label: p.label, options: p.options };
        })()
    : null;

  return (
    <View style={styles.container}>
      {/* Equipment */}
      <View style={styles.field}>
        <Text style={styles.label}>Equipment</Text>
        <Text style={styles.helperText}>
          {formData.equipment_ids.length > 0
            ? formData.equipment_ids.length <= 2
              ? equipment
                  .filter(e => formData.equipment_ids.includes(e.id))
                  .map(e => e.name)
                  .join(', ')
              : `${formData.equipment_ids.length} items selected`
            : 'Select all equipment used for this movement'}
        </Text>

        {categoryOrder.map(category => {
          const items = equipmentByCategory[category] || [];
          if (items.length === 0) return null;

          return (
            <View key={category}>
              <Text style={styles.sectionHeader}>{category}</Text>
              <View style={styles.pillsContainer}>
                {items.map(item => {
                  const isSelected = formData.equipment_ids.includes(item.id);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.pill, isSelected && styles.pillSelected]}
                      onPress={() => toggleEquipment(item.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.separator} />

      {/* Identity attribute pickers — one FK column each, so one choice each */}
      <View style={styles.field}>
        <Text style={styles.label}>Identity Attributes</Text>
        <Text style={styles.helperText}>
          The attributes that define this variation — they drive the generated
          name and the duplicate check
        </Text>
        <View style={styles.pickerList}>
          {pickers.map(({ key, label, options }) => {
            const value = selectedName(options, formData[key]);
            return (
              <TouchableOpacity
                key={key}
                style={styles.pickerRow}
                onPress={() => setOpenPicker(key)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${value ?? 'none'}`}
              >
                <Text style={styles.pickerLabel}>{label}</Text>
                <View style={styles.pickerValueWrap}>
                  <Text style={[styles.pickerValue, !value && styles.pickerValueEmpty]} numberOfLines={1}>
                    {value ?? 'None'}
                  </Text>
                  <ChevronRight size={18} color={colors.mutedForeground} />
                </View>
              </TouchableOpacity>
            );
          })}

          {showVariantPicker && (
            <TouchableOpacity
              style={styles.pickerRow}
              onPress={() => setOpenPicker('variant_label_id')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Variant Label: ${selectedName(variantOptions, formData.variant_label_id) ?? 'none'}`}
            >
              <Text style={styles.pickerLabel}>Variant Label</Text>
              <View style={styles.pickerValueWrap}>
                <Text
                  style={[
                    styles.pickerValue,
                    !formData.variant_label_id && styles.pickerValueEmpty,
                  ]}
                  numberOfLines={1}
                >
                  {selectedName(variantOptions, formData.variant_label_id) ?? 'None'}
                </Text>
                <ChevronRight size={18} color={colors.mutedForeground} />
              </View>
            </TouchableOpacity>
          )}
        </View>
        {showVariantPicker && (
          <Text style={styles.infoText}>
            Variant labels come from {formData.core_movement_name}'s own vocabulary.
          </Text>
        )}
      </View>

      <View style={styles.separator} />

      {/* Movement Style (identity styles) */}
      <View style={styles.field}>
        <Text style={styles.label}>Movement Style</Text>
        <Text style={styles.helperText}>
          Execution variations that make a distinct movement (Strict, Kipping,
          Weighted…)
        </Text>

        {['Execution Control', 'Dynamic Power', 'Assistance / Load Variant'].map(category => {
          const categoryStyles = identityStyles.filter(s => s.category === category);
          if (categoryStyles.length === 0) return null;

          return (
            <View key={category}>
              <Text style={styles.sectionHeader}>{category}</Text>
              <View style={styles.pillsContainer}>
                {categoryStyles.map(style => {
                  const isSelected = formData.movement_style_ids.includes(style.id);
                  return (
                    <TouchableOpacity
                      key={style.id}
                      style={[styles.pill, isSelected && styles.pillSelected]}
                      onPress={() => toggleMovementStyle(style.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                        {style.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>

      {/* One sheet instance serves whichever row was tapped. */}
      <AttributePickerSheet
        visible={openPicker !== null}
        title={openPickerConfig?.label ?? ''}
        options={openPickerConfig?.options ?? []}
        selectedId={openPicker ? formData[openPicker] : null}
        onSelect={(id) => {
          if (openPicker) updateFormData({ [openPicker]: id } as Partial<WizardFormData>);
        }}
        onClose={() => setOpenPicker(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.mutedForeground,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  helperText: {
    fontSize: 14,
    color: '#94A3B8', // Lighter gray for better visibility
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.mutedForeground,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderColor: '#334155', // Lighter border for visibility
  },
  pillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#F9FAFB', // Explicit white for visibility
  },
  pillTextSelected: {
    color: '#FFFFFF',
  },
  pickerList: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    overflow: 'hidden',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.foreground,
  },
  pickerValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  pickerValue: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: '500',
    flexShrink: 1,
  },
  pickerValueEmpty: {
    color: colors.mutedForeground,
    fontWeight: '400',
  },
  infoText: {
    fontSize: 12,
    color: colors.mutedForeground,
    fontStyle: 'italic',
  },
});
