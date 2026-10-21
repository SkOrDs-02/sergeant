// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compressImageFile } from "./compressImage";

const source = (name = "source.heic") =>
  new File(["input"], name, { type: "image/heic" });
let draw: ReturnType<typeof vi.fn>;
let close: ReturnType<typeof vi.fn>;
let encode: ReturnType<typeof vi.spyOn>;

function bitmap(width = 800, height = 600) {
  const decoded = { width, height, close };
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(decoded));
  return decoded;
}

function imageDecoder(
  mode: "load" | "error" | "hang" = "load",
  width = 800,
  height = 600,
) {
  const create = vi
    .spyOn(URL, "createObjectURL")
    .mockReturnValue("blob:unit-image");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const instances: DecoderImage[] = [];
  class DecoderImage {
    naturalWidth = width;
    naturalHeight = height;
    // Deliberately different: img dimensions must use intrinsic pixels.
    width = 10;
    height = 10;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
      instances.push(this);
    }
    set src(_url: string) {
      if (mode === "load") queueMicrotask(() => this.onload?.());
      if (mode === "error") queueMicrotask(() => this.onerror?.());
    }
  }
  vi.stubGlobal("Image", DecoderImage);
  return { create, revoke, current: () => instances.at(-1)! };
}

beforeEach(() => {
  draw = vi.fn();
  close = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: draw,
  } as unknown as CanvasRenderingContext2D);
  encode = vi
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation((callback) =>
      callback(new Blob(["jpeg"], { type: "image/jpeg" })),
    );
  bitmap();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("compression failures preserve the original and release browser resources", () => {
  it("returns the original-file fallback without a document", async () => {
    vi.stubGlobal("document", undefined);
    await expect(compressImageFile(source())).resolves.toBeNull();
    expect(close).not.toHaveBeenCalled();
  });

  it("does not decode if the capability-probe canvas throws", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(() => {
      throw new Error("context blocked");
    });
    await expect(compressImageFile(source())).resolves.toBeNull();
    expect(decode).not.toHaveBeenCalled();
  });

  it("closes the decoded bitmap when the encoding canvas has no context", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext)
      .mockReturnValueOnce({
        drawImage: draw,
      } as unknown as CanvasRenderingContext2D)
      .mockReturnValueOnce(null);
    await expect(compressImageFile(source())).resolves.toBeNull();
    expect(close).toHaveBeenCalledOnce();
    expect(encode).not.toHaveBeenCalled();
  });

  it("falls back and closes the bitmap if creating the second canvas throws", async () => {
    const create = document.createElement.bind(document);
    let canvases = 0;
    vi.spyOn(document, "createElement").mockImplementation((name, options) => {
      if (name === "canvas" && ++canvases === 2)
        throw new Error("allocation failed");
      return create(name, options);
    });
    await expect(compressImageFile(source())).resolves.toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });

  it("falls back and closes the bitmap after a draw failure", async () => {
    draw.mockImplementation(() => {
      throw new Error("draw failed");
    });
    await expect(compressImageFile(source())).resolves.toBeNull();
    expect(close).toHaveBeenCalledOnce();
    expect(encode).not.toHaveBeenCalled();
  });

  it("does not turn simultaneous drawing and bitmap-close failures into an upload error", async () => {
    draw.mockImplementation(() => {
      throw new Error("draw failed");
    });
    close.mockImplementation(() => {
      throw new Error("already detached");
    });
    await expect(compressImageFile(source())).resolves.toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes the bitmap if the encoder throws synchronously", async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(() => {
      throw new Error("encoder denied");
    });
    await expect(compressImageFile(source())).resolves.toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects an empty encoded blob and releases the decoded pixels", async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(
      (callback) => callback(new Blob([])),
    );
    await expect(compressImageFile(source())).resolves.toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });

  it("returns a valid JPEG even if releasing its bitmap throws", async () => {
    close.mockImplementation(() => {
      throw new Error("close failed");
    });
    await expect(compressImageFile(source())).resolves.toMatchObject({
      name: "source.jpg",
      type: "image/jpeg",
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it("uses the img decoder after both bitmap API variants reject", async () => {
    const decode = vi.fn().mockRejectedValue(new Error("unsupported format"));
    vi.stubGlobal("createImageBitmap", decode);
    const img = imageDecoder();
    await expect(compressImageFile(source())).resolves.toMatchObject({
      type: "image/jpeg",
    });
    expect(decode).toHaveBeenCalledTimes(2);
    expect(img.revoke).toHaveBeenCalledExactlyOnceWith("blob:unit-image");
  });

  it("times out a stalled img decoder and revokes its object URL", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("createImageBitmap", undefined);
    const img = imageDecoder("hang");
    const result = compressImageFile(source());
    await vi.advanceTimersByTimeAsync(8000);
    await expect(result).resolves.toBeNull();
    expect(img.revoke).toHaveBeenCalledExactlyOnceWith("blob:unit-image");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores a late load event after a decoder timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("createImageBitmap", undefined);
    const img = imageDecoder("hang");
    const result = compressImageFile(source());
    await vi.advanceTimersByTimeAsync(8000);
    await expect(result).resolves.toBeNull();
    img.current().onload?.();
    expect(img.revoke).toHaveBeenCalledOnce();
    expect(draw).not.toHaveBeenCalled();
  });

  it("settles an img error only once if a subsequent load event fires", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const img = imageDecoder("error");
    await expect(compressImageFile(source())).resolves.toBeNull();
    img.current().onload?.();
    expect(img.revoke).toHaveBeenCalledOnce();
    expect(encode).not.toHaveBeenCalled();
  });

  it("keeps a decoded result usable if URL revocation itself throws", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const img = imageDecoder();
    img.revoke.mockImplementation(() => {
      throw new Error("revoke blocked");
    });
    await expect(compressImageFile(source())).resolves.toMatchObject({
      name: "source.jpg",
    });
    expect(img.revoke).toHaveBeenCalledOnce();
  });

  it("does not create an Image if allocating its object URL fails", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const img = imageDecoder();
    img.create.mockImplementation(() => {
      throw new Error("URL quota");
    });
    const ctor = vi.fn();
    vi.stubGlobal("Image", ctor);
    await expect(compressImageFile(source())).resolves.toBeNull();
    expect(ctor).not.toHaveBeenCalled();
    expect(img.revoke).not.toHaveBeenCalled();
  });

  it("immediately releases the object URL and timer if Image construction throws", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("createImageBitmap", undefined);
    const img = imageDecoder();
    vi.stubGlobal(
      "Image",
      class {
        constructor() {
          throw new Error("decoder unavailable");
        }
      },
    );
    await expect(compressImageFile(source())).resolves.toBeNull();
    expect(img.revoke).toHaveBeenCalledExactlyOnceWith("blob:unit-image");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("scales intrinsic img pixels rather than its CSS dimensions", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const img = imageDecoder("load", 3072, 4096);
    await compressImageFile(source());
    expect(draw).toHaveBeenCalledWith(img.current(), 0, 0, 1536, 2048);
  });

  it("normalizes a non-web-safe input even if the JPEG is larger", async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(
      (callback) => callback(new Blob([new Uint8Array(100)])),
    );
    const original = source();
    const result = await compressImageFile(original);
    expect(result?.size).toBeGreaterThan(original.size);
    expect(result?.type).toBe("image/jpeg");
  });

  it("gives an unnamed camera blob a usable photo.jpg filename", async () => {
    await expect(compressImageFile(source(""))).resolves.toMatchObject({
      name: "photo.jpg",
      type: "image/jpeg",
    });
  });

  it("keeps a one-pixel strip nonempty when downscaling its long side", async () => {
    const decoded = bitmap(1, 4096);
    await compressImageFile(source());
    expect(draw).toHaveBeenCalledWith(decoded, 0, 0, 1, 2048);
  });

  it("rejects a loaded img with zero intrinsic pixels and revokes its URL", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const img = imageDecoder("load", 0, 100);
    await expect(compressImageFile(source())).resolves.toBeNull();
    expect(img.revoke).toHaveBeenCalledOnce();
    expect(draw).not.toHaveBeenCalled();
  });
});
