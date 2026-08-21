import React, { useEffect, useRef, useState } from "react";
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { X, Link as LinkIcon } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { resolvePost, extractPost, findExistingCapture } from "@/src/lib/supabase/capture";
import { sanitizeExtraction } from "@/src/lib/captureReview";
import { normalizeSourceUrl } from "@/src/lib/captureUrl";
import { fetchAllExercises } from "@/src/lib/supabase/crossfit";
import type { ExtractedPost, ResolvedPost } from "@/src/types/capture";

interface CaptureSheetProps {
  visible: boolean;
  /** A URL arriving from the iOS share sheet: prefilled and resolved
   *  immediately, skipping the paste step. */
  initialUrl?: string | null;
  onClose: () => void;
  /** Hands a sanitized extraction to the review sheet. rawExtraction is the
   *  unsanitized model output, persisted for audit. */
  onExtracted: (payload: {
    resolved: ResolvedPost;
    sourceUrl: string;
    post: ExtractedPost;
    rawExtraction: unknown;
  }) => void;
}

type Phase = "url" | "resolving" | "caption" | "extracting";

export function CaptureSheet({ visible, initialUrl, onClose, onExtracted }: CaptureSheetProps) {
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [phase, setPhase] = useState<Phase>("url");
  const [resolved, setResolved] = useState<ResolvedPost | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  // One auto-resolve per shared URL: a re-render mid-flow must not restart it,
  // and closing the sheet must not re-fire on the same share.
  const autoResolvedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!visible || !initialUrl) return;
    if (autoResolvedRef.current === initialUrl) return;
    autoResolvedRef.current = initialUrl;
    setUrl(initialUrl);
    handleSubmitUrl(initialUrl);
    // handleSubmitUrl is stable-enough by construction (reads state it was
    // handed); listing it would re-fire the effect every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialUrl]);

  const reset = () => {
    setUrl(""); setCaption(""); setPhase("url"); setResolved(null); setErrorText(null);
  };
  const close = () => { reset(); onClose(); };

  const runExtract = async (r: ResolvedPost, captionText: string) => {
    setPhase("extracting");
    setErrorText(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not signed in");

      // The model's whole vocabulary: library index + reference-table names.
      const [library, muscleRows, equipmentRows] = await Promise.all([
        fetchAllExercises(),
        supabase.from("muscle_regions").select("name"),
        supabase.from("equipment").select("name"),
      ]);
      const muscles = (muscleRows.data ?? []).map((m) => m.name as string);
      const equipment = (equipmentRows.data ?? []).map((e) => e.name as string);
      const index = library.map((e) => ({ id: e.id, name: e.name }));

      const raw = await extractPost({
        caption: captionText,
        handle: r.posterHandle,
        platform: r.platform,
        library: index,
        muscles,
        equipment,
        thumbnailUrl: r.thumbnailUrl,
      });
      const post = sanitizeExtraction(raw, {
        libraryIds: new Set(index.map((e) => e.id)),
        muscles: new Set(muscles),
        equipment: new Set(equipment),
      });
      if (!post) {
        setErrorText("Couldn't read any exercises out of that caption. Add detail and try again.");
        setPhase("caption");
        setCaption(captionText);
        return;
      }
      const payload = {
        resolved: r,
        sourceUrl: normalizeSourceUrl(url),
        post,
        rawExtraction: raw,
      };
      reset();
      onExtracted(payload);
    } catch (e) {
      console.error("extract flow failed:", e);
      setErrorText("Extraction failed. Check your connection and try again.");
      setPhase(r.captionText ? "url" : "caption");
    }
  };

  const handleSubmitUrl = async (raw?: string) => {
    const trimmed = (raw ?? url).trim();
    if (!/^https?:\/\//.test(trimmed)) {
      setErrorText("Paste a full link, starting with https://");
      return;
    }
    // Everything downstream — the duplicate check, the saved row, the tap-back
    // link — uses the canonical form, so a re-share of the same post lands on
    // the capture that already exists.
    const canonical = normalizeSourceUrl(trimmed);
    setPhase("resolving");
    setErrorText(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const existing = await findExistingCapture(user.id, canonical);
      if (existing?.extraction_status === "reviewed") {
        setErrorText("Already captured — it's in your catalog.");
        setPhase("url");
        return;
      }
    }

    const r = await resolvePost(canonical);
    if (!r) {
      setErrorText("Couldn't reach that post. Check the link and try again.");
      setPhase("url");
      return;
    }
    setResolved(r);
    if (r.needsCaption || !r.captionText) {
      setPhase("caption");
    } else {
      await runExtract(r, r.captionText);
    }
  };

  const handleSubmitCaption = async () => {
    if (!resolved) return;
    if (caption.trim().length < 8) {
      setErrorText("Paste the post's caption (or describe the exercise) first.");
      return;
    }
    await runExtract({ ...resolved, captionText: caption.trim() }, caption.trim());
  };

  const busy = phase === "resolving" || phase === "extracting";

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Capture from social</Text>
          <TouchableOpacity onPress={close} disabled={busy}>
            <X size={24} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {phase !== "caption" ? (
          <>
            <Text style={styles.label}>Post link</Text>
            <View style={styles.inputRow}>
              <LinkIcon size={18} color={colors.mutedForeground} />
              <TextInput
                style={styles.input}
                placeholder="https://www.tiktok.com/@…"
                placeholderTextColor={colors.mutedForeground}
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={!busy}
              />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.label}>
              {resolved?.platform === "instagram"
                ? "Instagram didn't share the caption — paste it here"
                : "Paste the post's caption"}
            </Text>
            <TextInput
              style={[styles.input, styles.captionInput]}
              placeholder="Paste the caption, or describe the exercise(s)…"
              placeholderTextColor={colors.mutedForeground}
              value={caption}
              onChangeText={setCaption}
              multiline
              editable={!busy}
            />
          </>
        )}

        {errorText && <Text style={styles.error}>{errorText}</Text>}

        <TouchableOpacity
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={phase === "caption" ? handleSubmitCaption : () => handleSubmitUrl()}
          disabled={busy}
          activeOpacity={0.8}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>
              {phase === "caption" ? "Extract exercises" : "Fetch post"}
            </Text>
          )}
        </TouchableOpacity>
        {phase === "extracting" && (
          <Text style={styles.hint}>Reading the post…</Text>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: 24,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.foreground },
  label: { fontSize: 14, color: colors.mutedForeground, marginBottom: 8 },
  inputRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.input, borderRadius: 8, paddingHorizontal: 12,
  },
  input: { flex: 1, fontSize: 16, color: colors.foreground, paddingVertical: 12 },
  captionInput: {
    backgroundColor: colors.input, borderRadius: 8, paddingHorizontal: 12,
    minHeight: 120, textAlignVertical: "top",
  },
  error: { color: "#F87171", fontSize: 14, marginTop: 12 },
  button: {
    backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14,
    alignItems: "center", marginTop: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  hint: { color: colors.mutedForeground, fontSize: 13, textAlign: "center", marginTop: 12 },
});
