import { assert, assertEquals } from "jsr:@std/assert";

import { createHandler, resolveUserIdFromRequest } from "./index.ts";
import type { TranscriptionProvider } from "./providers.ts";

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

function makeAudioFormData(): FormData {
  const formData = new FormData();
  formData.append(
    "audio",
    new File([new Uint8Array([1, 2, 3])], "note.m4a", {
      type: "audio/m4a",
    }),
  );
  return formData;
}

Deno.test("resolveUserIdFromRequest falls back to Supabase Auth when JWKS verification fails", async () => {
  await withEnv(
    {
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_ANON_KEY: "anon-key",
    },
    async () => {
      const request = new Request("https://example.test/transcribe", {
        headers: { Authorization: "Bearer legacy-token" },
      });

      const userId = await resolveUserIdFromRequest(request, {
        verifySupabaseJwtFn: async () => {
          throw new Error("no matching jwk");
        },
        fetchUserIdFromAuthFn: async (token, supabaseUrl, anonKey) => {
          assertEquals(token, "legacy-token");
          assertEquals(supabaseUrl, "https://project.supabase.co");
          assertEquals(anonKey, "anon-key");
          return "user-123";
        },
      });

      assertEquals(userId, "user-123");
    },
  );
});

Deno.test("resolveUserIdFromRequest fetches the user with anon and bearer auth headers", async () => {
  const originalFetch = globalThis.fetch;

  await withEnv(
    {
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_ANON_KEY: "anon-key",
    },
    async () => {
      try {
        globalThis.fetch = ((input, init) => {
          assertEquals(
            String(input),
            "https://project.supabase.co/auth/v1/user",
          );
          const headers = new Headers(init?.headers);
          assertEquals(headers.get("apikey"), "anon-key");
          assertEquals(headers.get("Authorization"), "Bearer legacy-token");

          return Promise.resolve(
            new Response(JSON.stringify({ id: "user-456" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }) as typeof fetch;

        const request = new Request("https://example.test/transcribe", {
          headers: { Authorization: "Bearer legacy-token" },
        });

        const userId = await resolveUserIdFromRequest(request, {
          verifySupabaseJwtFn: async () => {
            throw new Error("no matching jwk");
          },
        });

        assertEquals(userId, "user-456");
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );
});

Deno.test("createHandler transcribes an authenticated multipart audio request", async () => {
  await withEnv({ TEST_TRANSCRIBE_API_KEY: "provider-key" }, async () => {
    const providerCalls: Array<
      { audio: Uint8Array; mimeType: string; filename: string }
    > = [];
    const provider: TranscriptionProvider = {
      id: "test-provider",
      envKey: "TEST_TRANSCRIBE_API_KEY",
      model: "test-model",
      transcribe: async (params, apiKey) => {
        assertEquals(apiKey, "provider-key");
        providerCalls.push({
          audio: params.audio,
          mimeType: params.mimeType,
          filename: params.filename,
        });
        return { text: "hello from audio", model: "test-model" };
      },
    };

    const handler = createHandler({
      getUserIdFn: async () => "user-123",
      resolveProviderFn: () => provider,
    });

    const response = await handler(
      new Request("https://example.test/transcribe", {
        method: "POST",
        body: makeAudioFormData(),
      }),
    );

    assertEquals(response.status, 200);
    assertEquals(providerCalls.length, 1);
    assertEquals(providerCalls[0].mimeType, "audio/m4a");
    assertEquals(providerCalls[0].filename, "note.m4a");
    assertEquals([...providerCalls[0].audio], [1, 2, 3]);

    const body = await response.json();
    assertEquals(body, {
      text: "hello from audio",
      provider: "test-provider",
      model: "test-model",
      durationMs: body.durationMs,
    });
    assert(typeof body.durationMs === "number");
  });
});

Deno.test("createHandler rejects unauthenticated transcription requests", async () => {
  const handler = createHandler({ getUserIdFn: async () => null });

  const response = await handler(
    new Request("https://example.test/transcribe", {
      method: "POST",
      body: makeAudioFormData(),
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(await response.json(), { error: "unauthorized" });
});
