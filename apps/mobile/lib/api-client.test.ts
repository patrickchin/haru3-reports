import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();

vi.mock("./backend", () => ({
  backend: {
    auth: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
    },
  },
}));

const ORIGINAL_API_URL = process.env.EXPO_PUBLIC_API_URL;

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = "https://api.example.com";
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({
    data: { session: { access_token: "tok" } },
  });
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_API_URL === undefined) {
    delete process.env.EXPO_PUBLIC_API_URL;
  } else {
    process.env.EXPO_PUBLIC_API_URL = ORIGINAL_API_URL;
  }
});

function fakeFetch(
  status: number,
  body: unknown,
): ReturnType<typeof vi.fn> {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  });
}

describe("api-client", () => {
  it("apiGet attaches Authorization and parses JSON", async () => {
    const fetchImpl = fakeFetch(200, { hello: "world" });
    const { apiGet } = await import("./api-client");
    const res = await apiGet<{ hello: string }>("/v1/me", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(res.hello).toBe("world");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.example.com/v1/me");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer tok");
    expect((init as RequestInit).method).toBe("GET");
  });

  it("apiGet appends query params", async () => {
    const fetchImpl = fakeFetch(200, { rows: [] });
    const { apiGet } = await import("./api-client");
    await apiGet("/v1/sync/projects", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      query: { limit: 50, cursor: "2026-01-01" },
    });
    const [url] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      "https://api.example.com/v1/sync/projects?limit=50&cursor=2026-01-01",
    );
  });

  it("apiPostJson sends JSON body and Content-Type", async () => {
    const fetchImpl = fakeFetch(200, { ok: true });
    const { apiPostJson } = await import("./api-client");
    await apiPostJson("/v1/sync/project", { id: "p1" }, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const [, init] = fetchImpl.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect((init as RequestInit).body).toBe(JSON.stringify({ id: "p1" }));
  });

  it("apiPostForm omits Content-Type so fetch sets boundary", async () => {
    const fetchImpl = fakeFetch(200, { text: "hi" });
    const { apiPostForm } = await import("./api-client");
    const fd = new FormData();
    fd.append("provider", "groq");
    await apiPostForm("/v1/audio/transcribe", fd, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const [, init] = fetchImpl.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
    expect((init as RequestInit).body).toBe(fd);
  });

  it("throws ApiError with parsed body on non-2xx", async () => {
    const fetchImpl = fakeFetch(422, { error: "bad" });
    const { apiGet, ApiError } = await import("./api-client");
    await expect(
      apiGet("/v1/me", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ status: 422 });
    // re-call to assert ApiError instance
    const fetch2 = fakeFetch(403, { error: "denied" });
    await expect(
      apiGet("/v1/me", { fetchImpl: fetch2 as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("throws when not authenticated", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const fetchImpl = fakeFetch(200, {});
    const { apiGet } = await import("./api-client");
    await expect(
      apiGet("/v1/me", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/not authenticated/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws when EXPO_PUBLIC_API_URL is missing", async () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    const { apiGet } = await import("./api-client");
    await expect(
      apiGet("/v1/me", {
        fetchImpl: fakeFetch(200, {}) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/EXPO_PUBLIC_API_URL/);
  });

  it("uses injected getAccessToken", async () => {
    const fetchImpl = fakeFetch(200, {});
    const { apiGet } = await import("./api-client");
    await apiGet("/v1/me", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAccessToken: async () => "injected-tok",
    });
    const [, init] = fetchImpl.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer injected-tok");
  });
});
