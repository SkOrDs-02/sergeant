/**
 * M6 — server-side magic-byte validation for nutrition photo endpoints.
 *
 * Контекст:
 * `apps/server/src/modules/nutrition/{analyze,refine}-photo.ts` отримують
 * `image_base64` + клієнтський `mime_type` і кидають це у Anthropic
 * `messages.create({ source: { type: "base64", media_type, data } })` без
 * перевірки. Без серверної перевірки magic-байтів зловмисник може:
 *
 * - Назвати polyglot SVG як `image/jpeg` і покластися на Anthropic
 *   preprocessing — той розпарсить як SVG.
 * - Надіслати inflated PNG: 50 MB на дискі → сотні MB після decode.
 * - Надіслати довільні байти, що з'їдають parser-budget Anthropic.
 *
 * Рішення (M6):
 * 1. Декодуємо base64 на сервері до буфера.
 * 2. Перевіряємо перші 8–12 байт проти таблиці підписів (JPEG/PNG/WebP/HEIC).
 * 3. Відмовляємо `415 Unsupported Media Type` на mismatch і `413 Payload Too
 *    Large` на decoded size > 5 MB.
 * 4. Повертаємо канонічний `mediaType` (визначений за magic-байтами, а не за
 *    клієнтським header-ом) для подальшого передачі Anthropic-у — клієнт не
 *    керує тим, що піде в `source.media_type`.
 *
 * `validateImageBase64` — чиста функція; HTTP-статус і JSON відповідь
 * вибирає викликач (handler), щоб логіка тестувалася без mock-у `Response`.
 *
 * See `docs/security/hardening/M6-image-magic-byte-check.md`.
 */

/** Жорсткий cap на decoded-розмір зображення. */
export const MAX_DECODED_BYTES = 5 * 1024 * 1024;

/**
 * MIME-типи, дозволені для nutrition photo endpoints. WebP і HEIC — обидва
 * нативні для сучасних мобільних браузерів (Android Chrome → WebP, iOS Safari
 * → HEIC), JPEG/PNG — універсальні. GIF свідомо виключений: анімація
 * нерелевантна нутрієнт-аналізу та подвоює parser-budget Anthropic-у.
 */
export const ALLOWED_PHOTO_MIMES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

export type ValidateImageError =
  | { ok: false; code: "INVALID_BASE64"; detail: string }
  | {
      ok: false;
      code: "TOO_LARGE";
      detail: string;
      sizeBytes: number;
      maxBytes: number;
    }
  | { ok: false; code: "TRUNCATED"; detail: string; sizeBytes: number }
  | {
      ok: false;
      code: "MAGIC_MISMATCH";
      detail: string;
      declaredMime: string;
      detectedMime: string | null;
    };

export type ValidateImageOk = {
  ok: true;
  mimeType: string;
  sizeBytes: number;
};

export type ValidateImageResult = ValidateImageOk | ValidateImageError;

/**
 * Розпізнає канонічний MIME за першими 12 байтами буфера. Повертає `null`,
 * якщо жоден підпис не збігся. Порядок перевірок важливий: HEIC/HEIF мають
 * `ftyp`-бокс по зміщенню 4, тому перевіряти його треба ДО загальніших
 * сигнатур (JPEG-FFD8 на байтах 0-2 збігу не дає, а от PNG/WebP мають
 * фіксовані префікси 0..8/0..12).
 */
export function detectImageMime(bytes: Uint8Array): string | null {
  // JPEG: FF D8 FF
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // WebP: "RIFF" (0..3) + 4-byte size + "WEBP" (8..11)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  // HEIC/HEIF: bytes 4..7 == "ftyp", brand at 8..11.
  // Brand variants, які реально приходять з iOS-камер:
  //   heic, heix, hevc, hevx, mif1, msf1, heim, heis, hevm, hevs.
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(
      bytes[8]!,
      bytes[9]!,
      bytes[10]!,
      bytes[11]!,
    ).toLowerCase();
    if (
      brand.startsWith("hei") ||
      brand.startsWith("hev") ||
      brand === "mif1" ||
      brand === "msf1"
    ) {
      return "image/heic";
    }
  }
  // GIF (rejected as not in allowlist, but recognise to give a precise
  // diagnostic instead of "no recognised signature").
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  // SVG/HTML polyglot — найчастіше починається з "<" або whitespace+"<".
  // Anthropic може прийняти "image/svg+xml", якщо назвати — поверни маркер,
  // щоб handler видав 415 з конкретним повідомленням.
  if (bytes.length >= 1 && bytes[0] === 0x3c) {
    return "text/xml";
  }
  return null;
}

/**
 * Декодує + валідує base64 image-payload. Повертає `{ ok: true, mimeType,
 * sizeBytes }`, якщо все добре, інакше — структуровану помилку. Викликач
 * вирішує HTTP-статус (415 для MAGIC_MISMATCH/INVALID_BASE64/TRUNCATED,
 * 413 для TOO_LARGE).
 *
 * Аргумент `declaredMime` — необов'язковий: якщо `undefined`, повертаємо
 * успіх лише при детектованому MIME з allowlist; якщо ж вказаний, він
 * повинен збігатися з detected (case-insensitive, без `; charset=...`).
 */
export function validateImageBase64(
  input: string,
  declaredMime: string | undefined,
  opts: { maxBytes?: number; allowedMimes?: ReadonlySet<string> } = {},
): ValidateImageResult {
  const maxBytes = opts.maxBytes ?? MAX_DECODED_BYTES;
  const allowed = opts.allowedMimes ?? ALLOWED_PHOTO_MIMES;
  const declaredNormalised = declaredMime
    ? declaredMime!.toLowerCase().split(";")[0]!.trim()
    : "";

  // Buffer.from з некоректним base64 не кидає (повертає буфер на основі
  // того, що змогло розпарсити), тому перевіряємо явно: рядок зі здоровим
  // base64 має лише [A-Za-z0-9+/=]/whitespace.
  if (!/^[A-Za-z0-9+/=\s]*$/.test(input)) {
    return {
      ok: false,
      code: "INVALID_BASE64",
      detail: "Input contains characters outside the base64 alphabet",
    };
  }

  const buf = Buffer.from(input, "base64");
  if (buf.length === 0) {
    return {
      ok: false,
      code: "INVALID_BASE64",
      detail: "Empty buffer after base64 decode",
    };
  }
  if (buf.length > maxBytes) {
    return {
      ok: false,
      code: "TOO_LARGE",
      detail: `Decoded image is ${buf.length} bytes; max allowed ${maxBytes}`,
      sizeBytes: buf.length,
      maxBytes,
    };
  }
  if (buf.length < 12) {
    return {
      ok: false,
      code: "TRUNCATED",
      detail: `Decoded image is ${buf.length} bytes; need ≥12 bytes for magic-byte check`,
      sizeBytes: buf.length,
    };
  }

  const detectedMime = detectImageMime(buf);
  if (detectedMime === null) {
    return {
      ok: false,
      code: "MAGIC_MISMATCH",
      detail: "No recognised image signature in first 12 bytes",
      declaredMime: declaredNormalised || "(unset)",
      detectedMime: null,
    };
  }
  if (!allowed.has(detectedMime)) {
    return {
      ok: false,
      code: "MAGIC_MISMATCH",
      detail: `Detected ${detectedMime}, but only ${[...allowed].join(", ")} are allowed`,
      declaredMime: declaredNormalised || "(unset)",
      detectedMime,
    };
  }
  if (declaredNormalised && declaredNormalised !== detectedMime) {
    return {
      ok: false,
      code: "MAGIC_MISMATCH",
      detail: `Declared ${declaredNormalised}, detected ${detectedMime}`,
      declaredMime: declaredNormalised,
      detectedMime,
    };
  }
  return { ok: true, mimeType: detectedMime, sizeBytes: buf.length };
}
