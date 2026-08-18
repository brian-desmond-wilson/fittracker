// "Save yesterday's shake" — the retroactive half of the keep switch.
//
// The log sheet asks its source question inline, at the moment of logging.
// This modal asks the same question later, from the log editor, about a log
// that already exists. Same fields, same fallbacks, same suggestions —
// `MealSourceFields` — wrapped in the promotion shelf's card-over-scrim
// presentation, because both are the identical decision made after the fact.
import React, { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { Button, Card } from "@/src/components/ui";
import type { MealSourceKind } from "@/src/lib/mealLibraryView";
import type { SourceSuggestion } from "@/src/lib/supabase/mealLibrary";
import type { MealLog } from "@/src/types/track";
import { MealSourceFields, resolveSourceName } from "./MealSourceFields";

interface KeepLogModalProps {
  /** The log being kept, or null when closed. */
  log: MealLog | null;
  suggestions: SourceSuggestion[];
  saving: boolean;
  onClose: () => void;
  onSave: (
    log: MealLog,
    source: { kind: MealSourceKind; name: string | null },
  ) => void;
}

export function KeepLogModal({ log, suggestions, saving, onClose, onSave }: KeepLogModalProps) {
  const [sourceKind, setSourceKind] = useState<MealSourceKind>("out");
  const [sourceName, setSourceName] = useState("");

  // Fresh form per log — "out" first for the same reason the log sheet leads
  // with it: the thing being kept late is usually the thing bought on impulse.
  useEffect(() => {
    if (log) {
      setSourceKind("out");
      setSourceName("");
    }
  }, [log]);

  return (
    <Modal visible={log !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Card variant="panel" style={s.sheet}>
          <Text style={s.title}>Save “{log?.name}” to your Meal Library</Text>
          <Text style={s.body}>
            Its numbers come from this log
            {log?.calories != null ? ` — ${Math.round(log.calories)} cal` : ""}.
            You&apos;ll be able to search and log it again any day.
          </Text>

          <MealSourceFields
            sourceKind={sourceKind}
            onSourceKindChange={setSourceKind}
            sourceName={sourceName}
            onSourceNameChange={setSourceName}
            suggestions={suggestions}
            disabled={saving}
          />

          <View style={s.actions}>
            <View style={s.actionButton}>
              <Button variant="secondary" label="Cancel" onPress={onClose} disabled={saving} fluid />
            </View>
            <View style={s.actionButton}>
              <Button
                label="Save"
                onPress={() =>
                  log &&
                  onSave(log, {
                    kind: sourceKind,
                    name: resolveSourceName(sourceKind, sourceName),
                  })
                }
                loading={saving}
                fluid
              />
            </View>
          </View>
        </Card>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  sheet: { width: "100%", maxHeight: "100%" },
  title: { ...typography.titleBar, color: colors.text, marginBottom: spacing.xs },
  body: { ...typography.caption, marginBottom: spacing.md },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  actionButton: { flex: 1 },
});
