import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/infra/supabase";
import type { Profile } from "@/infra/db-types";

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
};

type SignUpMetadata = {
  full_name: string;
  company_name: string;
};

type AuthContextValue = AuthState & {
  signInWithPhone: (phone: string) => Promise<void>;
  signUpWithOtp: (phone: string, metadata: SignUpMetadata) => Promise<void>;
  verifyOtp: (phone: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

let authState: AuthState = {
  session: null,
  user: null,
  profile: null,
  isLoading: true,
};

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function setAuthState(updates: Partial<AuthState>) {
  authState = { ...authState, ...updates };
  notifyListeners();
}

function buildProfileSeed(
  user: User
): Pick<Profile, "id" | "phone" | "full_name" | "company_name"> {
  const metadata = user.user_metadata ?? {};

  return {
    id: user.id,
    phone: String(user.phone ?? metadata.phone ?? ""),
    full_name: metadata.full_name ?? null,
    company_name: metadata.company_name ?? null,
  };
}

async function loadProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle<Profile>();

  if (error) throw error;

  if (data) return data;

  const currentUser = authState.user;
  if (!currentUser) throw new Error("No authenticated user");

  const { data: insertedProfile, error: insertError } = await supabase
    .from("profiles")
    .upsert(buildProfileSeed(currentUser))
    .select("*")
    .single<Profile>();

  if (insertError) throw insertError;

  return insertedProfile;
}

async function syncSession(nextSession: Session | null) {
  const nextUser = nextSession?.user ?? null;

  if (!nextUser) {
    setAuthState({ session: null, user: null, profile: null });
    return;
  }

  const profile = await loadProfile(nextUser.id);
  setAuthState({ session: nextSession, user: nextUser, profile });
}

async function bootstrap() {
  try {
    const {
      data: { session: initialSession },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      await supabase.auth.signOut().catch(() => {});
      setAuthState({ session: null, user: null, profile: null });
      return;
    }

    await syncSession(initialSession);
  } catch (error) {
    console.error("Failed to bootstrap auth session", error);
    await supabase.auth.signOut().catch(() => {});
  } finally {
    setAuthState({ isLoading: false });
  }
}

// Start bootstrap
void bootstrap();

// Listen to auth changes
supabase.auth.onAuthStateChange((_event, nextSession) => {
  void (async () => {
    setAuthState({ isLoading: true });
    try {
      await syncSession(nextSession);
    } catch (error) {
      console.error("Failed to sync auth state", error);
    } finally {
      setAuthState({ isLoading: false });
    }
  })();
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const subscribe = useCallback((callback: () => void) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  }, []);

  const getSnapshot = useCallback(() => authState, []);

  const state = useSyncExternalStore(subscribe, getSnapshot);

  const signInWithPhone = useCallback(async (phone: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: true, channel: "sms" },
    });

    if (error) throw error;
  }, []);

  const signUpWithOtp = useCallback(
    async (phone: string, metadata: SignUpMetadata) => {
      const { error } = await supabase.auth.signInWithOtp({
        phone,
        options: {
          shouldCreateUser: true,
          channel: "sms",
          data: {
            full_name: metadata.full_name,
            company_name: metadata.company_name,
            phone,
          },
        },
      });

      if (error) throw error;
    },
    []
  );

  const verifyOtp = useCallback(async (phone: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: "sms",
    });

    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!state.user) return;
    const profile = await loadProfile(state.user.id);
    setAuthState({ profile });
  }, [state.user]);

  const value = useMemo(
    () => ({
      ...state,
      signInWithPhone,
      signUpWithOtp,
      verifyOtp,
      signOut,
      refreshProfile,
    }),
    [state, signInWithPhone, signUpWithOtp, verifyOtp, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
