import React, { useEffect, useState } from "react";
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Switch,
} from "react-native";
import { X, Check, Plus, MapPin } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import {
  fetchBfrFlag, presetEquipmentNames, saveGym, setActiveGym, setBfrFlag,
} from "@/src/lib/supabase/daily";
import { fetchEquipment } from "@/src/lib/supabase/crossfit";
import type { GymProfile } from "@/src/types/daily";

const PRESETS: { key: string; label: string }[] = [
  { key: "full_gym", label: "Full gym" },
  { key: "hotel_gym", label: "Hotel gym" },
  { key: "bodyweight", label: "Bodyweight" },
  { key: "custom", label: "Custom" },
];

interface GymSheetProps {
  visible: boolean;
  gyms: GymProfile[];
  onClose: () => void;
  /** Fires after any change that should recompose the session. */
  onChanged: () => void;
}

export function GymSheet({ visible, gyms, onClose, onChanged }: GymSheetProps) {
  const [editing, setEditing] = useState<GymProfile | "new" | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [preset, setPreset] = useState("hotel_gym");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [allEquipment, setAllEquipment] = useState<string[]>([]);
  const [bfr, setBfr] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    fetchEquipment().then((rows) => setAllEquipment(rows.map((r: any) => r.name)));
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) fetchBfrFlag(user.id).then(setBfr);
    });
  }, [visible]);

  const startEdit = (gym: GymProfile | "new") => {
    setEditing(gym);
    if (gym === "new") {
      setName(""); setLocation(""); setPreset("hotel_gym");
      setChecked(new Set(presetEquipmentNames("hotel_gym")));
    } else {
      setName(gym.name); setLocation(gym.location ?? ""); setPreset(gym.preset);
      setChecked(new Set(gym.equipmentNames));
    }
  };

  const applyPreset = (key: string) => {
    setPreset(key);
    if (key !== "custom") setChecked(new Set(presetEquipmentNames(key)));
  };

  const toggleEquipment = (n: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
    setPreset("custom");
  };

  const handleActivate = async (gymId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await setActiveGym(user.id, gymId);
    onChanged();
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const gymId = await saveGym({
      id: editing === "new" ? undefined : editing!.id,
      userId: user.id,
      name: name.trim(),
      location: location.trim() || null,
      preset,
      equipmentNames: [...checked],
    });
    if (gymId && editing === "new") await setActiveGym(user.id, gymId);
    setSaving(false);
    setEditing(null);
    onChanged();
  };

  const handleBfrToggle = async (value: boolean) => {
    setBfr(value);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) { await setBfrFlag(user.id, value); onChanged(); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{editing ? (editing === "new" ? "New gym" : "Edit gym") : "Gyms"}</Text>
          <TouchableOpacity onPress={editing ? () => setEditing(null) : onClose}>
            <X size={24} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {!editing ? (
          <ScrollView>
            {gyms.map((gym) => (
              <TouchableOpacity key={gym.id} style={styles.gymRow} onPress={() => handleActivate(gym.id)}>
                <View style={[styles.radio, gym.isActive && styles.radioActive]}>
                  {gym.isActive && <Check size={14} color="#FFFFFF" />}
                </View>
                <View style={styles.gymBody}>
                  <Text style={styles.gymName}>{gym.name}</Text>
                  <Text style={styles.gymMeta}>
                    {[gym.location, `${gym.equipmentNames.length} equipment`].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => startEdit(gym)}>
                  <Text style={styles.editLink}>Edit</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.addRow} onPress={() => startEdit("new")}>
              <Plus size={18} color={colors.primary} />
              <Text style={styles.addText}>Add a gym</Text>
            </TouchableOpacity>

            <View style={styles.bfrRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.gymName}>BFR bands travel with me</Text>
                <Text style={styles.gymMeta}>Counts as available equipment at every gym</Text>
              </View>
              <Switch value={bfr} onValueChange={handleBfrToggle} trackColor={{ true: colors.primary }} />
            </View>
          </ScrollView>
        ) : (
          <ScrollView>
            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName}
              placeholder="Waikiki Hotel Gym" placeholderTextColor={colors.mutedForeground} />
            <Text style={styles.label}>Location</Text>
            <View style={styles.inputRow}>
              <MapPin size={16} color={colors.mutedForeground} />
              <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} value={location}
                onChangeText={setLocation} placeholder="Honolulu, HI"
                placeholderTextColor={colors.mutedForeground} />
            </View>
            <Text style={styles.label}>Preset</Text>
            <View style={styles.pillRow}>
              {PRESETS.map((p) => (
                <TouchableOpacity key={p.key}
                  style={[styles.pill, preset === p.key && styles.pillActive]}
                  onPress={() => applyPreset(p.key)}>
                  <Text style={[styles.pillText, preset === p.key && styles.pillTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Equipment</Text>
            <View style={styles.pillRow}>
              {allEquipment.map((n) => (
                <TouchableOpacity key={n}
                  style={[styles.pill, checked.has(n) && styles.pillActive]}
                  onPress={() => toggleEquipment(n)}>
                  <Text style={[styles.pillText, checked.has(n) && styles.pillTextActive]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.button, saving && { opacity: 0.6 }]}
              onPress={handleSave} disabled={saving}>
              <Text style={styles.buttonText}>Save gym</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { fontSize: 20, fontWeight: "700", color: colors.foreground },
  gymRow: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  radioActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  gymBody: { flex: 1 },
  gymName: { fontSize: 16, fontWeight: "600", color: colors.foreground },
  gymMeta: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
  editLink: { fontSize: 14, color: colors.primary },
  addRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 16 },
  addText: { fontSize: 15, color: colors.primary, fontWeight: "600" },
  bfrRow: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8,
  },
  label: { fontSize: 13, color: colors.mutedForeground, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: colors.input, borderRadius: 8, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 16, color: colors.foreground, marginBottom: 4,
  },
  inputRow: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.input,
    borderRadius: 8, paddingHorizontal: 12,
  },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: 13, color: colors.mutedForeground },
  pillTextActive: { color: "#FFFFFF", fontWeight: "600" },
  button: {
    backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14,
    alignItems: "center", marginTop: 24,
  },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
});
