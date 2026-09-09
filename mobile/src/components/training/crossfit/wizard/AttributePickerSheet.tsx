// Single-select identity-attribute picker, as a bottom sheet.
//
// The movement model gives each identity attribute ONE FK column, so the
// control is a single choice — and house rule: pickers come up from the
// bottom as a sheet, never inline (an unfolding list shoves the rest of the
// form down the page and fights the step's own scroll).
import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Check } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';

export interface AttributeOption {
  id: string;
  name: string;
  description?: string | null;
}

interface AttributePickerSheetProps {
  visible: boolean;
  title: string;
  options: AttributeOption[];
  selectedId: string | null;
  /** null = cleared ("None"). The sheet closes itself after every choice. */
  onSelect: (id: string | null) => void;
  onClose: () => void;
}

export function AttributePickerSheet({
  visible,
  title,
  options,
  selectedId,
  onSelect,
  onClose,
}: AttributePickerSheetProps) {
  const choose = (id: string | null) => {
    onSelect(id);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
        <View style={styles.scrim} />
      </TouchableWithoutFeedback>
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={styles.title}>{title}</Text>
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            style={styles.row}
            onPress={() => choose(null)}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedId === null }}
          >
            <Text style={[styles.rowLabel, styles.noneLabel, selectedId === null && styles.rowLabelOn]}>
              None
            </Text>
            {selectedId === null && <Check size={18} color={colors.primary} />}
          </TouchableOpacity>
          {options.map((option) => {
            const selected = option.id === selectedId;
            return (
              <TouchableOpacity
                key={option.id}
                style={styles.row}
                onPress={() => choose(option.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, selected && styles.rowLabelOn]}>
                    {option.name}
                  </Text>
                  {option.description ? (
                    <Text style={styles.rowDescription} numberOfLines={2}>
                      {option.description}
                    </Text>
                  ) : null}
                </View>
                {selected && <Check size={18} color={colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
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
    paddingBottom: 32,
    gap: 12,
    maxHeight: '75%',
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.muted,
    alignSelf: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.foreground,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 16,
    color: colors.foreground,
  },
  noneLabel: {
    color: colors.mutedForeground,
    fontStyle: 'italic',
  },
  rowLabelOn: {
    fontWeight: '600',
    color: colors.primary,
  },
  rowDescription: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
});
