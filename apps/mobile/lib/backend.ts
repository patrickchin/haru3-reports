import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
import { createSecureStorage } from "@/lib/secure-storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// SOC 2 CC6.1 — auth tokens persist in iOS Keychain / Android Keystore.
// AsyncStorage is retained only as a fallback for runtimes where SecureStore
// isn't available (web, vitest).
const sessionStorage = createSecureStorage({
  secureStore: SecureStore,
  fallback: AsyncStorage,
});

export const backend = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: sessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
