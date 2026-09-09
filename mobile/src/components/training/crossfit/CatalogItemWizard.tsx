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
  type CreateCatalogExerciseInput,
  type UpdateCatalogExercisePatch,
  type CatalogExerciseRow,
} from '@/src/lib/supabase/frontDoor';
import type { SkillLevel } from '@/src/types/crossfit';

// Step components
import { Step1Core } from './wizard/Step1Core';
import { Step2Classification } from './wizard/Step2Classification';
import { Step3Attributes } from './wizard/Step3Attributes';

export type CatalogItemKind = 'core' | 'derivation' | 'outlier';

export interface WizardFormData {
  // Step 1: identity kind + naming
  kind: CatalogItemKind;
  core_movement_id: string | null;
  core_movement_name: string; // for display in the picker
  /** Derivations default to engine naming; this toggle reveals the field. */
  use_custom_name: boolean;
  name: string;
  short_name: string;
  aliases: string[];
  description: string;
  video_url: string;
  image_url: string;

  // Step 2: classification
  modality_id: string | null;
  movement_family_id: string | null;
  goal_type_ids: string[];
  skill_level: SkillLevel | null;
  muscle_region_ids: string[];
  primary_muscle_region_ids: string[];
  scoring_type_ids: string[];

  // Step 3: identity attributes (one FK column each — single-select)
  load_position_id: string | null;
  stance_id: string | null;
  range_depth_id: string | null;
  symmetry_id: string | null;
  grip_orientation_id: string | null;
  grip_width_id: string | null;
  bench_angle_id: string | null;
  direction_id: string | null;
  support_position_id: string | null;
  arm_position_id: string | null;
  variant_label_id: string | null;
  equipment_ids: string[];
  /**
   * ALL movement styles on the row. Step 3 renders only identity styles as
   * pills; modifier styles loaded by an edit ride along untouched so the
   * update diff never drops them.
   */
  movement_style_ids: string[];
}

const EMPTY_FORM: WizardFormData = {
  kind: 'derivation',
  core_movement_id: null,
  core_movement_name: '',
  use_custom_name: false,
  name: '',
  short_name: '',
  aliases: [],
  description: '',
  video_url: '',
  image_url: '',
  modality_id: null,
  movement_family_id: null,
  goal_type_ids: [],
  skill_level: null,
  muscle_region_ids: [],
  primary_muscle_region_ids: [],
  scoring_type_ids: [],
  load_position_id: null,
  stance_id: null,
  range_depth_id: null,
  symmetry_id: null,
  grip_orientation_id: null,
  grip_width_id: null,
  bench_angle_id: null,
  direction_id: null,
  support_position_id: null,
  arm_position_id: null,
  variant_label_id: null,
  equipment_ids: [],
  movement_style_ids: [],
};

interface CatalogItemWizardProps {
  /** The only preset that separates the two tabs. Not editable on a row. */
  isMovement: boolean;
  /** Pass to edit an existing row: pre-fills and saves through update. */
  editId?: string;
  onClose: () => void;
  onSave: () => void;
}

const STEPS = [
  { number: 1, title: 'Details', required: true },
  { number: 2, title: 'Classification', required: true },
  { number: 3, title: 'Attributes', required: false },
];

export function CatalogItemWizard({ isMovement, editId, onClose, onSave }: CatalogItemWizardProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<WizardFormData>(EMPTY_FORM);
  const [loadingEdit, setLoadingEdit] = useState(!!editId);
  const [saving, setSaving] = useState(false);
  /** Original name_is_custom of the row being edited (drives clear_custom_name). */
  const [editWasCustomNamed, setEditWasCustomNamed] = useState(false);
  const [duplicate, setDuplicate] = useState<CatalogExerciseRow | null>(null);

  const noun = isMovement ? 'Movement' : 'Exercise';
  const isEdit = !!editId;

  useEffect(() => {
    if (editId) loadForEdit(editId);
  }, [editId]);

  const loadForEdit = async (id: string) => {
    try {
      setLoadingEdit(true);
      const detail = await fetchCatalogExerciseDetail(id);
      const kind: CatalogItemKind = detail.is_core
        ? 'core'
        : detail.core_movement_id
          ? 'derivation'
          : 'outlier';
      let coreName = '';
      if (kind === 'derivation' && detail.core_movement_id) {
        const { data } = await supabase
          .from('exercises')
          .select('name')
          .eq('id', detail.core_movement_id)
          .maybeSingle();
        coreName = (data as { name: string } | null)?.name ?? '';
      }
      setEditWasCustomNamed(detail.name_is_custom);
      setFormData({
        kind,
        core_movement_id: kind === 'derivation' ? detail.core_movement_id : null,
        core_movement_name: coreName,
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
    if (currentStep === 2) {
      return (
        formData.modality_id !== null &&
        formData.movement_family_id !== null &&
        formData.goal_type_ids.length > 0
      );
    }
    return true; // Step 3 is optional
  };

  const canSave = () => {
    if (!step1Complete()) return false;
    if (formData.modality_id === null) return false;
    if (formData.movement_family_id === null) return false;
    if (formData.goal_type_ids.length === 0) return false;
    return true;
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

  /** Everything create and update share, straight from the form. */
  const sharedFields = () => ({
    core_movement_id: formData.kind === 'derivation' ? formData.core_movement_id : null,
    load_position_id: formData.load_position_id,
    stance_id: formData.stance_id,
    range_depth_id: formData.range_depth_id,
    symmetry_id: formData.symmetry_id,
    grip_orientation_id: formData.grip_orientation_id,
    grip_width_id: formData.grip_width_id,
    bench_angle_id: formData.bench_angle_id,
    direction_id: formData.direction_id,
    support_position_id: formData.support_position_id,
    arm_position_id: formData.arm_position_id,
    // G4: only ever a picker choice from the core's own vocabulary.
    variant_label_id: formData.kind === 'derivation' ? formData.variant_label_id : null,
    equipment_ids: formData.equipment_ids,
    movement_style_ids: formData.movement_style_ids,
    scoring_type_ids: formData.scoring_type_ids,
    goal_type_ids: formData.goal_type_ids,
    primary_muscle_region_ids: formData.primary_muscle_region_ids,
    secondary_muscle_region_ids: formData.muscle_region_ids.filter(
      (m) => !formData.primary_muscle_region_ids.includes(m),
    ),
    movement_family_id: formData.movement_family_id,
    movement_category_id: formData.modality_id,
    skill_level: formData.skill_level,
    short_name: formData.short_name.trim() || null,
    description: formData.description.trim() || null,
    video_url: formData.video_url.trim() || null,
    image_url: formData.image_url.trim() || null,
  });

  const wantsCustomName = formData.kind !== 'derivation' || formData.use_custom_name;

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (isEdit && editId) {
        const patch: UpdateCatalogExercisePatch = { ...sharedFields() };
        if (formData.kind === 'core') {
          // A core self-references by trigger; the patch must not touch it.
          delete patch.core_movement_id;
        }
        if (wantsCustomName) {
          patch.name = formData.name.trim();
        } else if (editWasCustomNamed) {
          // Custom naming switched OFF: hand the name back to the engine.
          patch.clear_custom_name = true;
        }
        await updateCatalogExercise(editId, patch);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          Alert.alert('Error', `You must be logged in to create ${isMovement ? 'a movement' : 'an exercise'}`);
          return;
        }
        const input: CreateCatalogExerciseInput = {
          ...sharedFields(),
          name: wantsCustomName ? formData.name.trim() : null,
          is_core: formData.kind === 'core',
          is_movement: isMovement,
          created_by: user.id,
        };
        const row = await createCatalogExercise(input);
        if (formData.aliases.length > 0) {
          // Aliases are a side dish: the row exists either way, so a failed
          // alias write is logged, never fatal to the save.
          try {
            await addWildAliases(row.id, formData.aliases);
          } catch (aliasError) {
            console.error('Error writing aliases:', aliasError);
          }
        }
      }

      Alert.alert('Success', `${noun} ${isEdit ? 'updated' : 'created'} successfully!`, [
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

  const openDuplicate = () => {
    const existing = duplicate;
    setDuplicate(null);
    onClose();
    if (existing) {
      const base = isMovement ? '/(tabs)/training/movement' : '/(tabs)/training/exercise';
      router.push(`${base}/${existing.id}`);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1Core
            formData={formData}
            updateFormData={updateFormData}
            entityType={isMovement ? 'movement' : 'exercise'}
            isEdit={isEdit}
          />
        );
      case 2:
        return <Step2Classification formData={formData} updateFormData={updateFormData} />;
      case 3:
        return <Step3Attributes formData={formData} updateFormData={updateFormData} />;
      default:
        return null;
    }
  };

  const currentStepInfo = STEPS[currentStep - 1];
  const isLastStep = currentStep === STEPS.length;
  const isFirstStep = currentStep === 1;

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
        {loadingEdit ? (
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
