// mobile/src/lib/historyViewStore.ts
// Which view of "Your history" the reader last chose, per user. Spec §7:
// key `training.exercise.historyView.v1:${userId}`, default Trend.
import { createPrefsStore, oneOf } from "./filterPrefsStore";

export type HistoryView = "trend" | "sessions";
export const ALL_HISTORY_VIEWS: HistoryView[] = ["trend", "sessions"];

export interface HistoryViewPrefs {
  view: HistoryView;
}

export function sanitizeHistoryView(raw: unknown): HistoryViewPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { view: oneOf(r.view, ALL_HISTORY_VIEWS) ?? "trend" };
}

const store = createPrefsStore<HistoryViewPrefs>({
  keyPrefix: "training.exercise.historyView.v1",
  defaults: { view: "trend" },
  sanitize: sanitizeHistoryView,
});

export const historyViewKey = store.key;
export const loadHistoryView = store.load;
export const saveHistoryView = store.save;
