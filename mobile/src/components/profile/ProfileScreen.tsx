// mobile/src/components/profile/ProfileScreen.tsx
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Mail, User } from "lucide-react-native";
import { supabase } from "@/src/lib/supabase";
import { ageFromBirthdate, cmToFtIn, ftInToCm } from "@/src/lib/bodyUnits";
import { getLocalDateString, parseLocalDate } from "@/src/lib/dates";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Button, Card, Screen, SectionHeader } from "@/src/components/ui";

type Sex = "male" | "female";

interface ProfileScreenProps {
  userId: string;
  userName: string;
  userEmail: string;
  memberSince: string;
  initialData: {
    height_cm: string;
    birthdate: string; // "YYYY-MM-DD" or ""
    sex: Sex | null;
    health_notes: string;
  };
  onClose: () => void;
  onSave: () => void;
}

export function ProfileScreen({
  userId,
  userName,
  userEmail,
  memberSince,
  initialData,
  onClose,
  onSave,
}: ProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBirthdatePicker, setShowBirthdatePicker] = useState(false);

  const initialHeight = (() => {
    const cm = parseFloat(initialData.height_cm);
    if (!isNaN(cm) && cm > 0) {
      const { ft, inches } = cmToFtIn(cm);
      return { ft: ft.toString(), inches: Math.round(inches).toString() };
    }
    return { ft: "", inches: "" };
  })();
  const [heightFt, setHeightFt] = useState(initialHeight.ft);
  const [heightIn, setHeightIn] = useState(initialHeight.inches);
  const [birthdate, setBirthdate] = useState(initialData.birthdate);
  const [sex, setSex] = useState<Sex | null>(initialData.sex);
  const [healthNotes, setHealthNotes] = useState(initialData.health_notes);

  // Latest weigh-in, display only — Track → Weight owns logging.
  const [currentWeightLbs, setCurrentWeightLbs] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("weight_logs")
        .select("weight_lbs")
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .order("logged_at", { ascending: false })
        .limit(1);
      if (!cancelled && data && data.length > 0) {
        setCurrentWeightLbs(Math.round(parseFloat(data[0].weight_lbs.toString())).toString());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const age = ageFromBirthdate(birthdate, new Date());
  const birthdateLabel = birthdate
    ? `${parseLocalDate(birthdate).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })}${age !== null ? ` (${age})` : ""}`
    : "Not set";

  const handleSave = async () => {
    setError(null);
    try {
      setSaving(true);

      let heightCm: number | null = null;
      const ftN = parseFloat(heightFt);
      const inN = parseFloat(heightIn);
      if (!isNaN(ftN) && ftN >= 0) {
        const cm = ftInToCm(ftN, isNaN(inN) ? 0 : inN);
        heightCm = cm > 0 ? Math.round(cm * 10) / 10 : null;
      }

      const { error: dbError } = await supabase
        .from("profiles")
        .update({
          height_cm: heightCm,
          birthdate: birthdate || null,
          sex,
          health_notes: healthNotes.trim() || null,
        })
        .eq("id", userId);
      if (dbError) throw dbError;
      onSave();
      onClose();
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen variant="detail" title="Profile" onBack={onClose} scroll={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.avatarSection}>
            <View style={styles.avatarCircle}>
              <User size={icons.xl} color={colors.brand} strokeWidth={icons.strokeWidth} />
            </View>
            <Text style={styles.userName}>{userName || "User"}</Text>
            <View style={styles.emailRow}>
              <Mail size={icons.sm} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
              <Text style={styles.userEmail}>{userEmail}</Text>
            </View>
          </View>

          <SectionHeader title="Account" />
          <Card variant="panel" style={styles.sectionCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Member since</Text>
              <Text style={styles.infoValue}>{memberSince}</Text>
            </View>
          </Card>

          <SectionHeader title="Personal Details" />
          <Card variant="panel" style={styles.sectionCard}>
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Height (ft)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="5"
                  placeholderTextColor={colors.textMuted}
                  value={heightFt}
                  onChangeText={setHeightFt}
                  keyboardType="number-pad"
                  editable={!saving}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Height (in)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="8"
                  placeholderTextColor={colors.textMuted}
                  value={heightIn}
                  onChangeText={setHeightIn}
                  keyboardType="decimal-pad"
                  editable={!saving}
                />
              </View>
            </View>

            <Text style={styles.label}>Birthdate</Text>
            <TouchableOpacity
              style={styles.input}
              onPress={() => setShowBirthdatePicker(true)}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={`Birthdate: ${birthdateLabel}`}
            >
              <Text style={birthdate ? styles.inputText : styles.inputPlaceholder}>
                {birthdateLabel}
              </Text>
            </TouchableOpacity>

            <Text style={styles.label}>Sex</Text>
            <View style={styles.segmentTrack}>
              {(["male", "female"] as Sex[]).map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.segment, sex === value && styles.segmentActive]}
                  onPress={() => setSex((prev) => (prev === value ? null : value))}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={`Sex: ${value}${sex === value ? ", selected, tap to clear" : ""}`}
                >
                  <Text
                    style={[styles.segmentText, sex === value && styles.segmentTextActive]}
                  >
                    {value === "male" ? "Male" : "Female"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Health Notes</Text>
            <Text style={styles.fieldHelp}>
              Conditions, injuries, or anything else worth remembering.
            </Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="None"
              placeholderTextColor={colors.textMuted}
              value={healthNotes}
              onChangeText={setHealthNotes}
              multiline
              editable={!saving}
            />

            <View style={[styles.infoRow, styles.weightRow]}>
              <Text style={styles.infoLabel}>Current weight</Text>
              <Text style={styles.infoValue}>
                {currentWeightLbs !== null ? `${currentWeightLbs} lbs` : "No weigh-ins yet"}
              </Text>
            </View>
            <Text style={styles.fieldHelp}>
              From your latest weigh-in. Log weight in Track → Weight.
            </Text>
          </Card>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Button label="Save Changes" onPress={handleSave} loading={saving} fluid />
        </ScrollView>
      </KeyboardAvoidingView>

      {Platform.OS === "ios" ? (
        <Modal
          visible={showBirthdatePicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowBirthdatePicker(false)}
        >
          <View style={styles.backdrop}>
            <Card variant="panel" style={styles.sheetCard}>
              <Text style={styles.sheetTitle}>Birthdate</Text>
              <DateTimePicker
                value={birthdate ? parseLocalDate(birthdate) : new Date(1990, 0, 1)}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={(_e, picked) => {
                  if (picked) setBirthdate(getLocalDateString(picked));
                }}
                textColor={colors.text}
              />
              <Button label="Done" onPress={() => setShowBirthdatePicker(false)} fluid />
            </Card>
          </View>
        </Modal>
      ) : (
        showBirthdatePicker && (
          <DateTimePicker
            value={birthdate ? parseLocalDate(birthdate) : new Date(1990, 0, 1)}
            mode="date"
            display="default"
            maximumDate={new Date()}
            onChange={(_e, picked) => {
              setShowBirthdatePicker(false);
              if (picked) setBirthdate(getLocalDateString(picked));
            }}
          />
        )
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.screenGutter,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  sectionCard: { marginBottom: spacing.sm },
  avatarSection: { alignItems: "center", paddingVertical: spacing.xxl },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: radii.pill,
    backgroundColor: tint(colors.brand),
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  userName: { ...typography.titleRoot, color: colors.text, marginBottom: spacing.sm },
  emailRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  userEmail: { ...typography.body, color: colors.textMuted },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  weightRow: { marginTop: spacing.sm },
  infoLabel: { ...typography.body, color: colors.textMuted },
  infoValue: { ...typography.rowTitle, color: colors.text },
  label: {
    ...typography.section,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16, // §4.5 defines no input token — see STYLE_GUIDE §6
    color: colors.text,
  },
  inputText: { fontSize: 16, color: colors.text },
  inputPlaceholder: { fontSize: 16, color: colors.textMuted },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: spacing.md },
  halfField: { flex: 1 },
  segmentTrack: {
    flexDirection: "row",
    backgroundColor: colors.surface2,
    borderRadius: radii.control,
    padding: 2,
    gap: 2,
    alignSelf: "flex-start",
  },
  segment: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: radii.control - 2,
  },
  segmentActive: { backgroundColor: colors.brand },
  segmentText: { ...typography.buttonSm, color: colors.textMuted },
  segmentTextActive: { color: colors.onBrand },
  fieldHelp: { ...typography.caption, marginBottom: spacing.sm },
  errorText: { ...typography.body, color: colors.danger, textAlign: "center" },
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  sheetCard: { width: "100%", maxHeight: "100%", gap: spacing.md },
  sheetTitle: { ...typography.titleBar, color: colors.text, textAlign: "center" },
});
