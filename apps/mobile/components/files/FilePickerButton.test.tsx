import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

// ---------------------------------------------------------------------------
// Mocks. The component imports the real DocumentPicker / ImagePicker / hook,
// all of which transitively pull native modules unavailable under Vitest.
// ---------------------------------------------------------------------------
const uploadMutateMock = vi.fn();
const requestMediaLibraryPermissionsAsyncMock = vi.fn();
const launchImageLibraryAsyncMock = vi.fn();
const getDocumentAsyncMock = vi.fn();
const useFileUploadMock = vi.fn();

vi.mock("@/hooks/useProjectFiles", () => ({
  useFileUpload: (...args: unknown[]) => useFileUploadMock(...args),
}));

vi.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: (...a: unknown[]) =>
    requestMediaLibraryPermissionsAsyncMock(...a),
  launchImageLibraryAsync: (...a: unknown[]) =>
    launchImageLibraryAsyncMock(...a),
  MediaTypeOptions: { Images: "Images" },
}));

vi.mock("expo-document-picker", () => ({
  getDocumentAsync: (...a: unknown[]) => getDocumentAsyncMock(...a),
}));

vi.mock("lucide-react-native", () => ({
  Plus: () => React.createElement("PlusStub"),
}));

vi.mock("react-native", () => {
  const mk = (name: string) =>
    function Stub(props: Record<string, unknown> & { children?: React.ReactNode }) {
      return React.createElement(name, props as object, props.children ?? null);
    };
  return {
    View: mk("View"),
    Text: mk("Text"),
    Pressable: mk("Pressable"),
    ActivityIndicator: mk("ActivityIndicator"),
  };
});

vi.mock("@/components/ui/Button", () => ({
  Button: function Button(
    props: { onPress?: () => void; disabled?: boolean; children?: React.ReactNode },
  ) {
    return React.createElement(
      "Button",
      { onPress: props.onPress, disabled: props.disabled },
      props.children ?? null,
    );
  },
}));

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  useFileUploadMock.mockReturnValue({
    mutate: uploadMutateMock,
    isPending: false,
    error: null,
  });
});

afterEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

async function renderAndPress(category: "document" | "image") {
  const { FilePickerButton } = await import("./FilePickerButton");
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(FilePickerButton, {
        projectId: "p-1",
        reportId: null,
        category,
      }),
    );
  });
  const button = renderer.root.findByType("Button" as never) as unknown as {
    props: { onPress: () => Promise<void> };
  };
  await act(async () => {
    await button.props.onPress();
  });
  return renderer;
}

describe("FilePickerButton — image branch", () => {
  it("uploads the picked image with sane defaults when filename/mime/size are missing", async () => {
    requestMediaLibraryPermissionsAsyncMock.mockResolvedValue({ granted: true });
    launchImageLibraryAsyncMock.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/photo.jpg" }],
    });

    await renderAndPress("image");

    expect(uploadMutateMock).toHaveBeenCalledTimes(1);
    const arg = uploadMutateMock.mock.calls[0]![0];
    expect(arg.projectId).toBe("p-1");
    expect(arg.category).toBe("image");
    expect(arg.fileUri).toBe("file:///tmp/photo.jpg");
    // Defaults applied when ImagePicker omits these fields.
    expect(arg.filename).toMatch(/^image-\d+\.jpg$/);
    expect(arg.mimeType).toBe("image/jpeg");
    expect(arg.sizeBytes).toBe(0);
  });

  it("does not upload when permission is denied (and surfaces the error)", async () => {
    requestMediaLibraryPermissionsAsyncMock.mockResolvedValue({ granted: false });

    const renderer = await renderAndPress("image");

    expect(launchImageLibraryAsyncMock).not.toHaveBeenCalled();
    expect(uploadMutateMock).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer.toJSON())).toContain(
      "Photo library permission denied",
    );
  });

  it("does nothing when the user cancels the picker", async () => {
    requestMediaLibraryPermissionsAsyncMock.mockResolvedValue({ granted: true });
    launchImageLibraryAsyncMock.mockResolvedValue({ canceled: true, assets: [] });

    await renderAndPress("image");

    expect(uploadMutateMock).not.toHaveBeenCalled();
  });
});

describe("FilePickerButton — document branch", () => {
  it("uploads the picked document with the asset's filename, mime and size", async () => {
    getDocumentAsyncMock.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///tmp/spec.pdf",
          name: "spec.pdf",
          mimeType: "application/pdf",
          size: 12345,
        },
      ],
    });

    await renderAndPress("document");

    expect(getDocumentAsyncMock).toHaveBeenCalledWith({
      copyToCacheDirectory: true,
      multiple: false,
    });
    expect(uploadMutateMock).toHaveBeenCalledTimes(1);
    const arg = uploadMutateMock.mock.calls[0]![0];
    expect(arg).toMatchObject({
      projectId: "p-1",
      category: "document",
      fileUri: "file:///tmp/spec.pdf",
      filename: "spec.pdf",
      mimeType: "application/pdf",
      sizeBytes: 12345,
    });
  });

  it("falls back to application/octet-stream when the picker omits mimeType", async () => {
    getDocumentAsyncMock.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/x", name: "x", size: 1 }],
    });

    await renderAndPress("document");

    const arg = uploadMutateMock.mock.calls[0]![0];
    expect(arg.mimeType).toBe("application/octet-stream");
  });

  it("does nothing when the document picker is cancelled", async () => {
    getDocumentAsyncMock.mockResolvedValue({ canceled: true, assets: [] });

    await renderAndPress("document");

    expect(uploadMutateMock).not.toHaveBeenCalled();
  });
});

describe("FilePickerButton — error surfacing", () => {
  it("renders the upload mutation's error message", async () => {
    useFileUploadMock.mockReturnValue({
      mutate: uploadMutateMock,
      isPending: false,
      error: new Error("File too large"),
    });
    const { FilePickerButton } = await import("./FilePickerButton");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(FilePickerButton, {
          projectId: "p-1",
          category: "document",
        }),
      );
    });

    expect(JSON.stringify(renderer.toJSON())).toContain("File too large");
  });

  it("disables the button while uploading", async () => {
    useFileUploadMock.mockReturnValue({
      mutate: uploadMutateMock,
      isPending: true,
      error: null,
    });
    const { FilePickerButton } = await import("./FilePickerButton");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(FilePickerButton, {
          projectId: "p-1",
          category: "document",
        }),
      );
    });

    const button = renderer.root.findByType("Button" as never) as unknown as {
      props: { disabled: boolean };
    };
    expect(button.props.disabled).toBe(true);
    expect(JSON.stringify(renderer.toJSON())).toContain("Uploading");
  });
});
