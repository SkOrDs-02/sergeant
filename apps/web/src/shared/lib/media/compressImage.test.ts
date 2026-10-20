// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMPRESS_MAX_SIDE_PX,
  COMPRESS_SKIP_BELOW_BYTES,
  compressImageFile,
  downscaleFactor,
  shouldAttemptCompression,
} from "./compressImage";

describe("shouldAttemptCompression", () => {
  it("не чіпає малий web-safe файл (перекодування = лише втрата якості)", () => {
    expect(
      shouldAttemptCompression({ size: 200_000, type: "image/jpeg" }),
    ).toBe(false);
    expect(
      shouldAttemptCompression({
        size: COMPRESS_SKIP_BELOW_BYTES,
        type: "image/png",
      }),
    ).toBe(false);
  });

  it("стискає великий web-safe файл", () => {
    expect(
      shouldAttemptCompression({ size: 5_000_000, type: "image/jpeg" }),
    ).toBe(true);
    expect(
      shouldAttemptCompression({
        size: COMPRESS_SKIP_BELOW_BYTES + 1,
        type: "image/webp",
      }),
    ).toBe(true);
  });

  it("нормалізує не-web-safe формат (HEIC) незалежно від розміру", () => {
    expect(shouldAttemptCompression({ size: 100, type: "image/heic" })).toBe(
      true,
    );
    expect(shouldAttemptCompression({ size: 100, type: "image/tiff" })).toBe(
      true,
    );
  });

  it("ігнорує не-зображення і порожній тип", () => {
    expect(
      shouldAttemptCompression({ size: 9_000_000, type: "application/pdf" }),
    ).toBe(false);
    expect(shouldAttemptCompression({ size: 9_000_000, type: "" })).toBe(false);
  });
});

describe("downscaleFactor", () => {
  it("масштабує довшу сторону рівно до ліміту", () => {
    expect(downscaleFactor(4096, 3072)).toBeCloseTo(
      COMPRESS_MAX_SIDE_PX / 4096,
    );
    expect(downscaleFactor(1000, 4096)).toBeCloseTo(
      COMPRESS_MAX_SIDE_PX / 4096,
    );
  });

  it("ніколи не збільшує (масштаб ≤ 1) і терпить сміттєві розміри", () => {
    expect(downscaleFactor(800, 600)).toBe(1);
    expect(downscaleFactor(COMPRESS_MAX_SIDE_PX, 10)).toBe(1);
    expect(downscaleFactor(0, 0)).toBe(1);
    expect(downscaleFactor(Number.NaN, 100)).toBe(1);
  });
});

describe("compressImageFile — graceful fallback", () => {
  it("повертає null у середовищі без робочого декодера/canvas (jsdom) — колер лишає оригінал", async () => {
    const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.jpg", {
      type: "image/jpeg",
    });
    await expect(compressImageFile(big)).resolves.toBeNull();
  });

  it("повертає null для малого web-safe файлу без спроби декодування", async () => {
    const small = new File([new Uint8Array(10)], "small.jpg", {
      type: "image/jpeg",
    });
    await expect(compressImageFile(small)).resolves.toBeNull();
  });
});

describe("compressImageFile — decoded image paths", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function installCanvas(blob: Blob | null) {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(blob),
    );
    return drawImage;
  }

  it("downscales and normalizes the image, then closes the bitmap", async () => {
    const drawImage = installCanvas(
      new Blob(["jpeg bytes"], { type: "image/jpeg" }),
    );
    const close = vi.fn();
    const createBitmap = vi.fn().mockResolvedValue({
      width: 4096,
      height: 2048,
      close,
    });
    vi.stubGlobal("createImageBitmap", createBitmap);
    const original = new File([new Uint8Array(6_000_000)], "receipt.scan", {
      type: "image/heic",
    });

    const result = await compressImageFile(original);

    expect(createBitmap).toHaveBeenCalledWith(original, {
      imageOrientation: "from-image",
    });
    expect(drawImage).toHaveBeenCalledWith(
      expect.any(Object),
      0,
      0,
      2048,
      1024,
    );
    expect(result).toBeInstanceOf(File);
    expect(result).toMatchObject({ name: "receipt.jpg", type: "image/jpeg" });
    expect(close).toHaveBeenCalledOnce();
  });

  it("retries bitmap decoding without orientation options for older Safari", async () => {
    installCanvas(new Blob(["jpeg"]));
    const createBitmap = vi
      .fn()
      .mockRejectedValueOnce(new Error("options unsupported"))
      .mockResolvedValueOnce({ width: 600, height: 400, close: vi.fn() });
    vi.stubGlobal("createImageBitmap", createBitmap);
    const original = new File([new Uint8Array(2_000_000)], "photo.png", {
      type: "image/png",
    });

    const result = await compressImageFile(original);

    expect(createBitmap).toHaveBeenNthCalledWith(1, original, {
      imageOrientation: "from-image",
    });
    expect(createBitmap).toHaveBeenNthCalledWith(2, original);
    expect(result?.name).toBe("photo.jpg");
  });

  it("falls back to an img decoder and releases its object URL", async () => {
    installCanvas(new Blob(["jpeg"]));
    vi.stubGlobal("createImageBitmap", undefined);
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:photo");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL");
    class FakeImage {
      naturalWidth = 800;
      naturalHeight = 600;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const original = new File([new Uint8Array(2_000_000)], "camera.jpg", {
      type: "image/jpeg",
    });

    const result = await compressImageFile(original);

    expect(result?.name).toBe("camera.jpg");
    expect(createObjectURL).toHaveBeenCalledWith(original);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:photo");
  });

  it("falls back to the original when the img decoder errors", async () => {
    installCanvas(new Blob(["jpeg"]));
    vi.stubGlobal("createImageBitmap", undefined);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:broken");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL");
    class BrokenImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("Image", BrokenImage);
    const original = new File([new Uint8Array(2_000_000)], "broken.jpg", {
      type: "image/jpeg",
    });

    await expect(compressImageFile(original)).resolves.toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:broken");
  });

  it.each([
    [0, 400],
    [400, 0],
  ])(
    "keeps the original when decoded dimensions are invalid (%i × %i)",
    async (width, height) => {
      installCanvas(new Blob(["jpeg"]));
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn().mockResolvedValue({ width, height, close: vi.fn() }),
      );
      const original = new File([new Uint8Array(2_000_000)], "photo.jpg", {
        type: "image/jpeg",
      });

      await expect(compressImageFile(original)).resolves.toBeNull();
    },
  );

  it("keeps the original if canvas encoding fails or returns an empty blob", async () => {
    const original = new File([new Uint8Array(2_000_000)], "photo.jpg", {
      type: "image/jpeg",
    });
    installCanvas(null);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 800, height: 600, close: vi.fn() }),
    );

    await expect(compressImageFile(original)).resolves.toBeNull();
  });

  it("keeps a web-safe original when re-encoding does not shrink it", async () => {
    installCanvas(
      new Blob([new Uint8Array(2_000_000)], { type: "image/jpeg" }),
    );
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 800, height: 600, close: vi.fn() }),
    );
    const original = new File([new Uint8Array(2_000_000)], "photo.jpg", {
      type: "image/jpeg",
    });

    await expect(compressImageFile(original)).resolves.toBeNull();
  });

  it("keeps the original when no 2D context can be created", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const createBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createBitmap);
    const original = new File([new Uint8Array(2_000_000)], "photo.jpg", {
      type: "image/jpeg",
    });

    await expect(compressImageFile(original)).resolves.toBeNull();
    expect(createBitmap).not.toHaveBeenCalled();
  });
});
