// Step 1: what IS this row — a core, a derivation of a core, or an outlier.
//
// Derivations are engine-named by default: the name is generated from the
// chosen core plus the Step 3 attributes, so the field only appears when
// "use a custom name" is switched on. Cores and outliers always need a name
// (the engine has nothing to derive one from).
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Switch } from 'react-native';
import { X } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import type { WizardFormData, CatalogItemKind } from '../CatalogItemWizard';
import { ParentMovementSearch, type CoreMovementOption } from '../ParentMovementSearch';

interface Step1CoreProps {
  formData: WizardFormData;
  updateFormData: (updates: Partial<WizardFormData>) => void;
  entityType?: 'movement' | 'exercise'; // Controls all labels
  /** Editing an existing row: the kind of a CORE row is locked (demotion is curation tooling). */
  isEdit?: boolean;
  /**
   * The wizard's ONE inheritance trigger: fired only when the user picks or
   * changes the core here — never by prefill or step remounts.
   */
  onCorePicked: (core: CoreMovementOption) => void;
  onCoreCleared: () => void;
  /** Once the user hand-edits Short Name, typing a name stops regenerating it. */
  shortNameTouched: boolean;
  onShortNameTouched: () => void;
}

const KIND_SEGMENTS: { kind: CatalogItemKind; label: string }[] = [
  { kind: 'core', label: 'Core' },
  { kind: 'derivation', label: 'Derivation' },
  { kind: 'outlier', label: 'Outlier' },
];

export function Step1Core({
  formData,
  updateFormData,
  entityType = 'movement',
  isEdit = false,
  onCorePicked,
  onCoreCleared,
  shortNameTouched,
  onShortNameTouched,
}: Step1CoreProps) {
  const isExercise = entityType === 'exercise';
  const entityName = isExercise ? 'Exercise' : 'Movement';
  const entityNameLower = isExercise ? 'exercise' : 'movement';
  const [aliasInput, setAliasInput] = useState('');

  // A core row stays a core; a non-core row can move between derivation and
  // outlier but cannot be promoted here.
  const kindLocked = isEdit && formData.kind === 'core';
  const selectableKinds = kindLocked
    ? KIND_SEGMENTS.filter((s) => s.kind === 'core')
    : isEdit
      ? KIND_SEGMENTS.filter((s) => s.kind !== 'core')
      : KIND_SEGMENTS;

  const handleKindChange = (kind: CatalogItemKind) => {
    if (kind === formData.kind) return;
    const updates: Partial<WizardFormData> = { kind };
    if (kind !== 'derivation') {
      updates.core_movement_id = null;
      updates.core_movement_name = '';
      updates.variant_label_id = null;
      updates.use_custom_name = true; // cores and outliers always carry a name
    } else {
      updates.use_custom_name = false; // derivations default to engine naming
    }
    updateFormData(updates);
  };

  const addAlias = () => {
    const trimmed = aliasInput.trim();
    if (trimmed && !formData.aliases.includes(trimmed)) {
      updateFormData({ aliases: [...formData.aliases, trimmed] });
      setAliasInput('');
    }
  };

  const kindHelp: Record<CatalogItemKind, string> = {
    core: `A base ${entityNameLower} other ${entityNameLower}s derive from (Squat, Bench Press…).`,
    derivation: `A variation of a core ${entityNameLower}, defined by its attributes — the catalog names and ranks it for you.`,
    outlier: `Stands alone: not a core and not derived from one (no generated name or tier).`,
  };

  const showNameField = formData.kind !== 'derivation' || formData.use_custom_name;

  return (
    <View style={styles.container}>
      {/* Kind Segmented Control */}
      <View style={styles.field}>
        <Text style={styles.label}>{entityName} Type</Text>
        <Text style={styles.helperText}>{kindHelp[formData.kind]}</Text>
        <View style={styles.segmentedControl}>
          {selectableKinds.map(({ kind, label }) => {
            const active = formData.kind === kind;
            return (
              <TouchableOpacity
                key={kind}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => handleKindChange(kind)}
                activeOpacity={0.7}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {kindLocked && (
          <Text style={styles.lockedText}>
            A core {entityNameLower} keeps its role — derivations depend on it.
          </Text>
        )}
      </View>

      <View style={styles.separator} />

      {/* Core picker (derivations only) */}
      {formData.kind === 'derivation' && (
        <>
          <ParentMovementSearch
            onSelect={onCorePicked}
            selectedMovement={
              formData.core_movement_id
                ? { id: formData.core_movement_id, name: formData.core_movement_name }
                : null
            }
            onClear={onCoreCleared}
            labelText={`Core ${entityName}`}
            helperText={`Search for the core ${entityNameLower} this derivation is based on`}
            placeholder={`Search core ${entityNameLower}s...`}
            emptyText={`No core ${entityNameLower}s found`}
          />
          <View style={styles.separator} />
        </>
      )}

      {/* Name — generated for derivations unless custom naming is on */}
      <View style={styles.field}>
        {formData.kind === 'derivation' ? (
          <>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Name</Text>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Use custom name</Text>
                <Switch
                  value={formData.use_custom_name}
                  onValueChange={(value) => updateFormData({ use_custom_name: value })}
                  trackColor={{ false: colors.muted, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>
            {!formData.use_custom_name && (
              <View style={styles.generatedNameHint}>
                <Text style={styles.generatedNameHintText}>
                  {formData.core_movement_name
                    ? `Named automatically from its attributes — e.g. “Incline ${formData.core_movement_name}”.`
                    : 'Named automatically from the core and the attributes you pick in step 3.'}
                </Text>
              </View>
            )}
          </>
        ) : (
          <Text style={styles.label}>
            {entityName} Name <Text style={styles.required}>*</Text>
          </Text>
        )}
        {showNameField && (
          <TextInput
            style={styles.input}
            placeholder="e.g., Pike Walk, Box Jump, etc."
            placeholderTextColor={colors.mutedForeground}
            value={formData.name}
            onChangeText={text => {
              if (shortNameTouched) {
                updateFormData({ name: text });
                return;
              }
              // Generate abbreviation from first letter of each word — only
              // until the user hand-edits Short Name (and never on edit,
              // where the stored short name marks itself touched).
              const abbreviation = text
                .split(' ')
                .map(word => word.charAt(0))
                .join('')
                .toUpperCase();
              updateFormData({ name: text, short_name: abbreviation });
            }}
            autoCapitalize="words"
          />
        )}
      </View>

      <View style={styles.separator} />

      {/* Short Name */}
      <View style={styles.field}>
        <Text style={styles.label}>Short Name</Text>
        <Text style={styles.helperText}>
          Abbreviated name for UI display
        </Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., C2B, T2B, HSPU"
          placeholderTextColor={colors.mutedForeground}
          value={formData.short_name}
          onChangeText={text => {
            onShortNameTouched();
            updateFormData({ short_name: text });
          }}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.separator} />

      {/* Aliases — create only: they append to the alias table on save */}
      {!isEdit && (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Aliases</Text>
            <Text style={styles.helperText}>
              Alternative names for search (e.g., "C2B" for "Chest-to-Bar Pull-up")
            </Text>
            <View style={styles.aliasInputContainer}>
              <TextInput
                style={styles.aliasInput}
                placeholder="Type an alias and press Add"
                placeholderTextColor={colors.mutedForeground}
                value={aliasInput}
                onChangeText={setAliasInput}
                onSubmitEditing={addAlias}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={addAlias} style={styles.addButton}>
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
            {formData.aliases.length > 0 && (
              <View style={styles.tagsContainer}>
                {formData.aliases.map(alias => (
                  <View key={alias} style={styles.tag}>
                    <Text style={styles.tagText}>{alias}</Text>
                    <TouchableOpacity
                      onPress={() => updateFormData({ aliases: formData.aliases.filter(a => a !== alias) })}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <X size={14} color={colors.foreground} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.separator} />
        </>
      )}

      {/* Description */}
      <View style={styles.field}>
        <Text style={styles.label}>Description</Text>
        <Text style={styles.helperText}>
          {entityName} description, coaching cues, or standards
        </Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder={`Add notes, coaching cues, or ${entityNameLower} standards...`}
          placeholderTextColor={colors.mutedForeground}
          value={formData.description}
          onChangeText={text => updateFormData({ description: text })}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      <View style={styles.separator} />

      {/* Video URL */}
      <View style={styles.field}>
        <Text style={styles.label}>Video URL</Text>
        <Text style={styles.helperText}>
          Link to demonstration video (YouTube, Vimeo, etc.)
        </Text>
        <TextInput
          style={styles.input}
          placeholder="https://youtube.com/..."
          placeholderTextColor={colors.mutedForeground}
          value={formData.video_url}
          onChangeText={text => updateFormData({ video_url: text })}
          autoCapitalize="none"
          keyboardType="url"
        />
      </View>

      <View style={styles.separator} />

      {/* Image URL */}
      <View style={styles.field}>
        <Text style={styles.label}>Image URL</Text>
        <Text style={styles.helperText}>
          Link to a photo or thumbnail (or generate one later on the detail page)
        </Text>
        <TextInput
          style={styles.input}
          placeholder="https://..."
          placeholderTextColor={colors.mutedForeground}
          value={formData.image_url}
          onChangeText={text => updateFormData({ image_url: text })}
          autoCapitalize="none"
          keyboardType="url"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 24,
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  required: {
    color: colors.destructive,
  },
  helperText: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  lockedText: {
    fontSize: 13,
    color: colors.mutedForeground,
    fontStyle: 'italic',
  },
  generatedNameHint: {
    backgroundColor: colors.muted,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  generatedNameHintText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.foreground,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: colors.input,
  },
  textArea: {
    minHeight: 100,
  },
  aliasInputContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  aliasInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: colors.input,
  },
  addButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.muted,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagText: {
    fontSize: 14,
    color: colors.foreground,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.muted,
    borderRadius: 8,
    padding: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.mutedForeground,
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
});
