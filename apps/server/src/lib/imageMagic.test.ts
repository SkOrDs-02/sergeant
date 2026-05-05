/**
 * Unit tests для `imageMagic.ts` — server-side magic-byte валідатор для
 * `/api/nutrition/{analyze,refine}-photo`. Закриває M6.
 */
import { describe, it, expect } from "vitest";
import {
  detectImageMime,
  validateImageBase64,
  ALLOWED_PHOTO_MIMES,
  MAX_DECODED_BYTES,
} from "./imageMagic.js";

/** 12-байтова JPEG-голівка з корректним маркером SOI + JFIF-app0. */
const JPEG_HEADER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
/** PNG signature + перший chunk (IHDR header, не повний PNG). */
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
/** RIFF header + WEBP signature + 4 байти контенту. */
const WEBP_HEADER = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
/** HEIC: bytes 4..7 = "ftyp", brand "heic". */
const HEIC_HEADER = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
]);
/** HEIF з brand "mif1" (також HEIC family). */
const HEIF_MIF1_HEADER = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31,
]);
/** GIF89a — розпізнається, але поза allowlist. */
const GIF_HEADER = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0,
]);
/** SVG-як-HTML polyglot: починається з '<'. */
const SVG_HEADER = Buffer.from('<svg xmlns="', "utf8");

function asBase64(b: Buffer): string {
  return b.toString("base64");
}

describe("detectImageMime", () => {
  it.each([
    ["JPEG SOI+JFIF", JPEG_HEADER, "image/jpeg"],
    ["PNG signature", PNG_HEADER, "image/png"],
    ["WebP RIFF+WEBP", WEBP_HEADER, "image/webp"],
    ["HEIC ftyp+heic", HEIC_HEADER, "image/heic"],
    ["HEIF ftyp+mif1", HEIF_MIF1_HEADER, "image/heic"],
    ["GIF89a (recognised but not in allowlist)", GIF_HEADER, "image/gif"],
    ["SVG/HTML polyglot ('<' prefix)", SVG_HEADER, "text/xml"],
  ])("розпізнає %s", (_label, bytes, expected) => {
    expect(detectImageMime(bytes)).toBe(expected);
  });

  it("повертає null на невпізнаних байтах", () => {
    expect(
      detectImageMime(
        Buffer.from([0xde, 0xad, 0xbe, 0xef, 0, 0, 0, 0, 0, 0, 0, 0]),
      ),
    ).toBe(null);
  });

  it("повертає null на повністю нульових байтах", () => {
    expect(detectImageMime(Buffer.alloc(20))).toBe(null);
  });

  it("повертає null на занадто короткому буфері (<3 байт)", () => {
    expect(detectImageMime(Buffer.from([0xff, 0xd8]))).toBe(null);
  });
});

describe("validateImageBase64 — happy paths", () => {
  it("JPEG з правильно вказаним mime-type → ok з канонічним image/jpeg", () => {
    // JPEG не вимагає мінімум 12 байт магії, але загальна перевірка довжини потребує ≥12.
    const padded = Buffer.concat([JPEG_HEADER, Buffer.alloc(20)]);
    const r = validateImageBase64(asBase64(padded), "image/jpeg");
    expect(r).toMatchObject({
      ok: true,
      mimeType: "image/jpeg",
      sizeBytes: padded.length,
    });
  });

  it("PNG без вказаного mime-type → ok (mime detected з magic)", () => {
    const padded = Buffer.concat([PNG_HEADER, Buffer.alloc(20)]);
    const r = validateImageBase64(asBase64(padded), undefined);
    expect(r).toMatchObject({ ok: true, mimeType: "image/png" });
  });

  it("WebP з charset-suffix у MIME-header → strip + match", () => {
    const padded = Buffer.concat([WEBP_HEADER, Buffer.alloc(20)]);
    const r = validateImageBase64(
      asBase64(padded),
      "image/webp; charset=binary",
    );
    expect(r).toMatchObject({ ok: true, mimeType: "image/webp" });
  });

  it("HEIC з MIXED CASE mime-type → нормалізує", () => {
    const padded = Buffer.concat([HEIC_HEADER, Buffer.alloc(20)]);
    const r = validateImageBase64(asBase64(padded), "Image/HEIC");
    expect(r).toMatchObject({ ok: true, mimeType: "image/heic" });
  });
});

describe("validateImageBase64 — rejection paths", () => {
  it("PNG bytes, declared as image/jpeg → MAGIC_MISMATCH", () => {
    const padded = Buffer.concat([PNG_HEADER, Buffer.alloc(20)]);
    const r = validateImageBase64(asBase64(padded), "image/jpeg");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("MAGIC_MISMATCH");
      expect(r).toMatchObject({
        declaredMime: "image/jpeg",
        detectedMime: "image/png",
      });
    }
  });

  it("SVG polyglot, declared as image/jpeg → MAGIC_MISMATCH (detected=text/xml)", () => {
    const padded = Buffer.concat([SVG_HEADER, Buffer.alloc(20)]);
    const r = validateImageBase64(asBase64(padded), "image/jpeg");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("MAGIC_MISMATCH");
      expect(r).toMatchObject({ detectedMime: "text/xml" });
    }
  });

  it("GIF (recognised but not in allowlist) → MAGIC_MISMATCH з explicit detail", () => {
    const padded = Buffer.concat([GIF_HEADER, Buffer.alloc(20)]);
    const r = validateImageBase64(asBase64(padded), "image/gif");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("MAGIC_MISMATCH");
      expect(r.detail).toContain("only");
      expect(r).toMatchObject({ detectedMime: "image/gif" });
    }
  });

  it("Truncated payload (8 байтів) → TRUNCATED", () => {
    const tiny = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    const r = validateImageBase64(asBase64(tiny), "image/jpeg");
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "TRUNCATED") {
      expect(r.sizeBytes).toBe(8);
    } else {
      throw new Error(
        `expected TRUNCATED, got ${(r as { code?: string }).code}`,
      );
    }
  });

  it("Decoded > 5 MB → TOO_LARGE", () => {
    const big = Buffer.concat([JPEG_HEADER, Buffer.alloc(MAX_DECODED_BYTES)]);
    const r = validateImageBase64(asBase64(big), "image/jpeg");
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "TOO_LARGE") {
      expect(r.sizeBytes).toBe(big.length);
    } else {
      throw new Error(
        `expected TOO_LARGE, got ${(r as { code?: string }).code}`,
      );
    }
  });

  it("Розпізнані arbitrary bytes без сигнатури → MAGIC_MISMATCH (detectedMime=null)", () => {
    const garbage = Buffer.alloc(32, 0xab);
    const r = validateImageBase64(asBase64(garbage), "image/jpeg");
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "MAGIC_MISMATCH") {
      expect(r.detectedMime).toBe(null);
    } else {
      throw new Error(
        `expected MAGIC_MISMATCH, got ${(r as { code?: string }).code}`,
      );
    }
  });

  it("Не-base64 символи у вході → INVALID_BASE64", () => {
    const r = validateImageBase64("not base64 at all !", "image/jpeg");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("INVALID_BASE64");
    }
  });

  it("Порожній рядок → INVALID_BASE64", () => {
    const r = validateImageBase64("", "image/jpeg");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("INVALID_BASE64");
    }
  });

  it("Custom maxBytes ефективно знижує cap (regression-проти hard-coded 5MB)", () => {
    const padded = Buffer.concat([JPEG_HEADER, Buffer.alloc(1024)]);
    const r = validateImageBase64(asBase64(padded), "image/jpeg", {
      maxBytes: 100,
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "TOO_LARGE") {
      expect(r.maxBytes).toBe(100);
    } else {
      throw new Error(
        `expected TOO_LARGE, got ${(r as { code?: string }).code}`,
      );
    }
  });

  it("Custom allowedMimes зробити вужчим (тільки image/jpeg) ріже PNG", () => {
    const padded = Buffer.concat([PNG_HEADER, Buffer.alloc(20)]);
    const r = validateImageBase64(asBase64(padded), undefined, {
      allowedMimes: new Set(["image/jpeg"]),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("MAGIC_MISMATCH");
      expect(r.detail).toContain("only image/jpeg");
    }
  });
});

describe("ALLOWED_PHOTO_MIMES — invariant", () => {
  it("обмежено саме чотирма канонічними MIME-ами (cardinality сейф для метрик)", () => {
    expect(ALLOWED_PHOTO_MIMES.size).toBe(4);
    expect(ALLOWED_PHOTO_MIMES.has("image/jpeg")).toBe(true);
    expect(ALLOWED_PHOTO_MIMES.has("image/png")).toBe(true);
    expect(ALLOWED_PHOTO_MIMES.has("image/webp")).toBe(true);
    expect(ALLOWED_PHOTO_MIMES.has("image/heic")).toBe(true);
    expect(ALLOWED_PHOTO_MIMES.has("image/gif")).toBe(false);
    expect(ALLOWED_PHOTO_MIMES.has("image/svg+xml")).toBe(false);
  });
});
