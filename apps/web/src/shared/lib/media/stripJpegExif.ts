/**
 * Last validated: 2026-11-22
 * Status: Active
 *
 * Вирізання сегментів APP1 (EXIF і XMP, обидва можуть нести GPS-координати
 * кадру) з JPEG без canvas і без перекодування: лише байтовий прохід по
 * маркерах до SOS. Потрібне там, де `compressImageFile` перекодування
 * пропускає (малий web-safe файл) або відкидає (перекодований blob не
 * менший, декодер чи canvas недоступні), інакше оригінал з координатами
 * пішов би на сервер і далі AI-провайдеру (priv-21).
 *
 * EXIF-Orientation не губиться: якщо оригінал мав поворот 2..8, замість
 * вирізаного APP1 вставляється мінімальний EXIF з єдиним тегом
 * Orientation (без GPS, дати, моделі камери). Інакше портретне фото чека
 * лягло б у vision-модель боком.
 *
 * `null` = нічого не змінено: не JPEG, APP1 немає або структура маркерів
 * бита (тоді колер лишає оригінал, як і до появи стрипера).
 */

const MARKER_SOI = 0xd8;
const MARKER_EOI = 0xd9;
const MARKER_SOS = 0xda;
export const MARKER_APP1 = 0xe1;
const TAG_ORIENTATION = 0x0112;

async function readBytes(file: Blob): Promise<Uint8Array | null> {
  try {
    if (typeof file.arrayBuffer === "function") {
      return new Uint8Array(await file.arrayBuffer());
    }
    return await new Promise<Uint8Array | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(
          reader.result instanceof ArrayBuffer
            ? new Uint8Array(reader.result)
            : null,
        );
      reader.onerror = () => resolve(null);
      reader.readAsArrayBuffer(file);
    });
  } catch {
    return null;
  }
}

/** Orientation (1..8) з payload-у APP1 "Exif\0\0…", інакше `null`. */
export function readExifOrientation(
  bytes: Uint8Array,
  start: number,
  end: number,
): number | null {
  // "Exif\0\0"
  if (end - start < 14) return null;
  if (
    bytes[start] !== 0x45 ||
    bytes[start + 1] !== 0x78 ||
    bytes[start + 2] !== 0x69 ||
    bytes[start + 3] !== 0x66 ||
    bytes[start + 4] !== 0 ||
    bytes[start + 5] !== 0
  ) {
    return null;
  }
  const tiff = start + 6;
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49; // "II"
  const big = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d; // "MM"
  if (!little && !big) return null;
  const u16 = (p: number): number | null => {
    if (p < tiff || p + 2 > end) return null;
    const a = bytes[p] ?? 0;
    const b = bytes[p + 1] ?? 0;
    return little ? a | (b << 8) : (a << 8) | b;
  };
  const u32 = (p: number): number | null => {
    const hi = little ? u16(p + 2) : u16(p);
    const lo = little ? u16(p) : u16(p + 2);
    if (hi === null || lo === null) return null;
    return hi * 0x10000 + lo;
  };
  const ifdOffset = u32(tiff + 4);
  if (ifdOffset === null) return null;
  const ifd = tiff + ifdOffset;
  const count = u16(ifd);
  if (count === null) return null;
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    const tag = u16(entry);
    if (tag === null) return null;
    if (tag !== TAG_ORIENTATION) continue;
    if (u16(entry + 2) !== 3) return null; // SHORT
    const value = u16(entry + 8);
    return value !== null && value >= 1 && value <= 8 ? value : null;
  }
  return null;
}

/** Мінімальний APP1-сегмент: big-endian TIFF з одним тегом Orientation. */
function orientationSegment(orientation: number): Uint8Array {
  // prettier-ignore
  return new Uint8Array([
    0xff, MARKER_APP1, 0x00, 0x22, // маркер + довжина 34
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // "MM*", IFD0 @ 8
    0x00, 0x01, // 1 запис
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, // Orientation, SHORT, 1
    0x00, orientation, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, // наступного IFD немає
  ]);
}

/**
 * Байти JPEG без APP1-сегментів або `null`, якщо вирізати нічого або
 * структура маркерів бита.
 */
export function stripJpegApp1(
  bytes: Uint8Array,
): Uint8Array<ArrayBuffer> | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== MARKER_SOI) {
    return null;
  }
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let stripped = false;
  let orientation: number | null = null;
  let insertAt = -1;
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    let m = i + 1;
    while (m < bytes.length && bytes[m] === 0xff) m++; // fill-байти
    if (m >= bytes.length) return null;
    const marker = bytes[m] ?? 0;
    if (marker === MARKER_SOS || marker === MARKER_EOI) {
      kept.push(bytes.subarray(i));
      break;
    }
    // Маркери без довжини: TEM і RSTn.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      kept.push(bytes.subarray(i, m + 1));
      i = m + 1;
      continue;
    }
    if (m + 2 >= bytes.length) return null;
    const len = ((bytes[m + 1] ?? 0) << 8) | (bytes[m + 2] ?? 0);
    const end = m + 1 + len;
    if (len < 2 || end > bytes.length) return null;
    if (marker === MARKER_APP1) {
      orientation ??= readExifOrientation(bytes, m + 3, end);
      if (insertAt < 0) insertAt = kept.length;
      stripped = true;
    } else {
      kept.push(bytes.subarray(i, end));
    }
    i = end;
  }
  if (!stripped) return null;
  if (orientation !== null && orientation !== 1) {
    kept.splice(insertAt, 0, orientationSegment(orientation));
  }
  const total = kept.reduce((n, part) => n + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of kept) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** JPEG-файл без EXIF/XMP або `null` (не JPEG, вирізати нічого, битий). */
export async function stripJpegExif(file: File): Promise<File | null> {
  if (file.type !== "image/jpeg" && file.type !== "image/jpg") return null;
  const bytes = await readBytes(file);
  if (!bytes) return null;
  const out = stripJpegApp1(bytes);
  if (!out) return null;
  return new File([out], file.name || "photo.jpg", {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}
