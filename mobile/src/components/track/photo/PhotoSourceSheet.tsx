// Four ways to get a picture, in one sheet.
//
// Camera photographs the thing, Library picks a shot already taken, Search
// asks the web — scoped by a brand or a vendor, because "Huel Banana" finds a
// product where the bare name finds recipes — and Link takes an address pasted
// from wherever the maker already publishes it.
//
// The sheet decides nothing about where the picture ends up. It hands back one
// URI and closes; the screen that opened it owns the slot, the state and the
// save. That is what lets a product's four faces and a delivered meal's one
// photo share it.
//
// TWO KINDS OF URI COME BACK, and callers must expect both. Camera and library
// return a LOCAL `file://` path, left for the caller to upload on its own
// schedule — Edit Product uploads at Save, which is what makes Cancel actually
// cancel. Search and Link return an `https://` URL the app already owns: the
// server fetched the picture and copied it into our bucket first. Never a hot
// link — a picture on somebody else's CDN is one redesign away from a grey box.
//
// Nothing attaches without a deliberate tap. Searching is free and throwaway;
// only the candidate somebody chooses costs a download.
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Camera, ImageIcon, ImageOff, Link as LinkIcon, Search, X } from "lucide-react-native";
import { isFetchableImageAddress } from "@/src/lib/imageAddress";
import {
  pickDishImage,
  searchDishImages,
  type DishImageCandidate,
} from "@/src/lib/supabase/dishImageSearch";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";

interface PhotoSourceSheetProps {
  visible: boolean;
  /** Names the slot being filled: "Primary photo", "Back photo". */
  title: string;
  /** What the picture is OF — "Huel · Banana". Also what search will ask for. */
  subtitle?: string | null;
  /** The words the web search uses. Blank disables Search rather than asking
   *  the web about nothing. */
  searchQuery: string;
  /** Narrows that search: a brand for a product, a vendor for a dish. */
  searchScope?: string | null;
  /** True when the slot already holds a picture, so the sheet can say out loud
   *  that choosing replaces it. */
  replacing?: boolean;
  /** A local `file://` from camera/library, or an owned `https://` from
   *  search/link. See the header. */
  onPicked: (uri: string) => void;
  /** Offered as a fifth way out when the slot has somewhere sensible to fall
   *  back to — a meal's borrowed ingredient photo. Omit and no row appears,
   *  which is right for a product face: emptying one has no meaning. */
  onClear?: () => void;
  /** What clearing MEANS, in the caller's words. "Remove" would be wrong for a
   *  meal, which falls back to a picture rather than to nothing. */
  clearLabel?: string;
  onClose: () => void;
}

type SearchState = {
  status: "idle" | "loading" | "done";
  candidates: DishImageCandidate[];
  /** False when the server says the search key is missing — the strip then
   *  explains itself instead of looking broken and empty. */
  configured: boolean;
};

const IDLE: SearchState = { status: "idle", candidates: [], configured: true };

export function PhotoSourceSheet({
  visible, title, subtitle, searchQuery, searchScope, replacing = false,
  onPicked, onClear, clearLabel = "Clear this photo", onClose,
}: PhotoSourceSheetProps) {
  const [attaching, setAttaching] = useState(false);
  const [search, setSearch] = useState<SearchState>(IDLE);
  // The paste-an-address field, hidden until asked for: it is the rarest of
  // the four ways in, and a text field is the loudest thing you can put in a
  // row of buttons.
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");

  const canUseLink = isFetchableImageAddress(link);
  const canSearch = searchQuery.trim() !== "";

  /** Every exit runs through here, so no sheet reopens holding the last
   *  question's results. */
  const finish = (uri?: string) => {
    setSearch(IDLE);
    setLink("");
    setLinkOpen(false);
    setAttaching(false);
    if (uri) onPicked(uri);
    onClose();
  };

  const shoot = async (source: "camera" | "library") => {
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    };
    let uri: string | null = null;
    try {
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        const shot = perm.granted
          ? await ImagePicker.launchCameraAsync(opts).catch(() => null)
          : null;
        // The simulator has no camera; falling through to the library keeps
        // the button meaning "get a picture" rather than erroring.
        const picked = shot && !shot.canceled ? shot : await ImagePicker.launchImageLibraryAsync(opts);
        if (picked.canceled) return;
        uri = picked.assets?.[0]?.uri ?? null;
      } else {
        const picked = await ImagePicker.launchImageLibraryAsync(opts);
        if (picked.canceled) return;
        uri = picked.assets?.[0]?.uri ?? null;
      }
    } catch (e) {
      console.error("photo picker failed:", e);
      Alert.alert("Couldn't open the picker", "Try the photo library instead.");
      return;
    }
    if (!uri) return;
    // Handed over as it is. Uploading here would write a file for a photo the
    // owner may still cancel out of.
    finish(uri);
  };

  const runSearch = async () => {
    if (!canSearch) return;
    setSearch({ status: "loading", candidates: [], configured: true });
    const { candidates, configured } = await searchDishImages(searchQuery, searchScope ?? null);
    setSearch({ status: "done", candidates, configured });
  };

  const chooseCandidate = async (candidate: DishImageCandidate) => {
    setAttaching(true);
    const { url, reason } = await pickDishImage(candidate, searchQuery || "product");
    if (!url) {
      setAttaching(false);
      // The server's own words when it has them: "the site refused to hand
      // over that image (403)" tells you to try the next result, where
      // "couldn't fetch that image" leaves you tapping the same one again.
      Alert.alert("Couldn't use that picture", reason ?? "Try another result, or the camera.");
      return;
    }
    finish(url);
  };

  /** A pasted address, taken exactly the way a chosen search result is:
   *  fetched server-side and copied into our own bucket. */
  const useLink = async () => {
    if (!canUseLink) return;
    const address = link.trim();
    setAttaching(true);
    const { url, reason } = await pickDishImage(
      { thumbUrl: address, imageUrl: address, sourcePage: null },
      searchQuery || "product",
    );
    if (!url) {
      setAttaching(false);
      Alert.alert(
        "Couldn't use that address",
        reason ?? "Check it points straight at an image file, not the page around it.",
      );
      return;
    }
    finish(url);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => finish()}>
      {/* The scrim closes, so the sheet never traps somebody who opened it by
          mistake on a slot they did not mean to touch. */}
      <TouchableOpacity style={s.scrim} activeOpacity={1} onPress={() => finish()} />
      <View style={s.sheet}>
        <View style={s.grabber} />

        <View style={s.head}>
          <Text style={s.title}>{title}</Text>
          {!!subtitle && <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text>}
          <TouchableOpacity
            onPress={() => finish()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={s.close}
          >
            <X size={icons.md} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
          </TouchableOpacity>
        </View>

        <View style={s.sources}>
          {([
            ["Camera", Camera, () => shoot("camera"), true],
            ["Library", ImageIcon, () => shoot("library"), true],
            ["Search", Search, runSearch, canSearch],
            ["Link", LinkIcon, () => setLinkOpen((v) => !v), true],
          ] as const).map(([label, Icon, onPress, enabled]) => (
            <TouchableOpacity
              key={label}
              style={[
                s.source,
                !enabled && s.sourceDisabled,
                label === "Link" && linkOpen && s.sourceOpen,
                label === "Search" && search.status !== "idle" && s.sourceOpen,
              ]}
              onPress={onPress}
              disabled={!enabled || attaching}
              accessibilityRole="button"
              accessibilityLabel={`${label} — ${title}`}
            >
              <Icon size={icons.sm} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
              <Text style={s.sourceText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {linkOpen && (
          <View style={s.linkRow}>
            <TextInput
              style={s.linkInput}
              placeholder="https://…"
              placeholderTextColor={colors.textFaint}
              value={link}
              onChangeText={setLink}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={useLink}
              accessibilityLabel="Image address"
            />
            <TouchableOpacity
              style={[s.linkGo, !canUseLink && s.sourceDisabled]}
              onPress={useLink}
              disabled={!canUseLink || attaching}
              accessibilityRole="button"
              accessibilityLabel="Use this image address"
            >
              <Text style={s.linkGoText}>Use</Text>
            </TouchableOpacity>
          </View>
        )}

        {!canSearch && (
          <Text style={s.note}>Name this product first and Search can look it up.</Text>
        )}

        {search.status === "loading" && (
          <View style={s.busy}>
            <ActivityIndicator size="small" color={colors.textMuted} />
            <Text style={s.note}>Searching the web…</Text>
          </View>
        )}

        {search.status === "done" && !search.configured && (
          <Text style={s.note}>
            Image search isn't set up yet — it needs a Google search key on the server.
          </Text>
        )}

        {search.status === "done" && search.configured && search.candidates.length === 0 && (
          <Text style={s.note}>Nothing found. Try the camera or library.</Text>
        )}

        {search.candidates.length > 0 && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.candidateRow}>
                {search.candidates.map((c) => (
                  <TouchableOpacity
                    key={c.imageUrl}
                    onPress={() => chooseCandidate(c)}
                    disabled={attaching}
                    accessibilityRole="button"
                    accessibilityLabel="Use this image"
                  >
                    <Image source={{ uri: c.thumbUrl }} style={s.candidate} />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <Text style={s.note}>
              Web results{searchScope ? ` for ${searchScope}` : ""} — tap one to use it
            </Text>
          </>
        )}

        {attaching && (
          <View style={s.busy}>
            <ActivityIndicator size="small" color={colors.brand} />
            <Text style={s.note}>Fetching and saving a copy…</Text>
          </View>
        )}

        {/* Said before the choice, not after it: on a filled slot every one of
            these four buttons is destructive to the picture already there. */}
        {replacing && !attaching && (
          <Text style={s.replaceNote}>This slot already has a photo. Choosing one replaces it.</Text>
        )}

        {/* Below the note it qualifies, and only when the caller has a
            fallback worth naming. Not styled as destructive: for a meal this
            hands the picture back to an ingredient, it does not empty it. */}
        {onClear && !attaching && (
          <TouchableOpacity
            style={s.clear}
            onPress={() => { onClear(); finish(); }}
            accessibilityRole="button"
            accessibilityLabel={clearLabel}
          >
            <ImageOff size={icons.sm} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
            <Text style={s.clearText}>{clearLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.panel, borderTopRightRadius: radii.panel,
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  grabber: {
    width: 38, height: 4, borderRadius: radii.pill,
    backgroundColor: colors.border, alignSelf: "center", marginBottom: spacing.xs,
  },
  head: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  title: { ...typography.titleBar, color: colors.text },
  subtitle: { ...typography.caption, flexShrink: 1 },
  close: { marginLeft: "auto" },
  sources: { flexDirection: "row", gap: spacing.sm },
  source: {
    flex: 1, alignItems: "center", gap: spacing.xs,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
    paddingVertical: spacing.sm,
  },
  sourceDisabled: { opacity: 0.4 },
  // Lit while its panel is showing, so the button reads as a toggle rather
  // than as something that did nothing.
  sourceOpen: { borderColor: colors.brand },
  sourceText: { ...typography.caption, color: colors.textMuted },
  linkRow: { flexDirection: "row", gap: spacing.sm },
  linkInput: {
    flex: 1, ...typography.body, color: colors.text,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  linkGo: {
    justifyContent: "center", paddingHorizontal: spacing.xl,
    backgroundColor: colors.brand, borderRadius: radii.control,
  },
  linkGoText: { ...typography.buttonSm, color: colors.onBrand },
  busy: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  note: { ...typography.caption },
  candidateRow: { flexDirection: "row", gap: spacing.sm },
  candidate: {
    width: 72, height: 72, borderRadius: radii.control,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border,
  },
  replaceNote: { ...typography.caption, color: colors.textFaint },
  clear: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, paddingVertical: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  clearText: { ...typography.buttonSm, color: colors.textMuted },
});
