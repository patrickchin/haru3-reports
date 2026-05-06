import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

// ---------------------------------------------------------------------------
// AvatarUploader was previously untested. The same class of bug that hit
// `btn-camera-capture` (silent failure when a native API is mis-configured
// or a permission is denied) lives here too: tap → ImagePicker → upload.
// These press-and-invoke tests lock down the contract end-to-end.
// ---------------------------------------------------------------------------

const requestMediaLibraryPermissionsAsyncMock = vi.fn();
const launchImageLibraryAsyncMock = vi.fn();
const manipulateAsyncMock = vi.fn();
const getInfoAsyncMock = vi.fn();
const readAsStringAsyncMock = vi.fn();
const uploadAvatarMock = vi.fn();
const updateProfileMock = vi.fn();

vi.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: (...a: unknown[]) =>
    requestMediaLibraryPermissionsAsyncMock(...a),
  launchImageLibraryAsync: (...a: unknown[]) =>
    launchImageLibraryAsyncMock(...a),
  MediaTypeOptions: { Images: "Images" },
}));

vi.mock("expo-image-manipulator", () => ({
  manipulateAsync: (...a: unknown[]) => manipulateAsyncMock(...a),
  SaveFormat: { JPEG: "jpeg" },
}));

vi.mock("expo-file-system/legacy", () => ({
  getInfoAsync: (...a: unknown[]) => getInfoAsyncMock(...a),
  readAsStringAsync: (...a: unknown[]) => readAsStringAsyncMock(...a),
  EncodingType: { Base64: "base64" },
}));

vi.mock("@/lib/backend", () => ({ backend: { id: "backend-stub" } }));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    profile: { id: "user-1", full_name: "Pat", avatar_url: null },
    updateProfile: updateProfileMock,
  }),
}));

vi.mock("@/lib/file-upload", () => ({
  uploadAvatar: (...a: unknown[]) => uploadAvatarMock(...a),
}));

vi.mock("@/components/ui/CachedImage", () => ({
  CachedImage: function CachedImage(props: Record<string, unknown>) {
    return React.createElement("CachedImage", props as object, null);
  },
}));

vi.mock("@/lib/design-tokens/colors", () => ({
  colors: { foreground: "#000" },
}));

vi.mock("react-native", () => {
  const mk = (name: string) =>
    function Stub(
      props: Record<string, unknown> & { children?: React.ReactNode },
    ) {
      return React.createElement(name, props as object, props.children ?? null);
    };
  return {
    View: mk("View"),
    Text: mk("Text"),
    Pressable: mk("Pressable"),
    ActivityIndicator: mk("ActivityIndicator"),
  };
});

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();

  // Sane happy-path defaults; individual tests override what they care about.
  requestMediaLibraryPermissionsAsyncMock.mockResolvedValue({ granted: true });
  launchImageLibraryAsyncMock.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///tmp/picked.jpg" }],
  });
  manipulateAsyncMock.mockResolvedValue({ uri: "file:///tmp/compressed.jpg" });
  getInfoAsyncMock.mockResolvedValue({ exists: true, size: 4096 });
  // Tiny well-formed base64 so `atob`/`Buffer` decoding doesn't throw.
  readAsStringAsyncMock.mockResolvedValue("AAEC");
  uploadAvatarMock.mockResolvedValue({
    publicUrl: "https://cdn.example.com/avatars/user-1/avatar.jpg",
  });
  updateProfileMock.mockResolvedValue(undefined);
});

afterEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

async function renderAndPressAvatar() {
  const { AvatarUploader } = await import("./AvatarUploader");
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(AvatarUploader));
  });
  const btn = renderer.root.findByProps({ testID: "btn-avatar-upload" });
  await act(async () => {
    await (btn.props as { onPress: () => Promise<void> }).onPress();
  });
  // Flush the chain of awaits inside `handlePick`.
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return renderer;
}

function renderedText(renderer: TestRenderer.ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

describe("AvatarUploader", () => {
  it("picks → compresses → uploads → updates the profile avatar URL on the happy path", async () => {
    await renderAndPressAvatar();

    expect(requestMediaLibraryPermissionsAsyncMock).toHaveBeenCalledOnce();
    expect(launchImageLibraryAsyncMock).toHaveBeenCalledOnce();
    expect(manipulateAsyncMock).toHaveBeenCalledWith(
      "file:///tmp/picked.jpg",
      [{ resize: { width: 512, height: 512 } }],
      expect.objectContaining({ compress: 0.85, format: "jpeg" }),
    );

    expect(uploadAvatarMock).toHaveBeenCalledOnce();
    const arg = uploadAvatarMock.mock.calls[0]![0];
    expect(arg).toMatchObject({
      userId: "user-1",
      filename: "avatar.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 4096,
    });
    expect(arg.body).toBeInstanceOf(Uint8Array);

    expect(updateProfileMock).toHaveBeenCalledOnce();
    const profileUpdate = updateProfileMock.mock.calls[0]![0] as {
      avatar_url: string;
    };
    // Cache-busted with `?v=<timestamp>` so the new avatar shows immediately.
    expect(profileUpdate.avatar_url).toMatch(
      /^https:\/\/cdn\.example\.com\/avatars\/user-1\/avatar\.jpg\?v=\d+$/,
    );
  });

  it("does not upload and surfaces an error when photo-library permission is denied", async () => {
    requestMediaLibraryPermissionsAsyncMock.mockResolvedValue({ granted: false });

    const renderer = await renderAndPressAvatar();

    expect(launchImageLibraryAsyncMock).not.toHaveBeenCalled();
    expect(uploadAvatarMock).not.toHaveBeenCalled();
    expect(updateProfileMock).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain("Photo library permission denied");
  });

  it("does nothing when the user cancels the picker (no upload, no error message)", async () => {
    launchImageLibraryAsyncMock.mockResolvedValue({
      canceled: true,
      assets: [],
    });

    const renderer = await renderAndPressAvatar();

    expect(uploadAvatarMock).not.toHaveBeenCalled();
    expect(updateProfileMock).not.toHaveBeenCalled();
    expect(renderedText(renderer)).not.toContain("permission denied");
  });

  it("surfaces a user-visible error when the upload throws (instead of swallowing it)", async () => {
    uploadAvatarMock.mockRejectedValueOnce(new Error("S3 boom"));

    const renderer = await renderAndPressAvatar();

    expect(uploadAvatarMock).toHaveBeenCalledOnce();
    expect(updateProfileMock).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain("S3 boom");
  });

  it("surfaces a generic error when image manipulation fails", async () => {
    manipulateAsyncMock.mockRejectedValueOnce(new Error("manipulator dead"));

    const renderer = await renderAndPressAvatar();

    expect(uploadAvatarMock).not.toHaveBeenCalled();
    expect(updateProfileMock).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain("manipulator dead");
  });
});
