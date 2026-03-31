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
import { backend } from "@/lib/backend";

export type Profile = {
  id: string;
  phone: string;
  full_name: string | null;
  company_name: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileUpdate = Partial<Pick<Profile, "full_name" | "company_name">>;

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  signInWithOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, token: string) => Promise<void>;
  demoSignIn: (index: number) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: ProfileUpdate) => Promise<Profile>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const isDevPhoneAuthEnabled =
  __DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH === "true";

export const SEED_USERS = [
  {
    phone: "+15551234567",
    full_name: "Mike Torres",
    company_name: "Torres Construction LLC",
  },
  {
    phone: "+15559876543",
    full_name: "Sarah Chen",
    company_name: "SiteLine Engineering",
  },
] as const;

// Email credentials for demo sign-in — kept internal to this module.
const SEED_CREDENTIALS = [
  { email: "mike@example.com", password: "test1234" },
  { email: "sarah@example.com", password: "test1234" },
] as const;

function buildProfileSeed(user: User): Pick<Profile, "id" | "phone" | "full_name" | "company_name"> {
  const metadata = user.user_metadata ?? {};

  return {
    id: user.id,
    phone: user.phone ?? metadata.phone ?? "",
    full_name: metadata.full_name ?? null,
    company_name: metadata.company_name ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
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
          throw error;
        }

        if (!isMounted) return;
        await syncSession(initialSession);
      } catch (error) {
        console.error("Failed to bootstrap auth session", error);
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
        try {
          await syncSession(nextSession);
        } catch (error) {
          console.error("Failed to sync auth state", error);
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
      options: { shouldCreateUser: true },
    });

    if (error) {
      throw error;
    }
  }, []);

  const verifyOtp = useCallback(async (phone: string, token: string) => {
    const { error } = await backend.auth.verifyOtp({
      phone,
      token,
      type: "sms",
    });

    if (error) {
      throw error;
    }
  }, []);

  const demoSignIn = useCallback(async (index: number) => {
    const credentials = SEED_CREDENTIALS[index];

    if (!credentials) {
      throw new Error("Invalid demo account index.");
    }

    const { error } = await backend.auth.signInWithPassword(credentials);

    if (error) {
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await backend.auth.signOut();

    if (error) {
      throw error;
    }
  }, []);

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
