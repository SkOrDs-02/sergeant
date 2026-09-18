import { inflateRawSync } from "node:zlib";

/**
 * Мінімальний ридер ZIP-контейнера для `xlsxGrid.ts` (XLSX - це ZIP з
 * XML-частинами всередині).
 *
 * НАВМИСНО без залежності: `node:zlib` уже несе `inflateRawSync`, а решта
 * формату - це читання двох структур із буфера. Той самий підхід, що
 * `csvParser.ts` (власний CSV-токенайзер замість papaparse) і
 * `receipts/dpsXml.ts` (власний XML-ридер) - цільовий парсер під один
 * відомий вхід замість універсальної бібліотеки з власною CVE-поверхнею.
 *
 * Підтримується потрібна підмножина XLSX-архівів: не-Zip64 архів,
 * метод 0 (stored) і 8 (deflate). Zip64 і
 * шифровані записи відкидаються явною помилкою, а не тихим сміттям.
 */

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/** Максимальний розмір EOCD-коментаря за специфікацією (u16) + сам EOCD. */
const MAX_EOCD_SCAN = 0xffff + 22;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

/** Кап на розпакований розмір ОДНІЄЇ частини - захист від zip-бомби. */
const MAX_ENTRY_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;

export class ZipFormatError extends Error {}

export interface ZipEntries {
  /** Імʼя частини (`xl/workbook.xml`) → сирі байти. */
  get(name: string): Buffer | undefined;
  has(name: string): boolean;
  names(): string[];
}

interface CentralEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  flags: number;
}

function findEocdOffset(buf: Buffer): number {
  const start = Math.max(0, buf.length - MAX_EOCD_SCAN);
  for (let i = buf.length - 22; i >= start; i -= 1) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

function readCentralDirectory(buf: Buffer): CentralEntry[] {
  const eocd = findEocdOffset(buf);
  if (eocd === -1) throw new ZipFormatError("ZIP: не знайдено EOCD");

  const totalEntries = buf.readUInt16LE(eocd + 10);
  const centralOffset = buf.readUInt32LE(eocd + 16);
  if (totalEntries === 0xffff || centralOffset === 0xffffffff) {
    throw new ZipFormatError("ZIP: Zip64 не підтримується");
  }

  const entries: CentralEntry[] = [];
  let p = centralOffset;
  for (let i = 0; i < totalEntries; i += 1) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CENTRAL) {
      throw new ZipFormatError("ZIP: пошкоджений центральний каталог");
    }
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    // Імена частин OOXML — завжди ASCII-шлях; utf8-декод безпечний і для
    // прапорця 0x800, і без нього.
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      flags,
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntryBytes(buf: Buffer, entry: CentralEntry): Buffer {
  // Біт 0 прапорців — шифрування. Такий XLSX (файл під паролем) не
  // прочитати без ключа; краще чесна помилка, ніж інфлейт сміття.
  if ((entry.flags & 0x1) !== 0) {
    throw new ZipFormatError("ZIP: запис зашифровано");
  }
  if (entry.uncompressedSize > MAX_ENTRY_UNCOMPRESSED_BYTES) {
    throw new ZipFormatError("ZIP: частина завелика");
  }

  const lo = entry.localHeaderOffset;
  if (lo + 30 > buf.length || buf.readUInt32LE(lo) !== SIG_LOCAL) {
    throw new ZipFormatError("ZIP: пошкоджений локальний заголовок");
  }
  // Довжини імені/extra беремо саме з ЛОКАЛЬНОГО заголовка: вони легально
  // відрізняються від центральних (різні extra-поля), і зсув даних
  // рахується тільки від них.
  const nameLen = buf.readUInt16LE(lo + 26);
  const extraLen = buf.readUInt16LE(lo + 28);
  const dataStart = lo + 30 + nameLen + extraLen;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buf.length) {
    throw new ZipFormatError("ZIP: дані запису виходять за межі файлу");
  }
  const raw = buf.subarray(dataStart, dataEnd);

  if (entry.method === METHOD_STORED) return Buffer.from(raw);
  if (entry.method === METHOD_DEFLATE) {
    return inflateRawSync(raw, {
      maxOutputLength: MAX_ENTRY_UNCOMPRESSED_BYTES,
    });
  }
  throw new ZipFormatError(`ZIP: метод стиснення ${entry.method}`);
}

/** Чи починається буфер із локального ZIP-заголовка (`PK\x03\x04`). */
export function looksLikeZip(buf: Buffer): boolean {
  return buf.length >= 4 && buf.readUInt32LE(0) === SIG_LOCAL;
}

/**
 * Читає центральний каталог одразу, а самі частини — ліниво (і кешує):
 * XLSX несе десятки записів, з яких потрібні 4-5, і розпаковувати
 * мініатюри/теми задарма немає сенсу.
 */
export function readZip(buf: Buffer): ZipEntries {
  const central = readCentralDirectory(buf);
  const byName = new Map<string, CentralEntry>();
  for (const e of central) byName.set(e.name, e);
  const cache = new Map<string, Buffer>();

  return {
    get(name) {
      const cached = cache.get(name);
      if (cached) return cached;
      const entry = byName.get(name);
      if (!entry) return undefined;
      const bytes = readEntryBytes(buf, entry);
      cache.set(name, bytes);
      return bytes;
    },
    has(name) {
      return byName.has(name);
    },
    names() {
      return [...byName.keys()];
    },
  };
}
