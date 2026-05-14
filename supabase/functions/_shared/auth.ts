import * as jose from "jsr:@panva/jose@6";

export type VerifySupabaseJwtFn = (
  token: string,
  supabaseUrl: string,
) => Promise<jose.JWTPayload>;

export type ResolveUserIdOptions = {
  verifySupabaseJwtFn?: VerifySupabaseJwtFn;
  fallbackFn?: (token: string, supabaseUrl: string) => Promise<string | null>;
  onMissingSupabaseUrl?: () => void;
  onJwtVerifyError?: (error: unknown) => void;
  onFallbackError?: (error: unknown) => void;
};

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\b/g;

export function formatAuthErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(JWT_PATTERN, "[JWT_REDACTED]");
}

export function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim() || null;
}

export async function verifySupabaseJwt(
  token: string,
  supabaseUrl: string,
): Promise<jose.JWTPayload> {
  const issuer = `${supabaseUrl}/auth/v1`;
  const jwks = jose.createRemoteJWKSet(
    new URL(`${issuer}/.well-known/jwks.json`),
  );
  const { payload } = await jose.jwtVerify(token, jwks, { issuer });
  return payload;
}

export async function resolveUserIdFromRequest(
  req: Request,
  opts: ResolveUserIdOptions = {},
): Promise<string | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    opts.onMissingSupabaseUrl?.();
    return null;
  }

  try {
    const payload = await (opts.verifySupabaseJwtFn ?? verifySupabaseJwt)(
      token,
      supabaseUrl,
    );
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch (error) {
    opts.onJwtVerifyError?.(error);
  }

  if (!opts.fallbackFn) return null;

  try {
    return await opts.fallbackFn(token, supabaseUrl);
  } catch (error) {
    opts.onFallbackError?.(error);
    return null;
  }
}
