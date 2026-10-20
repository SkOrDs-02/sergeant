// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ApiError } from "@sergeant/api-client";
import { AVATAR_MAX_BYTES } from "@sergeant/shared";
import {
  assertAvatarFile,
  avatarUploadErrorCopy,
  compressAvatar,
  resolveAvatarSrc,
} from "./avatar";

describe("assertAvatarFile", () => {
  it("rejects non-image files", () => {
    const file = new File(["x"], "doc.txt", { type: "text/plain" });
    expect(() => assertAvatarFile(file)).toThrow("Обери файл зображення");
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
  let toBlob: ReturnType<typeof vi.fn>;
  let getContextReturn: unknown;

  beforeEach(() => {
    loadHandlers = [];
    errorHandlers = [];
    drawImage = vi.fn();
    toBlob = vi.fn((cb: (b: Blob | null) => void, type: string) =>
      cb(new Blob([new Uint8Array(100)], { type })),
    );
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
          toBlob,
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

  it("resolves with a webp Blob (не data URL) on successful load", async () => {
    const p = compressAvatar(file());
    loadHandlers.forEach((h) => h());
    const blob = await p;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/webp");
    expect(drawImage).toHaveBeenCalled();
    expect(toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/webp",
      0.8,
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });

  it("не влізло в ліміт - перестискає з нижчою якістю, доки не влізе", async () => {
    toBlob.mockImplementationOnce((cb: (b: Blob | null) => void) =>
      cb(
        new Blob([new Uint8Array(AVATAR_MAX_BYTES + 1)], {
          type: "image/webp",
        }),
      ),
    );
    const p = compressAvatar(file());
    loadHandlers.forEach((h) => h());
    const blob = await p;
    expect(blob.size).toBeLessThanOrEqual(AVATAR_MAX_BYTES);
    expect(toBlob).toHaveBeenCalledTimes(2);
    expect(toBlob.mock.calls[1]?.[2]).toBe(0.6);
  });

  it("жодна спроба не влізла - чесна помилка, а не завеликий Blob", async () => {
    toBlob.mockImplementation((cb: (b: Blob | null) => void) =>
      cb(
        new Blob([new Uint8Array(AVATAR_MAX_BYTES + 1)], {
          type: "image/webp",
        }),
      ),
    );
    const p = compressAvatar(file());
    loadHandlers.forEach((h) => h());
    await expect(p).rejects.toThrow("надто деталізоване");
  });

  it("toBlob повернув null - помилка", async () => {
    toBlob.mockImplementation((cb: (b: Blob | null) => void) => cb(null));
    const p = compressAvatar(file());
    loadHandlers.forEach((h) => h());
    await expect(p).rejects.toThrow("Не вдалося обробити зображення");
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

describe("resolveAvatarSrc", () => {
  it("відносний /api/avatar/… привʼязує до API, зовнішні URL лишає як є", () => {
    expect(resolveAvatarSrc("https://lh3.googleusercontent.com/a/x")).toBe(
      "https://lh3.googleusercontent.com/a/x",
    );
    const resolved = resolveAvatarSrc("/api/avatar/u1?v=1");
    expect(resolved).toMatch(/\/api\/v1\/avatar\/u1\?v=1$/);
  });
});

describe("avatarUploadErrorCopy", () => {
  const http = (status: number) =>
    new ApiError({ kind: "http", message: "x", status, url: "/api/avatar" });

  it("413/415/429 - не повторюються тим самим файлом", () => {
    expect(avatarUploadErrorCopy(http(413))).toMatchObject({
      message: expect.stringContaining("завелике"),
      retryable: false,
    });
    expect(avatarUploadErrorCopy(http(415))).toMatchObject({
      message: expect.stringContaining("JPEG, PNG або WebP"),
      retryable: false,
    });
    expect(avatarUploadErrorCopy(http(429)).retryable).toBe(false);
  });

  it("мережа і 5xx - можна повторити", () => {
    const net = new ApiError({ kind: "network", message: "x", url: "/x" });
    expect(avatarUploadErrorCopy(net)).toMatchObject({
      message: expect.stringContaining("зʼєднання"),
      retryable: true,
    });
    expect(avatarUploadErrorCopy(http(500)).retryable).toBe(true);
  });

  it("сирі англійські тексти людині не показуються", () => {
    const copy = avatarUploadErrorCopy(new Error("Canvas context unavailable"));
    expect(copy.message).not.toMatch(/Canvas/);
    expect(copy.retryable).toBe(true);
    expect(
      avatarUploadErrorCopy(new Error("Не вдалося прочитати зображення"))
        .message,
    ).toBe("Не вдалося прочитати зображення");
  });
});
