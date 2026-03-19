import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
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

type DevAuthRecord = {
  phone: string;
  full_name: string | null;
  company_name: string | null;
  created_at: string;
  updated_at: string;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  signInWithOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: ProfileUpdate) => Promise<Profile>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const DEV_AUTH_STORAGE_KEY = "haru3.dev-auth";
const DEV_AUTH_USER_ID = "dev-user-phone";
const DEV_AUTH_TOKEN = "dev-auth-token";

export const DEV_FAKE_PHONE_NUMBER = "+15555550123";
export const DEV_FAKE_OTP_CODE = "123456";
export const isDevPhoneAuthEnabled =
  __DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH === "true";

export function isDevPhoneLoginPhone(phone: string) {
  return isDevPhoneAuthEnabled && phone.trim() === DEV_FAKE_PHONE_NUMBER;
}

function buildDevAuthRecord(
  phone: string,
  overrides: Partial<Omit<DevAuthRecord, "phone">> = {}
): DevAuthRecord {
  const timestamp = new Date().toISOString();

  return {
    phone,
    full_name: "Demo Site Lead",
    company_name: "Demo Construction Co.",
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  };
}

function buildDevUser(record: DevAuthRecord): User {
  return {
    id: DEV_AUTH_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    phone: record.phone,
    created_at: record.created_at,
    last_sign_in_at: record.updated_at,
    app_metadata: { provider: "phone", providers: ["phone"] },
    user_metadata: {
      phone: record.phone,
      full_name: record.full_name,
      company_name: record.company_name,
    },
    identities: [],
    is_anonymous: false,
  } as User;
}

function buildDevSession(user: User): Session {
  const expiresIn = 60 * 60 * 24 * 30;

  return {
    access_token: DEV_AUTH_TOKEN,
    refresh_token: DEV_AUTH_TOKEN,
    token_type: "bearer",
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    user,
  };
}

function buildDevProfile(record: DevAuthRecord): Profile {
  return {
    id: DEV_AUTH_USER_ID,
    phone: record.phone,
    full_name: record.full_name,
    company_name: record.company_name,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

async function persistDevAuthRecord(record: DevAuthRecord | null) {
  if (!record) {
    await AsyncStorage.removeItem(DEV_AUTH_STORAGE_KEY);
    return;
  }

  await AsyncStorage.setItem(DEV_AUTH_STORAGE_KEY, JSON.stringify(record));
}

async function loadPersistedDevAuthRecord() {
  const rawValue = await AsyncStorage.getItem(DEV_AUTH_STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<DevAuthRecord>;

    if (
      typeof parsed.phone !== "string" ||
      typeof parsed.created_at !== "string" ||
      typeof parsed.updated_at !== "string"
    ) {
      return null;
    }

    return buildDevAuthRecord(parsed.phone, {
      full_name: parsed.full_name ?? null,
      company_name: parsed.company_name ?? null,
      created_at: parsed.created_at,
      updated_at: parsed.updated_at,
    });
  } catch {
    return null;
  }
}

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
  const [backendSession, setBackendSession] = useState<Session | null>(null);
  const [backendUser, setBackendUser] = useState<User | null>(null);
  const [backendProfile, setBackendProfile] = useState<Profile | null>(null);
  const [devAuthRecord, setDevAuthRecord] = useState<DevAuthRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const devUser = useMemo(
    () => (devAuthRecord ? buildDevUser(devAuthRecord) : null),
    [devAuthRecord]
  );
  const devSession = useMemo(
    () => (devUser ? buildDevSession(devUser) : null),
    [devUser]
  );
  const devProfile = useMemo(
    () => (devAuthRecord ? buildDevProfile(devAuthRecord) : null),
    [devAuthRecord]
  );

  const session = backendSession ?? devSession;
  const user = backendUser ?? devUser;
  const profile = backendProfile ?? devProfile;

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
      setBackendProfile(data);
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

    setBackendProfile(insertedProfile);
  }, []);

  const syncSession = useCallback(
    async (nextSession: Session | null) => {
      setBackendSession(nextSession);
      const nextUser = nextSession?.user ?? null;
      setBackendUser(nextUser);

      if (!nextUser) {
        setBackendProfile(null);
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
        const storedDevAuthRecord = await loadPersistedDevAuthRecord();

        if (isMounted) {
          setDevAuthRecord(storedDevAuthRecord);
        }

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
    if (isDevPhoneLoginPhone(phone)) {
      return;
    }

    const { error } = await backend.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: true },
    });

    if (error) {
      throw error;
    }
  }, []);

  const verifyOtp = useCallback(async (phone: string, token: string) => {
    if (isDevPhoneLoginPhone(phone)) {
      if (token.trim() !== DEV_FAKE_OTP_CODE) {
        throw new Error(`Use ${DEV_FAKE_OTP_CODE} for the development login code.`);
      }

      const nextDevAuthRecord = buildDevAuthRecord(phone, {
        created_at: devAuthRecord?.created_at ?? new Date().toISOString(),
        full_name: devAuthRecord?.full_name ?? "Demo Site Lead",
        company_name: devAuthRecord?.company_name ?? "Demo Construction Co.",
        updated_at: new Date().toISOString(),
      });

      setDevAuthRecord(nextDevAuthRecord);
      await persistDevAuthRecord(nextDevAuthRecord);
      return;
    }

    const { error } = await backend.auth.verifyOtp({
      phone,
      token,
      type: "sms",
    });

    if (error) {
      throw error;
    }
  }, [devAuthRecord]);

  const signOut = useCallback(async () => {
    setDevAuthRecord(null);
    await persistDevAuthRecord(null);

    if (!backendSession) {
      return;
    }

    const { error } = await backend.auth.signOut();

    if (error) {
      throw error;
    }
  }, [backendSession]);

  const refreshProfile = useCallback(async () => {
    if (backendUser) {
      await loadProfile(backendUser);
    }
  }, [backendUser, loadProfile]);

  const updateProfile = useCallback(
    async (updates: ProfileUpdate) => {
      if (backendUser) {
        const { data, error } = await backend
          .from("profiles")
          .update(updates)
          .eq("id", backendUser.id)
          .select("*")
          .single<Profile>();

        if (error) {
          throw error;
        }

        setBackendProfile(data);
        return data;
      }

      if (!devAuthRecord || !devProfile) {
        throw new Error("No authenticated user");
      }

      const nextDevAuthRecord = {
        ...devAuthRecord,
        ...updates,
        updated_at: new Date().toISOString(),
      };
      const nextProfile = buildDevProfile(nextDevAuthRecord);

      setDevAuthRecord(nextDevAuthRecord);
      await persistDevAuthRecord(nextDevAuthRecord);

      return nextProfile;
    },
    [backendUser, devAuthRecord, devProfile]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      isLoading,
      signInWithOtp,
      verifyOtp,
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
