import { createClient } from "@supabase/supabase-js";
import { LargeSecureStore } from "./largeSecureStore";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Session tokens are kept in the device keychain (chunked to fit
    // SecureStore's size limit) instead of plaintext AsyncStorage.
    storage: LargeSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
