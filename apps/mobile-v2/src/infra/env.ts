import { z } from "zod";

const envSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.string().url(),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  EXPO_PUBLIC_USE_FIXTURES: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid environment variables:\n${JSON.stringify(parsed.error.format(), null, 2)}`
  );
}

export const env = parsed.data;
export const USE_FIXTURES = env.EXPO_PUBLIC_USE_FIXTURES;
export const ENABLE_DEV_PHONE_AUTH = env.EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH;
export const E2E_MOCK_VOICE_NOTE = env.EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE;
