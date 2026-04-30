import { assert, assertEquals } from "jsr:@std/assert";

import { createHandler } from "./index.ts";
import type { TranscriptionProvider } from "../transcribe-audio/providers.ts";

type Row = {
  id: string;
  file_id: string;
  project_id: string;
  body: string | null;
  file_metadata: {
    bucket: string;
    storage_path: string;
    mime_type: string;
    filename: string;
  } | null;
};

// Minimal in-memory Supabase client stub: enough surface area for the
// backfill handler. The handler only touches `.from("report_notes")`
// (select + update) and `.storage.from(bucket).download(path)`.
function makeClientStub(initial: {
  rows: Row[];
  storage: Record<string, Record<string, Uint8Array>>;
  downloadError?: string;
}) {
  const updates: Array<{ id: string; body: string }> = [];
  const downloads: Array<{ bucket: string; path: string }> = [];

  const fromReportNotes = () => {
    const builder = {
      _data: initial.rows.map((r) => ({ ...r })),
      _filters: [] as Array<(row: Row) => boolean>,
      _limit: undefined as number | undefined,
      _updateBody: null as string | null,
      _updateMatch: null as { id: string } | null,
      select(_cols: string) {
        return this;
      },
      eq(field: string, value: unknown) {
        if (field === "kind") return this; // ignore kind filter (rows are pre-filtered)
        this._filters.push((row) => (row as Record<string, unknown>)[field] === value);
        return this;
      },
      not(field: string, op: string, value: unknown) {
        if (field === "file_id" && op === "is" && value === null) {
          this._filters.push((row) => row.file_id !== null);
        }
        return this;
      },
      or(_expr: string) {
        // body.is.null,body.eq.
        this._filters.push((row) => row.body === null || row.body === "");
        return this;
      },
      is(field: string, value: unknown) {
        this._filters.push((row) => {
          const v = (row as Record<string, unknown>)[field];
          // Treat missing field as `null` to match Postgres `IS NULL`.
          if (value === null) return v === null || v === undefined;
          return v === value;
        });
        return this;
      },
      order(_field: string, _opts: unknown) {
        return this;
      },
      limit(n: number) {
        this._limit = n;
        return this;
      },
      update(patch: { body: string }) {
        this._updateBody = patch.body;
        return this;
      },
      then<T>(
        resolve: (
          value: { data: unknown; error: unknown },
        ) => T | PromiseLike<T>,
      ) {
        // SELECT path: terminal `.limit()` returns awaitable result.
        if (this._updateBody === null) {
          let rows = this._data.filter((r) =>
            this._filters.every((f) => f(r))
          );
          if (this._limit !== undefined) rows = rows.slice(0, this._limit);
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        }
        // UPDATE path: terminal `.eq("id", ...)` is the last filter applied.
        const target = this._data.find((r) =>
          this._filters.every((f) => f(r))
        );
        if (target) {
          target.body = this._updateBody;
          updates.push({ id: target.id, body: this._updateBody });
        }
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
    };
    return builder;
  };

  const client = {
    from(table: string) {
      if (table !== "report_notes") {
        throw new Error(`unexpected table ${table}`);
      }
      return fromReportNotes();
    },
    storage: {
      from(bucket: string) {
        return {
          download(path: string) {
            downloads.push({ bucket, path });
            if (initial.downloadError) {
              return Promise.resolve({
                data: null,
                error: { message: initial.downloadError },
              });
            }
            const bytes = initial.storage[bucket]?.[path];
            if (!bytes) {
              return Promise.resolve({
                data: null,
                error: { message: "not found" },
              });
            }
            return Promise.resolve({
              data: { arrayBuffer: () => Promise.resolve(bytes.buffer) },
              error: null,
            });
          },
        };
      },
    },
  };

  return { client, updates, downloads };
}

function makeProvider(textByCall: string[]): TranscriptionProvider {
  let i = 0;
  return {
    id: "test",
    envKey: "TEST_KEY",
    model: "test-model",
    transcribe: async (params) => {
      assert(params.audio.byteLength > 0);
      const text = textByCall[i++] ?? "default";
      return { text, model: "test-model" };
    },
  };
}

const ALWAYS_OK = (_req: Request) => true;
const ALWAYS_DENY = (_req: Request) => false;

Deno.test("rejects requests without a valid service role bearer", async () => {
  const handler = createHandler({ authorizeFn: ALWAYS_DENY });
  const res = await handler(
    new Request("https://x.test/backfill", { method: "POST" }),
  );
  assertEquals(res.status, 401);
  assertEquals(await res.json(), { error: "unauthorized" });
});

Deno.test("rejects non-POST methods", async () => {
  const handler = createHandler({ authorizeFn: ALWAYS_OK });
  const res = await handler(
    new Request("https://x.test/backfill", { method: "GET" }),
  );
  assertEquals(res.status, 405);
});

Deno.test("dry run lists candidates without calling provider or updating", async () => {
  const stub = makeClientStub({
    rows: [
      {
        id: "note-1",
        file_id: "file-1",
        project_id: "proj-1",
        body: null,
        file_metadata: {
          bucket: "project-files",
          storage_path: "p/note-1.m4a",
          mime_type: "audio/m4a",
          filename: "note-1.m4a",
        },
      },
    ],
    storage: {},
  });

  let providerCalled = false;
  const provider: TranscriptionProvider = {
    id: "x",
    envKey: "X_KEY",
    model: "x",
    transcribe: () => {
      providerCalled = true;
      return Promise.resolve({ text: "nope", model: "x" });
    },
  };

  const handler = createHandler({
    authorizeFn: ALWAYS_OK,
    supabaseClient: stub.client as never,
    resolveProviderFn: () => provider,
    getApiKeyFn: () => undefined,
  });

  const res = await handler(
    new Request("https://x.test/backfill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dryRun: true }),
    }),
  );

  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.processed, 1);
  assertEquals(json.dryRun, true);
  assertEquals(json.candidates.length, 1);
  assertEquals(json.candidates[0].id, "note-1");
  assertEquals(providerCalled, false);
  assertEquals(stub.updates.length, 0);
});

Deno.test("transcribes candidates and writes back to report_notes.body", async () => {
  const stub = makeClientStub({
    rows: [
      {
        id: "note-1",
        file_id: "file-1",
        project_id: "proj-1",
        body: null,
        file_metadata: {
          bucket: "project-files",
          storage_path: "p/note-1.m4a",
          mime_type: "audio/m4a",
          filename: "note-1.m4a",
        },
      },
      {
        id: "note-2",
        file_id: "file-2",
        project_id: "proj-1",
        body: "",
        file_metadata: {
          bucket: "project-files",
          storage_path: "p/note-2.m4a",
          mime_type: "audio/m4a",
          filename: "note-2.m4a",
        },
      },
    ],
    storage: {
      "project-files": {
        "p/note-1.m4a": new Uint8Array([1, 2, 3]),
        "p/note-2.m4a": new Uint8Array([4, 5, 6]),
      },
    },
  });

  const provider = makeProvider(["hello world", "second transcript"]);

  const handler = createHandler({
    authorizeFn: ALWAYS_OK,
    supabaseClient: stub.client as never,
    resolveProviderFn: () => provider,
    getApiKeyFn: () => "key-123",
  });

  const res = await handler(
    new Request("https://x.test/backfill", { method: "POST" }),
  );
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.processed, 2);
  assertEquals(json.succeeded, 2);
  assertEquals(json.failed, 0);
  assertEquals(stub.updates, [
    { id: "note-1", body: "hello world" },
    { id: "note-2", body: "second transcript" },
  ]);
  assertEquals(stub.downloads.length, 2);
});

Deno.test("records per-row failures without aborting the batch", async () => {
  const stub = makeClientStub({
    rows: [
      {
        id: "note-1",
        file_id: "file-1",
        project_id: "proj-1",
        body: null,
        file_metadata: {
          bucket: "project-files",
          storage_path: "p/note-1.m4a",
          mime_type: "audio/m4a",
          filename: "note-1.m4a",
        },
      },
      {
        id: "note-missing-file",
        file_id: "file-x",
        project_id: "proj-1",
        body: null,
        file_metadata: null,
      },
    ],
    storage: {
      "project-files": {
        "p/note-1.m4a": new Uint8Array([1, 2, 3]),
      },
    },
  });

  const provider = makeProvider(["only one"]);
  const handler = createHandler({
    authorizeFn: ALWAYS_OK,
    supabaseClient: stub.client as never,
    resolveProviderFn: () => provider,
    getApiKeyFn: () => "key-123",
  });

  const res = await handler(
    new Request("https://x.test/backfill", { method: "POST" }),
  );
  const json = await res.json();
  assertEquals(json.processed, 2);
  assertEquals(json.succeeded, 1);
  assertEquals(json.skipped, 1);
  assertEquals(json.errors[0].noteId, "note-missing-file");
  assertEquals(stub.updates, [{ id: "note-1", body: "only one" }]);
});

Deno.test("returns 503 when provider key is missing (and not a dry run)", async () => {
  const stub = makeClientStub({ rows: [], storage: {} });
  const provider: TranscriptionProvider = {
    id: "x",
    envKey: "MISSING_KEY",
    model: "x",
    transcribe: () => Promise.resolve({ text: "", model: "x" }),
  };

  const handler = createHandler({
    authorizeFn: ALWAYS_OK,
    supabaseClient: stub.client as never,
    resolveProviderFn: () => provider,
    getApiKeyFn: () => undefined,
  });

  const res = await handler(
    new Request("https://x.test/backfill", { method: "POST" }),
  );
  assertEquals(res.status, 503);
});
