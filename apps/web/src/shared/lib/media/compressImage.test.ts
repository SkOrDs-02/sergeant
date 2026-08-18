// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
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
