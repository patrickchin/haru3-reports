import { assertEquals } from "jsr:@std/assert";

import {
  formatAuthErrorMessage,
  getBearerToken,
  resolveUserIdFromRequest,
} from "./auth.ts";

async function withEnv(
  values: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const previousValues = Object.fromEntries(
    Object.keys(values).map((key) => [key, Deno.env.get(key)]),
  );

  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }

    await fn();
  } finally {
    for (const [key, value] of Object.entries(previousValues)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

function bearerRequest(token = "token-123") {
  return new Request("http://localhost/", {
    headers: { authorization: `Bearer ${token}` },
  });
}

Deno.test("getBearerToken extracts and trims bearer tokens", () => {
  const req = new Request("http://localhost/", {
    headers: { authorization: "Bearer   token-123   " },
  });

  assertEquals(getBearerToken(req), "token-123");
});

Deno.test("getBearerToken rejects missing or non-bearer auth headers", () => {
  assertEquals(getBearerToken(new Request("http://localhost/")), null);
  assertEquals(
    getBearerToken(
      new Request("http://localhost/", {
        headers: { authorization: "Basic token-123" },
      }),
    ),
    null,
  );
});

Deno.test("formatAuthErrorMessage redacts JWT-shaped strings", () => {
  const message = formatAuthErrorMessage(
    new Error("bad token eyJhbGciOiJub25l.eyJzdWIiOiIxMjM.sig tail"),
  );

  assertEquals(message, "bad token [JWT_REDACTED] tail");
});

Deno.test("resolveUserIdFromRequest returns null without a bearer token", async () => {
  await withEnv({ SUPABASE_URL: "https://example.supabase.co" }, async () => {
    let verifyCalled = false;
    const result = await resolveUserIdFromRequest(
      new Request("http://localhost/"),
      {
        verifySupabaseJwtFn: async () => {
          verifyCalled = true;
          return { sub: "user-1" };
        },
      },
    );

    assertEquals(result, null);
    assertEquals(verifyCalled, false);
  });
});

Deno.test("resolveUserIdFromRequest reports missing SUPABASE_URL", async () => {
  await withEnv({ SUPABASE_URL: undefined }, async () => {
    let missingUrlCalled = false;
    const result = await resolveUserIdFromRequest(bearerRequest(), {
      onMissingSupabaseUrl: () => {
        missingUrlCalled = true;
      },
    });

    assertEquals(result, null);
    assertEquals(missingUrlCalled, true);
  });
});

Deno.test("resolveUserIdFromRequest returns the verified JWT subject", async () => {
  await withEnv({ SUPABASE_URL: "https://example.supabase.co" }, async () => {
    const result = await resolveUserIdFromRequest(bearerRequest(), {
      verifySupabaseJwtFn: async (token, supabaseUrl) => {
        assertEquals(token, "token-123");
        assertEquals(supabaseUrl, "https://example.supabase.co");
        return { sub: "user-1" };
      },
    });

    assertEquals(result, "user-1");
  });
});

Deno.test("resolveUserIdFromRequest falls back after JWT verification errors", async () => {
  await withEnv({ SUPABASE_URL: "https://example.supabase.co" }, async () => {
    let jwtErrorCalled = false;
    let fallbackCalled = false;
    const result = await resolveUserIdFromRequest(bearerRequest(), {
      verifySupabaseJwtFn: async () => {
        throw new Error("no matching jwk");
      },
      onJwtVerifyError: () => {
        jwtErrorCalled = true;
      },
      fallbackFn: async (token, supabaseUrl) => {
        assertEquals(token, "token-123");
        assertEquals(supabaseUrl, "https://example.supabase.co");
        fallbackCalled = true;
        return "fallback-user";
      },
    });

    assertEquals(result, "fallback-user");
    assertEquals(jwtErrorCalled, true);
    assertEquals(fallbackCalled, true);
  });
});

Deno.test("resolveUserIdFromRequest reports fallback errors and returns null", async () => {
  await withEnv({ SUPABASE_URL: "https://example.supabase.co" }, async () => {
    let fallbackErrorCalled = false;
    const result = await resolveUserIdFromRequest(bearerRequest(), {
      verifySupabaseJwtFn: async () => {
        throw new Error("no matching jwk");
      },
      fallbackFn: async () => {
        throw new Error("auth api unavailable");
      },
      onFallbackError: () => {
        fallbackErrorCalled = true;
      },
    });

    assertEquals(result, null);
    assertEquals(fallbackErrorCalled, true);
  });
});
