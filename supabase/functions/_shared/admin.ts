import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { jwtVerify, SignJWT } from "jsr:@panva/jose@6";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export type InternalAdminSession = {
  username: string;
  displayName: string;
  issuedAt: string;
  expiresAt: string;
};

type AdminContext = {
  serviceClient: SupabaseClient;
  admin: InternalAdminSession;
};

const ADMIN_AUDIENCE = "harpa-admin-web";
const ADMIN_ISSUER = "harpa-admin";

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function getServiceClient() {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getJwtSecret() {
  return new TextEncoder().encode(getEnv("ADMIN_WEB_JWT_SECRET"));
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export function errorResponse(status: number, message: string) {
  return jsonResponse({ error: message }, status);
}

export function parsePagination(url: URL) {
  const pageParam = Number(url.searchParams.get("page") ?? "1");
  const limitParam = Number(url.searchParams.get("limit") ?? "20");
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(Math.floor(limitParam), 100)
    : 20;

  return { page, limit };
}

export function paginationRange(page: number, limit: number) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return { from, to };
}

function resolveAdminIdentity() {
  const username = getEnv("ADMIN_WEB_USERNAME");
  const password = getEnv("ADMIN_WEB_PASSWORD");
  const displayName = Deno.env.get("ADMIN_WEB_DISPLAY_NAME") ?? username;

  return { username, password, displayName };
}

export async function createAdminToken(username: string, displayName: string) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);

  const token = await new SignJWT({ username, displayName })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ADMIN_ISSUER)
    .setAudience(ADMIN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getJwtSecret());

  return {
    token,
    admin: {
      username,
      displayName,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    } satisfies InternalAdminSession,
  };
}

export async function signInInternalAdmin(username: string, password: string) {
  const expected = resolveAdminIdentity();
  if (username !== expected.username || password !== expected.password) {
    return null;
  }

  return createAdminToken(expected.username, expected.displayName);
}

function getBearerToken(req: Request) {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim();
}

export async function requireAdmin(req: Request): Promise<AdminContext | Response> {
  try {
    const token = getBearerToken(req);
    if (!token) return errorResponse(401, "Admin token missing");

    const verified = await jwtVerify(token, getJwtSecret(), {
      issuer: ADMIN_ISSUER,
      audience: ADMIN_AUDIENCE,
    });

    const username = typeof verified.payload.username === "string"
      ? verified.payload.username
      : null;
    const displayName = typeof verified.payload.displayName === "string"
      ? verified.payload.displayName
      : username;

    if (!username || !displayName) {
      return errorResponse(401, "Invalid admin token");
    }

    return {
      serviceClient: getServiceClient(),
      admin: {
        username,
        displayName,
        issuedAt: verified.payload.iat
          ? new Date(Number(verified.payload.iat) * 1000).toISOString()
          : new Date().toISOString(),
        expiresAt: verified.payload.exp
          ? new Date(Number(verified.payload.exp) * 1000).toISOString()
          : new Date().toISOString(),
      },
    };
  } catch (error) {
    return errorResponse(
      401,
      error instanceof Error ? error.message : "Failed to validate admin session",
    );
  }
}

export async function auditAdminAction(
  serviceClient: SupabaseClient,
  params: {
    action: string;
    targetType: string;
    targetId: string;
    admin: InternalAdminSession;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await serviceClient
    .from("admin_audit_log")
    .insert({
      admin_id: null,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId,
      metadata: {
        actor: params.admin.displayName,
        actor_username: params.admin.username,
        ...(params.metadata ?? {}),
      },
    });

  if (error) throw error;
}
