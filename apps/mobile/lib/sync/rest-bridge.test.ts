import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();

vi.mock("../backend", () => ({
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

function fakeFetch(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  });
}

const samplePayload = {
  client_op_id: "00000000-0000-0000-0000-000000000001",
  op: "insert" as const,
  id: "00000000-0000-0000-0000-000000000002",
  base_version: null,
  fields: { name: "Acme" },
};

describe("makeRestPullFetcher", () => {
  it("calls GET /v1/sync/:table with cursor + limit and returns rows", async () => {
    const fetchImpl = fakeFetch(200, {
      rows: [{ id: "p1", updated_at: "2026", deleted_at: null }],
      nextCursor: null,
    });
    const { makeRestPullFetcher } = await import("./rest-bridge");
    const fetcher = makeRestPullFetcher({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const rows = await fetcher("projects", "2026-01-01", 100);
    expect(rows).toHaveLength(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      "https://api.example.com/v1/sync/projects?limit=100&cursor=2026-01-01",
    );
    expect((init as RequestInit).method).toBe("GET");
  });

  it("omits cursor when null", async () => {
    const fetchImpl = fakeFetch(200, { rows: [], nextCursor: null });
    const { makeRestPullFetcher } = await import("./rest-bridge");
    const fetcher = makeRestPullFetcher({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await fetcher("reports", null, 50);
    const [url] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.example.com/v1/sync/reports?limit=50");
  });

  it("rejects unknown table without HTTP call", async () => {
    const fetchImpl = fakeFetch(200, { rows: [] });
    const { makeRestPullFetcher } = await import("./rest-bridge");
    const fetcher = makeRestPullFetcher({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(fetcher("bogus", null, 10)).rejects.toThrow(/no REST route/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns [] when server returns rows: undefined", async () => {
    const fetchImpl = fakeFetch(200, { nextCursor: null });
    const { makeRestPullFetcher } = await import("./rest-bridge");
    const fetcher = makeRestPullFetcher({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const rows = await fetcher("projects", null, 10);
    expect(rows).toEqual([]);
  });
});

describe("makeRestMutationCaller", () => {
  it("POSTs JSON to /v1/sync/:entity and returns server response", async () => {
    const fetchImpl = fakeFetch(200, {
      status: "applied",
      server_version: "v1",
      row: { id: "p2" },
    });
    const { makeRestMutationCaller } = await import("./rest-bridge");
    const call = makeRestMutationCaller({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const res = await call("project", samplePayload);
    expect(res.status).toBe("applied");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.example.com/v1/sync/project");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBe(JSON.stringify(samplePayload));
  });

  it("rejects unknown entity without HTTP call", async () => {
    const fetchImpl = fakeFetch(200, { status: "applied" });
    const { makeRestMutationCaller } = await import("./rest-bridge");
    const call = makeRestMutationCaller({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      // @ts-expect-error testing runtime guard
      call("bogus", samplePayload),
    ).rejects.toThrow(/no REST route/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws on empty response body", async () => {
    const fetchImpl = fakeFetch(200, "");
    const { makeRestMutationCaller } = await import("./rest-bridge");
    const call = makeRestMutationCaller({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(call("project", samplePayload)).rejects.toThrow(
      /empty response/,
    );
  });

  it("propagates ApiError on 4xx", async () => {
    const fetchImpl = fakeFetch(403, { error: "RLS denied" });
    const { makeRestMutationCaller } = await import("./rest-bridge");
    const call = makeRestMutationCaller({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(call("project", samplePayload)).rejects.toMatchObject({
      status: 403,
    });
  });
});
