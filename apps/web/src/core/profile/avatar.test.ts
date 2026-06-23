// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { assertAvatarFile, compressAvatar } from "./avatar";

describe("assertAvatarFile", () => {
  it("rejects non-image files", () => {
    const file = new File(["x"], "doc.txt", { type: "text/plain" });
    expect(() => assertAvatarFile(file)).toThrow("Оберіть файл зображення");
  });

  it("rejects files larger than 5 MB", () => {
    const big = new File([new Uint8Array(1)], "big.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 6 * 1024 * 1024 });
    expect(() => assertAvatarFile(big)).toThrow("завелике");
  });

  it("accepts a small image file", () => {
    const file = new File(["x"], "a.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 1024 });
    expect(() => assertAvatarFile(file)).not.toThrow();
  });
});

describe("compressAvatar", () => {
  let loadHandlers: Array<() => void>;
  let errorHandlers: Array<() => void>;
  let drawImage: ReturnType<typeof vi.fn>;
  let toDataURL: ReturnType<typeof vi.fn>;
  let getContextReturn: unknown;

  beforeEach(() => {
    loadHandlers = [];
    errorHandlers = [];
    drawImage = vi.fn();
    toDataURL = vi.fn(() => "data:image/webp;base64,AAAA");
    getContextReturn = { drawImage };

    vi.stubGlobal(
      "Image",
      class {
        width = 200;
        height = 100;
        _src = "";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_v: string) {
          this._src = _v;
        }
        get src() {
          return this._src;
        }
        constructor() {
          // register so the test can trigger load/error
          loadHandlers.push(() => this.onload?.());
          errorHandlers.push(() => this.onerror?.());
        }
      } as unknown as typeof Image,
    );

    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();

    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: vi.fn(() => getContextReturn),
          toDataURL,
        } as unknown as HTMLCanvasElement;
      }
      return realCreateElement(tag);
    }) as typeof document.createElement);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function file() {
    return new File(["x"], "a.png", { type: "image/png" });
  }

  it("resolves with a webp data URL on successful load", async () => {
    const p = compressAvatar(file());
    loadHandlers.forEach((h) => h());
    await expect(p).resolves.toBe("data:image/webp;base64,AAAA");
    expect(drawImage).toHaveBeenCalled();
    expect(toDataURL).toHaveBeenCalledWith("image/webp", 0.8);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });

  it("rejects when the canvas 2d context is unavailable", async () => {
    getContextReturn = null;
    const p = compressAvatar(file());
    loadHandlers.forEach((h) => h());
    await expect(p).rejects.toThrow("Canvas context unavailable");
  });

  it("rejects when the image fails to load", async () => {
    const p = compressAvatar(file());
    errorHandlers.forEach((h) => h());
    await expect(p).rejects.toThrow("Не вдалося прочитати зображення");
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});
