// mobile/src/lib/__tests__/historyViewStore.test.ts
const mockMemory = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockMemory.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockMemory.set(k, v); }),
  },
}));

import { historyViewKey, loadHistoryView, saveHistoryView, sanitizeHistoryView } from "../historyViewStore";

beforeEach(() => mockMemory.clear());

describe("historyViewStore", () => {
  it("keys per user under the spec's prefix (spec §7)", () => {
    expect(historyViewKey("u1")).toBe("training.exercise.historyView.v1:u1");
  });
  it("defaults to Trend and round-trips Sessions", async () => {
    expect(await loadHistoryView("u1")).toEqual({ view: "trend" });
    await saveHistoryView("u1", { view: "sessions" });
    expect(await loadHistoryView("u1")).toEqual({ view: "sessions" });
    expect(await loadHistoryView("u2")).toEqual({ view: "trend" });
  });
  it("sanitizes junk to Trend", () => {
    expect(sanitizeHistoryView({ view: "pie" })).toEqual({ view: "trend" });
    expect(sanitizeHistoryView(null)).toEqual({ view: "trend" });
  });
});
