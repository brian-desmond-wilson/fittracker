// mobile/src/lib/filterPrefsStore.ts
// Last-used filters and sort for a list tab, per user. A preference must
// never stop a list rendering: every failure here is a logged fallback to
// the defaults. Each tab creates its own store with its own key and
// sanitizer; the load/save/fallback discipline is written once.
import AsyncStorage from "@react-native-async-storage/async-storage";

// Coercions for reading a stored preference set: anything not of the
// expected shape is dropped.
export const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
export const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
export const manyOf = <T extends string>(v: unknown, allowed: readonly T[]): T[] =>
  strings(v).filter((x): x is T => (allowed as readonly string[]).includes(x));

export interface PrefsStore<T> {
  key: (userId: string) => string;
  load: (userId: string) => Promise<T>;
  save: (userId: string, prefs: T) => Promise<void>;
}

export function createPrefsStore<T>(opts: {
  keyPrefix: string;
  defaults: T;
  /** Coerce whatever was stored into a valid preference set. */
  sanitize: (raw: unknown) => T;
}): PrefsStore<T> {
  const key = (userId: string) => `${opts.keyPrefix}:${userId}`;
  return {
    key,
    async load(userId) {
      try {
        const raw = await AsyncStorage.getItem(key(userId));
        if (!raw) return opts.defaults;
        return opts.sanitize(JSON.parse(raw));
      } catch (e) {
        console.warn(`${opts.keyPrefix} load fell back to defaults:`, e);
        return opts.defaults;
      }
    },
    async save(userId, prefs) {
      try {
        await AsyncStorage.setItem(key(userId), JSON.stringify(prefs));
      } catch (e) {
        console.warn(`${opts.keyPrefix} save failed:`, e);
      }
    },
  };
}
