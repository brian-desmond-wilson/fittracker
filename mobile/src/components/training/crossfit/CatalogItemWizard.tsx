// ONE wizard for the whole catalog (Stage 5, Task 2).
//
// "Add Movement" and "Add Exercise" were copy-pasted twins whose save paths
// had drifted — the Exercise copy silently dropped muscle regions, stances,
// loads and styles through an inline insert. Both tabs now open THIS
// component; the only preset that differs is `isMovement`. Every save goes
// through the front door (createCatalogExercise / updateCatalogExercise) —
// the engine names derivations, computes tiers and parents, and rejects
// duplicates by identity.
//
// The same component IS the edit screen: pass `editId` and it pre-fills from
// the row + junctions (one fetch) and saves through the update path.
//
// Two responsibilities deliberately live HERE, not in the steps:
// - every static dictionary is fetched ONCE on mount (one parallel batch)
//   and passed down — steps render, they don't fetch;
// - core inheritance fires ONLY when Step 1 explicitly picks/changes a core.
//   An edit's prefilled core or a back-navigation remount must never
//   re-clobber Step 2 with the core's classification (payload/inheritance
//   logic itself is pure and lib-tested: src/lib/catalogWizardForm.ts).
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Alert, Modal, TouchableWithoutFeedback, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { supabase } from '@/src/lib/supabase';
import {
  createCatalogExercise,
  updateCatalogExercise,
  addWildAliases,
  fetchCatalogExerciseDetail,
  DuplicateExerciseError,
  type CatalogExerciseRow,
} from '@/src/lib/supabase/frontDoor';
import { enrichExerciseInBackground } from '@/src/lib/supabase/enrich';
import { applyPrefillToForm } from '@/src/lib/extractionPrefill';
import type { ExtractionPrefill } from '@/src/lib/extractionPrefill';
import {
  EMPTY_WIZARD_FORM,
  buildCreateInput,
  buildUpdatePatch,
  computeCoreInheritance,
  missingClassification,
  type WizardFormData,
  type CatalogItemKind,
  type OverridableInheritField,
} from '@/src/lib/catalogWizardForm';
import {
  fetchMuscleRegions,
  fetchScoringTypes,
  fetchMovementCategories,
  fetchMovementFamilies,
  fetchFamilyModalities,
  fetchGoalTypes,
  fetchEquipment,
  fetchLoadPositions,
  fetchStances,
  fetchMovementStyles,
  fetchSymmetries,
  fetchRangeDepths,
  fetchGrips,
  fetchDirections,
  fetchSupportPositions,
  fetchArmPositions,
  fetchBenchAngles,
  fetchCoreClassification,
} from '@/src/lib/supabase/crossfit';
import type {
  SkillLevel,
  MuscleRegion,
  ScoringType,
  MovementCategory,
  MovementFamily,
  FamilyModality,
  GoalType,
  Equipment,
  LoadPosition,
  Stance,
  MovementStyle,
  Symmetry,
  RangeDepth,
  Grip,
  Direction,
  SupportPosition,
  ArmPosition,
  BenchAngle,
} from '@/src/types/crossfit';

// Step components
import { Step1Core } from './wizard/Step1Core';
import { Step2Classification } from './wizard/Step2Classification';
import { Step3Attributes } from './wizard/Step3Attributes';
import type { CoreMovementOption } from './ParentMovementSearch';

// The steps import the form types through this module.
export type { WizardFormData, CatalogItemKind } from '@/src/lib/catalogWizardForm';

/** Every static dictionary the steps render — fetched once, up here. */
export interface WizardDictionaries {
  muscleRegions: MuscleRegion[];
  scoringTypes: ScoringType[];
  categories: MovementCategory[];
  families: MovementFamily[];
  familyModalities: FamilyModality[];
  goalTypes: GoalType[];
  equipment: Equipment[];
  loadPositions: LoadPosition[];
  stances: Stance[];
  movementStyles: MovementStyle[];
  symmetries: Symmetry[];
  rangeDepths: RangeDepth[];
  grips: Grip[];
  directions: Direction[];
  supportPositions: SupportPosition[];
  armPositions: ArmPosition[];
  benchAngles: BenchAngle[];
}

interface CatalogItemWizardProps {
  /** The only preset that separates the two tabs. Not editable on a row. */
  isMovement: boolean;
  /** Pass to edit an existing row: pre-fills and saves through update. */
  editId?: string;
  /** Seed the name field (custom naming on) — the match-review queue opens
   *  the wizard with the captured name so "create new" starts filled in. */
  initialName?: string;
  /** Values read from the capture extraction (description, muscles,
   *  equipment, skill level) laid onto the form once the dictionaries have
   *  loaded. Create only; ignored with editId. */
  initialPrefill?: ExtractionPrefill | null;
  onClose: () => void;
  onSave: () => void;
  /** Fired with the created row right after a successful create — what lets
   *  a caller (the review queue) link the new exercise by id. Never fired on
   *  edit. */
  onCreated?: (row: CatalogExerciseRow) => void;
}

const STEPS = [
  { number: 1, title: 'Details', required: true },
  { number: 2, title: 'Classification', required: true },
  { number: 3, title: 'Attributes', required: false },
];

export function CatalogItemWizard({
  isMovement, editId, initialName, initialPrefill, onClose, onSave, onCreated,
}: CatalogItemWizardProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<WizardFormData>(() =>
    initialName && !editId
      ? { ...EMPTY_WIZARD_FORM, name: initialName, use_custom_name: true }
      : EMPTY_WIZARD_FORM,
  );
  const [dictionaries, setDictionaries] = useState<WizardDictionaries | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(!!editId);
  const [saving, setSaving] = useState(false);
  /** Original name_is_custom of the row being edited (drives clear_custom_name). */
  const [editWasCustomNamed, setEditWasCustomNamed] = useState(false);
  /** Once the user hand-edits Short Name, the name field stops regenerating it. */
  const [shortNameTouched, setShortNameTouched] = useState(false);
  const [duplicate, setDuplicate] = useState<CatalogExerciseRow | null>(null);
  // Inheritance bookkeeping lives at wizard level: it must survive step
  // remounts (back navigation) — per-step-mount state re-ran the clobber.
  const [inheritedFields, setInheritedFields] = useState<Set<string>>(new Set());
  const [overriddenFields, setOverriddenFields] = useState<Set<OverridableInheritField>>(
    new Set(),
  );

  const noun = isMovement ? 'Movement' : 'Exercise';
  const isEdit = !!editId;

  useEffect(() => {
    loadDictionaries();
  }, []);

  useEffect(() => {
    if (editId) loadForEdit(editId);
  }, [editId]);

  // Leaving 'derivation' drops the inheritance badges (values stay put).
  useEffect(() => {
    if (formData.kind !== 'derivation') setInheritedFields(new Set());
  }, [formData.kind]);

  const loadDictionaries = async () => {
    try {
      const [
        muscleRegions, scoringTypes, categories, families, familyModalities, goalTypes,
        equipment, loadPositions, stances, movementStyles, symmetries, rangeDepths,
        grips, directions, supportPositions, armPositions, benchAngles,
      ] = await Promise.all([
        fetchMuscleRegions(), fetchScoringTypes(), fetchMovementCategories(),
        fetchMovementFamilies(), fetchFamilyModalities(), fetchGoalTypes(),
        fetchEquipment(), fetchLoadPositions(), fetchStances(), fetchMovementStyles(),
        fetchSymmetries(), fetchRangeDepths(), fetchGrips(), fetchDirections(),
        fetchSupportPositions(), fetchArmPositions(), fetchBenchAngles(),
      ]);
      setDictionaries({
        muscleRegions, scoringTypes, categories, families, familyModalities, goalTypes,
        equipment, loadPositions, stances, movementStyles, symmetries, rangeDepths,
        grips, directions, supportPositions, armPositions, benchAngles,
      });
      // The prefill needs ids for the extraction's names, so it waits for
      // the dictionaries. Only empty fields are filled (applyPrefillToForm).
      if (initialPrefill && !editId) {
        setFormData((prev) => applyPrefillToForm(prev, initialPrefill, {
          muscleRegions: muscleRegions.map((m) => ({ id: m.id, name: m.name })),
          equipment: equipment.map((e) => ({ id: e.id, name: e.name })),
        }));
      }
    } catch (error) {
      console.error('Error loading wizard dictionaries:', error);
      Alert.alert('Could not load the catalog dictionaries', undefined, [
        { text: 'OK', onPress: onClose },
      ]);
    }
  };

  const loadForEdit = async (id: string) => {
    try {
      setLoadingEdit(true);
      const detail = await fetchCatalogExerciseDetail(id);
      const kind: CatalogItemKind = detail.is_core
        ? 'core'
        : detail.core_movement_id
          ? 'derivation'
          : 'outlier';
      setEditWasCustomNamed(detail.name_is_custom);
      setShortNameTouched(true); // never regenerate a stored short name
      setFormData({
        kind,
        core_movement_id: kind === 'derivation' ? detail.core_movement_id : null,
        core_movement_name: detail.core_movement_name ?? '',
        use_custom_name: kind !== 'derivation' || detail.name_is_custom,
        name: detail.name,
        short_name: detail.short_name ?? '',
        aliases: [], // wild aliases are append-only from the create flow
        description: detail.description ?? '',
        video_url: detail.video_url ?? '',
        image_url: detail.image_url ?? '',
        modality_id: detail.movement_category_id,
        movement_family_id: detail.movement_family_id,
        goal_type_ids: detail.goal_type_ids,
        skill_level: (detail.skill_level as SkillLevel | null) ?? null,
        muscle_region_ids: [
          ...detail.primary_muscle_region_ids,
          ...detail.secondary_muscle_region_ids,
        ],
        primary_muscle_region_ids: detail.primary_muscle_region_ids,
        scoring_type_ids: detail.scoring_type_ids,
        load_position_id: detail.load_position_id ?? null,
        stance_id: detail.stance_id ?? null,
        range_depth_id: detail.range_depth_id ?? null,
        symmetry_id: detail.symmetry_id ?? null,
        grip_orientation_id: detail.grip_orientation_id ?? null,
        grip_width_id: detail.grip_width_id ?? null,
        bench_angle_id: detail.bench_angle_id ?? null,
        direction_id: detail.direction_id ?? null,
        support_position_id: detail.support_position_id ?? null,
        arm_position_id: detail.arm_position_id ?? null,
        variant_label_id: detail.variant_label_id ?? null,
        equipment_ids: detail.equipment_ids,
        movement_style_ids: detail.movement_style_ids,
      });
      // NOTE deliberately NO inheritance here: an edit shows the row as saved.
    } catch (error) {
      console.error('Error loading exercise for edit:', error);
      Alert.alert(`Could not load this ${noun.toLowerCase()}`, undefined, [
        { text: 'OK', onPress: onClose },
      ]);
    } finally {
      setLoadingEdit(false);
    }
  };

  const updateFormData = (updates: Partial<WizardFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  /**
   * The ONE inheritance trigger: Step 1 explicitly picked (or changed) the
   * core. Never fired by prefill or step remounts.
   */
  const handleCorePicked = async (core: CoreMovementOption) => {
    updateFormData({
      core_movement_id: core.id,
      core_movement_name: core.name,
      variant_label_id: null, // the vocabulary is core-scoped: reset on change
    });
    try {
      const classification = await fetchCoreClassification(core.id);
      if (!classification) return;
      const { updates, inherited } = computeCoreInheritance(classification, overriddenFields);
      updateFormData(updates);
      setInheritedFields(new Set(inherited));
    } catch (error) {
      console.error('Error inheriting core classification:', error);
    }
  };

  const handleCoreCleared = () => {
    updateFormData({ core_movement_id: null, core_movement_name: '', variant_label_id: null });
    setInheritedFields(new Set());
  };

  const handleOverride = (field: OverridableInheritField) => {
    setOverriddenFields(prev => new Set(prev).add(field));
    setInheritedFields(prev => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  };

  /** Step-1 truth: a core/outlier needs a name; a derivation needs a core
   *  (and a name only when custom naming is on — the engine names the rest). */
  const step1Complete = () => {
    if (formData.kind === 'derivation') {
      if (!formData.core_movement_id) return false;
      if (formData.use_custom_name && !formData.name.trim()) return false;
      return true;
    }
    return formData.name.trim().length > 0;
  };

  const canProceed = () => {
    if (currentStep === 1) return step1Complete();
    if (currentStep === 2) return missingClassification(formData).length === 0;
    return true; // Step 3 is optional
  };

  const canSave = () => {
    if (!step1Complete()) return false;
    return missingClassification(formData).length === 0;
  };

  const handleNext = () => {
    if (currentStep < STEPS.length) setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSkip = () => {
    if (currentStep < STEPS.length) setCurrentStep(currentStep + 1);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      let failedAliases: string[] = [];
      let savedName: string | null = null;
      if (isEdit && editId) {
        const updated = await updateCatalogExercise(editId, buildUpdatePatch(formData, editWasCustomNamed));
        savedName = updated?.name ?? null;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          Alert.alert('Error', `You must be logged in to create ${isMovement ? 'a movement' : 'an exercise'}`);
          return;
        }
        const row = await createCatalogExercise(buildCreateInput(formData, isMovement, user.id));
        savedName = row?.name ?? null;
        onCreated?.(row);
        // A new exercise should arrive with a description, a demo video and
        // a picture. Fire-and-forget: the row exists either way, and the
        // page picks the fills up on its next open.
        enrichExerciseInBackground(row.id);
        if (formData.aliases.length > 0) {
          // Aliases are a side dish: the row exists either way. Every alias
          // is attempted; the misses are reported, never fatal to the save.
          const result = await addWildAliases(row.id, formData.aliases);
          failedAliases = result.failed;
        }
      }

      // Lead with the engine's naming decision — it's the headline of the
      // save, not an implementation detail (on-device exit-gate feedback).
      const baseMessage = savedName
        ? `${isEdit ? 'Saved as' : 'Created as'} “${savedName}”`
        : `${noun} ${isEdit ? 'updated' : 'created'} successfully!`;
      const message =
        failedAliases.length > 0
          ? `${baseMessage}\nCreated, but ${failedAliases.length} alias(es) could not be saved: ${failedAliases.join(', ')}`
          : baseMessage;
      Alert.alert('Success', message, [
        {
          text: 'OK',
          onPress: () => {
            onSave();
            onClose();
          },
        },
      ]);
    } catch (error) {
      if (error instanceof DuplicateExerciseError) {
        setDuplicate(error.existing);
      } else {
        console.error(`Error saving ${noun.toLowerCase()}:`, error);
        const message =
          error instanceof Error ? error.message : `Failed to save ${noun.toLowerCase()}. Please try again.`;
        Alert.alert('Could not save', message);
      }
    } finally {
      setSaving(false);
    }
  };

  // Dismissing the sheet, the full-screen wizard modal, and pushing a route
  // must happen in SEQUENCE on iOS — tearing down nested modals in the same
  // tick wedges the presentation layer (blank black screen). The tap only
  // stores the intent and closes the sheet; the sheet's onDismiss (fired by
  // iOS once it is fully gone) closes the wizard and then navigates.
  const pendingOpenRef = React.useRef<CatalogExerciseRow | null>(null);

  const openDuplicate = () => {
    pendingOpenRef.current = duplicate;
    setDuplicate(null);
  };

  const handleDuplicateSheetDismiss = () => {
    const existing = pendingOpenRef.current;
    if (!existing) return;
    pendingOpenRef.current = null;
    onClose();
    // Route by what the EXISTING row is, not by this wizard's preset.
    const base = existing.is_movement
      ? '/(tabs)/training/movement'
      : '/(tabs)/training/exercise';
    setTimeout(() => router.push(`${base}/${existing.id}`), 350);
  };

  const renderStep = () => {
    if (!dictionaries) return null;
    switch (currentStep) {
      case 1:
        return (
          <Step1Core
            formData={formData}
            updateFormData={updateFormData}
            entityType={isMovement ? 'movement' : 'exercise'}
            isEdit={isEdit}
            onCorePicked={handleCorePicked}
            onCoreCleared={handleCoreCleared}
            shortNameTouched={shortNameTouched}
            onShortNameTouched={() => setShortNameTouched(true)}
          />
        );
      case 2:
        return (
          <Step2Classification
            formData={formData}
            updateFormData={updateFormData}
            dictionaries={dictionaries}
            inheritedFields={inheritedFields}
            overriddenFields={overriddenFields}
            onOverride={handleOverride}
          />
        );
      case 3:
        return (
          <Step3Attributes
            formData={formData}
            updateFormData={updateFormData}
            dictionaries={dictionaries}
          />
        );
      default:
        return null;
    }
  };

  const currentStepInfo = STEPS[currentStep - 1];
  const isLastStep = currentStep === STEPS.length;
  const isFirstStep = currentStep === 1;
  const loading = loadingEdit || !dictionaries;

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.headerButtonText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEdit ? `Edit ${noun}` : `Add ${noun}`}</Text>
          <View style={styles.headerButton} />
        </View>

        {/* Progress Indicator */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            {STEPS.map((step) => (
              <View
                key={step.number}
                style={[
                  styles.progressDot,
                  currentStep >= step.number && styles.progressDotActive,
                  currentStep === step.number && styles.progressDotCurrent,
                ]}
              />
            ))}
          </View>
          <Text style={styles.stepTitle}>
            Step {currentStep} of {STEPS.length}: {currentStepInfo.title}
          </Text>
        </View>

        {/* Step Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {renderStep()}
          </ScrollView>
        )}

        {/* Footer Navigation */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.footerButtons}>
            {!isFirstStep && (
              <TouchableOpacity onPress={handleBack} style={styles.secondaryButton}>
                <ChevronLeft size={20} color={colors.primary} />
                <Text style={styles.secondaryButtonText}>Back</Text>
              </TouchableOpacity>
            )}

            {!isFirstStep && !isLastStep && (
              <TouchableOpacity onPress={handleSkip} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Skip</Text>
              </TouchableOpacity>
            )}

            {isLastStep ? (
              <TouchableOpacity
                onPress={handleSave}
                style={[styles.primaryButton, (!canSave() || saving) && styles.primaryButtonDisabled]}
                disabled={!canSave() || saving}
              >
                <Text style={styles.primaryButtonText}>
                  {saving ? 'Saving…' : isEdit ? 'Save Changes' : `Save ${noun}`}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleNext}
                style={[styles.primaryButton, !canProceed() && styles.primaryButtonDisabled]}
                disabled={!canProceed()}
              >
                <Text style={styles.primaryButtonText}>Next</Text>
                <ChevronRight size={20} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Already exists: the identity (core + attributes) is already taken. */}
      <Modal
        visible={duplicate !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setDuplicate(null)}
        onDismiss={handleDuplicateSheetDismiss}
      >
        <TouchableWithoutFeedback onPress={() => setDuplicate(null)}>
          <View style={styles.sheetScrim} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.sheetGrabber} />
          <Text style={styles.sheetTitle}>Already exists</Text>
          <Text style={styles.sheetBody}>
            {duplicate
              ? `An identical ${noun.toLowerCase()} is already in the catalog: “${duplicate.name}”. The same core and attributes always mean the same ${noun.toLowerCase()}.`
              : `An identical ${noun.toLowerCase()} is already in the catalog. The same core and attributes always mean the same ${noun.toLowerCase()}.`}
          </Text>
          {duplicate && (
            <TouchableOpacity style={styles.sheetPrimaryButton} onPress={openDuplicate} activeOpacity={0.8}>
              <Text style={styles.sheetPrimaryButtonText}>Open “{duplicate.name}”</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.sheetSecondaryButton}
            onPress={() => setDuplicate(null)}
            activeOpacity={0.8}
          >
            <Text style={styles.sheetSecondaryButtonText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 80,
  },
  headerButtonText: {
    fontSize: 17,
    color: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  progressDot: {
    flex: 1,
    height: 4,
    backgroundColor: colors.muted,
    marginHorizontal: 2,
    borderRadius: 2,
  },
  progressDotActive: {
    backgroundColor: colors.primary,
  },
  progressDotCurrent: {
    backgroundColor: colors.primary,
    opacity: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
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
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  footerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    gap: 8,
    flex: 1,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 4,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.primary,
  },
  sheetScrim: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    padding: 20,
    gap: 12,
  },
  sheetGrabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.muted,
    alignSelf: 'center',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
  },
  sheetBody: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.mutedForeground,
  },
  sheetPrimaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  sheetPrimaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  sheetSecondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  sheetSecondaryButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.primary,
  },
});
