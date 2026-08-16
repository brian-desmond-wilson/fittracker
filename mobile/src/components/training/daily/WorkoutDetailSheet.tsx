import React from "react";
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking, Image,
} from "react-native";
import { X, ExternalLink } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { formatWorkoutHeadline, formatWorkoutItem } from "@/src/lib/workoutFormat";
import type { CapturedWorkoutEntry } from "@/src/types/capture";

interface WorkoutDetailSheetProps {
  workout: CapturedWorkoutEntry | null;
  onClose: () => void;
}

export function WorkoutDetailSheet({ workout, onClose }: WorkoutDetailSheetProps) {
  return (
    <Modal
      visible={workout !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{workout?.name ?? ""}</Text>
            {workout && (
              <Text style={styles.headline}>
                {formatWorkoutHeadline(workout.items.length, workout.rounds)}
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={onClose}>
            <X size={24} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {workout && (
          <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
            {workout.source?.thumbnailUrl && (
              <Image source={{ uri: workout.source.thumbnailUrl }} style={styles.hero} />
            )}

            {workout.items.map((item, i) => {
              const prescription = formatWorkoutItem(item);
              return (
                <View key={`${item.exerciseId}-${i}`} style={styles.row}>
                  <Text style={styles.index}>{i + 1}</Text>
                  <View style={styles.rowBody}>
                    <Text style={styles.movement}>{item.name}</Text>
                    {/* Silence beats invention: when the creator prescribed
                        nothing, the movement stands on its own. */}
                    {prescription !== "" && (
                      <Text style={styles.prescription}>{prescription}</Text>
                    )}
                    {item.notes && <Text style={styles.notes}>{item.notes}</Text>}
                  </View>
                </View>
              );
            })}

            {workout.rounds && (
              <Text style={styles.repeat}>
                Repeat the whole list {workout.rounds} times.
              </Text>
            )}

            {workout.rawProtocol && (
              <>
                <Text style={styles.sectionLabel}>As the creator wrote it</Text>
                <Text style={styles.protocol}>{workout.rawProtocol}</Text>
              </>
            )}

            {workout.source && (
              <TouchableOpacity
                style={styles.sourceRow}
                onPress={() => Linking.openURL(workout.source!.sourceUrl)}
                activeOpacity={0.7}
              >
                <ExternalLink size={15} color={colors.primary} />
                <Text style={styles.sourceText}>
                  {workout.source.posterHandle ?? workout.source.platform}
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  header: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "flex-start", marginBottom: 16, gap: 12,
  },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: "700", color: colors.foreground },
  headline: { fontSize: 13, color: colors.primary, marginTop: 2 },
  hero: { width: "100%", height: 160, borderRadius: 12, marginBottom: 16 },
  row: { flexDirection: "row", gap: 12, paddingVertical: 10 },
  index: {
    fontSize: 13, fontWeight: "700", color: colors.mutedForeground,
    width: 20, paddingTop: 2,
  },
  rowBody: { flex: 1 },
  movement: { fontSize: 16, fontWeight: "600", color: colors.foreground },
  prescription: { fontSize: 14, color: colors.mutedForeground, marginTop: 2 },
  notes: { fontSize: 13, color: colors.mutedForeground, marginTop: 4, fontStyle: "italic" },
  repeat: {
    fontSize: 14, color: colors.foreground, marginTop: 12, marginBottom: 4,
    fontWeight: "600",
  },
  sectionLabel: {
    fontSize: 12, color: colors.mutedForeground, marginTop: 20, marginBottom: 6,
    textTransform: "uppercase",
  },
  protocol: {
    fontSize: 13, color: colors.mutedForeground, lineHeight: 19,
    backgroundColor: colors.input, borderRadius: 8, padding: 12,
  },
  sourceRow: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 20,
  },
  sourceText: { fontSize: 14, color: colors.primary },
});
