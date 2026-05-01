import { assertEquals } from "jsr:@std/assert";
import { backfillOne } from "./index.ts";

// Minimal in-memory mock of the bits of SupabaseClient backfillOne uses.
type MockBucket = {
  download: (path: string) => Promise<{ data: Blob | null; error: { message: string } | null }>;
  upload: (
    path: string,
    body: Uint8Array,
    opts: unknown,
  ) => Promise<{ error: { message: string } | null }>;
};

function makeFakeClient(
  bytes: Uint8Array,
  capture: { uploaded?: { path: string; size: number }; updated?: Record<string, unknown> },
) {
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const bucket: MockBucket = {
    download: () => Promise.resolve({
      data: new Blob([arrayBuffer], { type: "image/jpeg" }),
      error: null,
    }),
    upload: (path, body) => {
      capture.uploaded = { path, size: body.byteLength };
      return Promise.resolve({ error: null });
    },
  };
  return {
    storage: { from: () => bucket },
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          capture.updated = patch;
          return { error: null };
        },
      }),
    }),
  } as unknown as Parameters<typeof backfillOne>[0];
}

// 1×1 red JPEG (smallest valid JPEG for imagescript).
const TINY_JPEG_HEX =
  "ffd8ffe000104a46494600010101006000600000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffdb0043010909090c0b0c180d0d1832211c213232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232ffc00011080001000103012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffda000c03010002110311003f00fbfcffd9";

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

Deno.test("backfillOne uploads thumb and updates row", async () => {
  const bytes = hexToBytes(TINY_JPEG_HEX);
  const capture: { uploaded?: { path: string; size: number }; updated?: Record<string, unknown> } = {};
  const client = makeFakeClient(bytes, capture);
  const row = {
    id: "f-1",
    storage_path: "proj/images/f-1.jpg",
    category: "image",
    mime_type: "image/jpeg",
  };
  const { updated } = await backfillOne(client, row, false);
  assertEquals(updated, true);
  assertEquals(capture.uploaded?.path, "proj/images/f-1.jpg.thumb.jpg");
  assertEquals(typeof capture.updated?.width, "number");
  assertEquals(typeof capture.updated?.height, "number");
  assertEquals(capture.updated?.thumbnail_path, "proj/images/f-1.jpg.thumb.jpg");
  // BlurHash is computed from a downscaled copy of the decoded image and
  // recorded alongside the thumbnail. The `null` branch is exercised by
  // the encoder failure path inside backfillOne; on a valid JPEG we
  // expect a non-empty string here.
  assertEquals(typeof capture.updated?.blurhash, "string");
});

Deno.test("backfillOne dryRun skips upload + update", async () => {
  const bytes = hexToBytes(TINY_JPEG_HEX);
  const capture: { uploaded?: { path: string; size: number }; updated?: Record<string, unknown> } = {};
  const client = makeFakeClient(bytes, capture);
  const row = {
    id: "f-2",
    storage_path: "proj/images/f-2.jpg",
    category: "image",
    mime_type: "image/jpeg",
  };
  const { updated } = await backfillOne(client, row, true);
  assertEquals(updated, false);
  assertEquals(capture.uploaded, undefined);
  assertEquals(capture.updated, undefined);
});
