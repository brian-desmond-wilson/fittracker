import React, { useEffect, useState } from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import { Plus } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { fetchAllExercises } from "@/src/lib/supabase/crossfit";
import { CaptureSheet } from "./CaptureSheet";
import { CaptureReviewSheet } from "./CaptureReviewSheet";
import type { ExtractedPost, ResolvedPost } from "@/src/types/capture";

// The capture button and the two sheets behind it, as one thing.
//
// A post can yield exercises, a workout, or both, so the button belongs on
// every tab that shows what capturing produces. Keeping the flow here means
// those tabs mount one component instead of each carrying a copy of the
// sheet wiring — and there is one place to change when capture changes.
interface CaptureFabProps {
  /** Fired after a capture is committed, so the host tab reloads its list. */
  onSaved: () => void;
  /** A URL from the iOS share sheet: opens the capture sheet with it. */
  initialUrl?: string | null;
}

export function CaptureFab({ onSaved, initialUrl }: CaptureFabProps) {
  const [captureVisible, setCaptureVisible] = useState(false);
  useEffect(() => {
    if (initialUrl) setCaptureVisible(true);
  }, [initialUrl]);
  const [reviewPayload, setReviewPayload] = useState<{
    resolved: ResolvedPost; sourceUrl: string; post: ExtractedPost; rawExtraction: unknown;
  } | null>(null);
  const [matchNames, setMatchNames] = useState<Map<string, string>>(new Map());

  const handleExtracted = async (payload: {
    resolved: ResolvedPost; sourceUrl: string; post: ExtractedPost; rawExtraction: unknown;
  }) => {
    // Names for the "matches X" chips in review.
    const library = await fetchAllExercises();
    setMatchNames(new Map(library.map((e) => [e.id, e.name])));
    setCaptureVisible(false);
    setReviewPayload(payload);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setCaptureVisible(true)}
        activeOpacity={0.8}
      >
        <Plus size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <CaptureSheet
        visible={captureVisible}
        initialUrl={initialUrl ?? null}
        onClose={() => setCaptureVisible(false)}
        onExtracted={handleExtracted}
      />
      <CaptureReviewSheet
        visible={reviewPayload !== null}
        payload={reviewPayload}
        matchNames={matchNames}
        onClose={() => setReviewPayload(null)}
        onSaved={() => { setReviewPayload(null); onSaved(); }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute", right: 20, bottom: 20, width: 56, height: 56,
    borderRadius: 28, backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
});
