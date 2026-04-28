type DemoCredentials = {
  email: string;
  password: string;
};

type Logger = Pick<Console, "error" | "warn">;

const DEV_SEED_USERS = [
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
  {
    phone: "+15550000003",
    full_name: "Charlie Empty",
    company_name: "Solo Trader",
  },
] as const;

const DEV_SEED_CREDENTIALS: readonly DemoCredentials[] = [
  { email: "mike@example.com", password: "test1234" },
  { email: "sarah@example.com", password: "test1234" },
  { email: "charlie@example.com", password: "test1234" },
] as const;

export function getRuntimeIsDev(): boolean {
  return (globalThis as { __DEV__?: boolean }).__DEV__ === true;
}

export function getDevPhoneAuthOverride(): boolean {
  return process.env.EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH === "true";
}

export function computeIsDevPhoneAuthEnabled(
  isDev: boolean,
  isExplicitlyEnabled: boolean,
): boolean {
  return isDev || isExplicitlyEnabled;
}

export function getSeedUsers(isDev: boolean) {
  return isDev ? DEV_SEED_USERS : [];
}

export function getDemoCredentials(index: number, isDev: boolean): DemoCredentials {
  if (!isDev) {
    throw new Error("Demo sign-in is unavailable in production builds.");
  }

  const credentials = DEV_SEED_CREDENTIALS[index];

  if (!credentials) {
    throw new Error("Invalid demo account index.");
  }

  return credentials;
}

export function logClientError(
  message: string,
  error: unknown,
  isDev: boolean,
  logger: Logger = console,
) {
  if (isDev) {
    logger.error(message, error);
    return;
  }

  logger.warn(message);
}

const RUNTIME_IS_DEV = getRuntimeIsDev();
const DEV_PHONE_AUTH_OVERRIDE = getDevPhoneAuthOverride();

export const isDevPhoneAuthEnabled =
  computeIsDevPhoneAuthEnabled(RUNTIME_IS_DEV, DEV_PHONE_AUTH_OVERRIDE);

export const SEED_USERS = getSeedUsers(isDevPhoneAuthEnabled);
