import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

/**
 * Supabase auth-session storage backed by the device keychain (expo-secure-store).
 *
 * SecureStore recommends keeping values under ~2048 bytes, but a Supabase session
 * (access + refresh JWTs + user object) exceeds that — which is why this app
 * previously fell back to plaintext AsyncStorage. Instead we chunk the value into
 * sub-2048-byte pieces so the tokens live in the hardware-backed keychain.
 *
 * A one-time migration reads any legacy plaintext AsyncStorage session, moves it
 * into SecureStore, and clears the plaintext copy — so existing signed-in users
 * are not logged out by the switch. Web falls back to localStorage (no keychain).
 */

// Stay comfortably under the 2048-byte SecureStore guidance.
const CHUNK_SIZE = 1800;

// SecureStore keys allow [A-Za-z0-9._-]; the Supabase key ("sb-<ref>-auth-token")
// already qualifies, and these suffixes keep it valid.
const countKey = (key: string) => `${key}.__chunks`;
const chunkKey = (key: string, i: number) => `${key}.${i}`;

async function secureRemove(key: string): Promise<void> {
  const countRaw = await SecureStore.getItemAsync(countKey(key));
  if (countRaw != null) {
    const count = parseInt(countRaw, 10) || 0;
    for (let i = 0; i < count; i++) {
      await SecureStore.deleteItemAsync(chunkKey(key, i));
    }
    await SecureStore.deleteItemAsync(countKey(key));
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  // Clear any previous chunks first (the value may have shrunk).
  await secureRemove(key);
  const chunks = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
  for (let i = 0; i < chunks; i++) {
    await SecureStore.setItemAsync(
      chunkKey(key, i),
      value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
    );
  }
  await SecureStore.setItemAsync(countKey(key), String(chunks));
}

async function secureGet(key: string): Promise<string | null> {
  const countRaw = await SecureStore.getItemAsync(countKey(key));
  if (countRaw == null) {
    // Migrate a legacy plaintext AsyncStorage session into the keychain.
    const legacy = await AsyncStorage.getItem(key);
    if (legacy != null) {
      await secureSet(key, legacy);
      await AsyncStorage.removeItem(key);
      return legacy;
    }
    return null;
  }
  const count = parseInt(countRaw, 10) || 0;
  let out = "";
  for (let i = 0; i < count; i++) {
    const part = await SecureStore.getItemAsync(chunkKey(key, i));
    if (part == null) return null; // partial/corrupt — treat as no session
    out += part;
  }
  return out;
}

export const LargeSecureStore = {
  getItem: (key: string): Promise<string | null> => {
    if (Platform.OS === "web") {
      return Promise.resolve(localStorage.getItem(key));
    }
    return secureGet(key);
  },
  setItem: (key: string, value: string): Promise<void> => {
    if (Platform.OS === "web") {
      localStorage.setItem(key, value);
      return Promise.resolve();
    }
    return secureSet(key, value);
  },
  removeItem: (key: string): Promise<void> => {
    if (Platform.OS === "web") {
      localStorage.removeItem(key);
      return Promise.resolve();
    }
    return secureRemove(key);
  },
};
