import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { backend } from "@/lib/backend";
import {
  getDemoCredentials,
  isDevPhoneAuthEnabled,
  logClientError,
  SEED_USERS,
} from "@/lib/auth-security";
import { requireCanonicalPhoneNumber } from "@/lib/phone";
import { recordAuditEvent } from "@/lib/audit-log";

export type Profile = {
  id: string;
  phone: string;
  full_name: string | null;
  company_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileUpdate = Partial<Pick<Profile, "full_name" | "company_name" | "avatar_url">>;

type SignUpMetadata = {
  full_name: string;
  company_name: string;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  signInWithOtp: (phone: string) => Promise<void>;
  signUpWithOtp: (phone: string, metadata: SignUpMetadata) => Promise<void>;
  verifyOtp: (phone: string, token: string) => Promise<void>;
  demoSignIn: (index: number) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: ProfileUpdate) => Promise<Profile>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export { isDevPhoneAuthEnabled, SEED_USERS } from "@/lib/auth-security";

function buildProfileSeed(user: User): Pick<Profile, "id" | "phone" | "full_name" | "company_name"> {
  const metadata = user.user_metadata ?? {};

  return {
    id: user.id,
    phone: requireCanonicalPhoneNumber(String(user.phone ?? metadata.phone ?? "")),
    full_name: metadata.full_name ?? null,
    company_name: metadata.company_name ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async (currentUser: User) => {
    const { data, error } = await backend
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .maybeSingle<Profile>();

    if (error) {
      throw error;
    }

    if (data) {
      setProfile(data);
      return;
    }

    const { data: insertedProfile, error: insertError } = await backend
      .from("profiles")
      .upsert(buildProfileSeed(currentUser))
      .select("*")
      .single<Profile>();

    if (insertError) {
      throw insertError;
    }

    setProfile(insertedProfile);
  }, []);

  const syncSession = useCallback(
    async (nextSession: Session | null) => {
      setSession(nextSession);
      const nextUser = nextSession?.user ?? null;
      setUser(nextUser);

      if (!nextUser) {
        setProfile(null);
        return;
      }

      await loadProfile(nextUser);
    },
    [loadProfile]
  );

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      try {
        const {
          data: { session: initialSession },
          error,
        } = await backend.auth.getSession();

        if (error) {
          // Stale refresh token — clear it so the user can sign in fresh.
          await backend.auth.signOut().catch(() => {});
          if (!isMounted) return;
          setSession(null);
          setUser(null);
          setProfile(null);
          return;
        }

        if (!isMounted) return;
        await syncSession(initialSession);
      } catch (error) {
        logClientError(
          "Failed to bootstrap auth session",
          error,
          isDevPhoneAuthEnabled,
        );
        await backend.auth.signOut().catch(() => {});
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void bootstrap();

    const {
      data: { subscription },
    } = backend.auth.onAuthStateChange((_event, nextSession) => {
      void (async () => {
        if (isMounted) {
          setIsLoading(true);
        }
        try {
          await syncSession(nextSession);
        } catch (error) {
          logClientError(
            "Failed to sync auth state",
            error,
            isDevPhoneAuthEnabled,
          );
        } finally {
          if (isMounted) {
            setIsLoading(false);
          }
        }
      })();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [syncSession]);

  const signInWithOtp = useCallback(async (phone: string) => {
    const { error } = await backend.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: true, channel: "sms" },
    });

    if (error) {
      void recordAuditEvent({
        event_type: "auth.otp.send",
        outcome: "failure",
        metadata: { reason: error.message },
      });
      throw error;
    }
    void recordAuditEvent({ event_type: "auth.otp.send", outcome: "success" });
  }, []);

  const signUpWithOtp = useCallback(
    async (phone: string, metadata: SignUpMetadata) => {
      const { error } = await backend.auth.signInWithOtp({
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

      if (error) {
        throw error;
      }
    },
    []
  );

  const verifyOtp = useCallback(async (phone: string, token: string) => {
    const { error } = await backend.auth.verifyOtp({
      phone,
      token,
      type: "sms",
    });

    if (error) {
      void recordAuditEvent({
        event_type: "auth.login",
        outcome: "failure",
        metadata: { method: "otp", reason: error.message },
      });
      throw error;
    }
    void recordAuditEvent({
      event_type: "auth.login",
      outcome: "success",
      metadata: { method: "otp" },
    });
  }, []);

  const demoSignIn = useCallback(async (index: number) => {
    const credentials = getDemoCredentials(index, isDevPhoneAuthEnabled);

    const { error } = await backend.auth.signInWithPassword(credentials);

    if (error) {
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await backend.auth.signOut();

    if (error) {
      void recordAuditEvent({
        event_type: "auth.logout",
        outcome: "failure",
        metadata: { reason: error.message },
      });
      throw error;
    }
    void recordAuditEvent({ event_type: "auth.logout", outcome: "success" });

    // Drop any cached per-user data so the next sign-in starts fresh.
    queryClient.clear();
  }, [queryClient]);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await loadProfile(user);
    }
  }, [user, loadProfile]);

  const updateProfile = useCallback(
    async (updates: ProfileUpdate) => {
      if (!user) {
        throw new Error("No authenticated user");
      }

      const { data, error } = await backend
        .from("profiles")
        .update(updates)
        .eq("id", user.id)
        .select("*")
        .single<Profile>();

      if (error) {
        throw error;
      }

      setProfile(data);
      return data;
    },
    [user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      isLoading,
      signInWithOtp,
      signUpWithOtp,
      verifyOtp,
      demoSignIn,
      signOut,
      refreshProfile,
      updateProfile,
    }),
    [
      isLoading,
      profile,
      refreshProfile,
      session,
      signInWithOtp,
      signUpWithOtp,
      signOut,
      demoSignIn,
      updateProfile,
      user,
      verifyOtp,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
