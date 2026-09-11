const mockMemory = new Map<string, string>();
let failWrites = false;
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockMemory.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      if (failWrites) throw new Error("disk full");
      mockMemory.set(k, v);
    }),
  },
}));

import { createPrefsStore } from "../filterPrefsStore";

interface Prefs { colour: "red" | "blue"; count: number }
const defaults: Prefs = { colour: "red", count: 0 };
const store = createPrefsStore<Prefs>({
  keyPrefix: "test.prefs.v1",
  defaults,
  sanitize: (raw) => {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return {
      colour: r.colour === "blue" ? "blue" : "red",
      count: typeof r.count === "number" ? r.count : 0,
    };
  },
});

beforeEach(() => { mockMemory.clear(); failWrites = false; });

describe("createPrefsStore", () => {
  it("round-trips per user", async () => {
    await store.save("u1", { colour: "blue", count: 3 });
    expect(await store.load("u1")).toEqual({ colour: "blue", count: 3 });
    expect(await store.load("u2")).toEqual(defaults);
  });

  it("keys by prefix and user", () => {
    expect(store.key("u1")).toBe("test.prefs.v1:u1");
  });

  it("falls back to defaults on malformed JSON", async () => {
    mockMemory.set(store.key("u1"), "{not json");
    expect(await store.load("u1")).toEqual(defaults);
  });

  it("runs the sanitizer on whatever was stored", async () => {
    mockMemory.set(store.key("u1"), JSON.stringify({ colour: "green", count: "many" }));
    expect(await store.load("u1")).toEqual(defaults);
  });

  it("swallows a failed write", async () => {
    failWrites = true;
    await expect(store.save("u1", { colour: "blue", count: 1 })).resolves.toBeUndefined();
  });
});
