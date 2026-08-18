/**
 * Last validated: 2026-08-18
 * Status: Active
 *
 * Клієнтське стиснення фото перед AI-аналізом (чек-скан finyk і КБЖВ-фото
 * nutrition). Фото з сучасних телефонів (12–48MP) регулярно важать
 * 4–6 МБ і впираються в 5MB-ліміт `validateImageBase64`, а «стисни або
 * обери інше» користувачу нема чим виконати прямо в застосунку. Downscale
 * через canvas до ≤2048px по довшій стороні + JPEG 0.85 дає <1.5 МБ
 * практично завжди; для vision-розпізнавання чеків/страв такої
 * роздільності достатньо (друкований текст чека на 2048px читається).
 *
 * Побічні властивості, на які МОЖНА покладатись:
 * - вихід завжди `image/jpeg` → айфонівський HEIC зникає як клас
 *   (Safari декодує HEIC у canvas нативно; Anthropic-fallback vision
 *   HEIC не приймає — після нормалізації питання знімається);
 * - re-encode через canvas відкидає EXIF, включно з GPS-координатами
 *   кадру — privacy-бонус для фото чеків і їжі.
 *
 * `null` = «лишай оригінал»: і коли стискати нема сенсу (малий
 * web-safe файл), і коли декодувати не вдалося (битий файл, формат без
 * підтримки браузером, тестовий jsdom без canvas). Колер у відповідь
 * МУСИТЬ падати назад на оригінальний файл і наявну валідацію
 * розміру/типу — стиснення ніколи не перетворює робочий кейс на помилку.
 */

export const COMPRESS_MAX_SIDE_PX = 2048;
export const COMPRESS_JPEG_QUALITY = 0.85;
/** Нижче цього розміру і у web-safe форматі перекодування не дає виграшу
 * (лише втрату якості від повторного JPEG) — віддаємо оригінал. */
export const COMPRESS_SKIP_BELOW_BYTES = 1_500_000;

const WEB_SAFE_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** Кап на `<img>`-fallback декодування: реальне фото декодується <1с,
 * усе довше — залиплий декодер, і чекати далі означало б завислий UI. */
const DECODE_TIMEOUT_MS = 8_000;

/** Чи є сенс взагалі чіпати файл (рішення ДО декодування). */
export function shouldAttemptCompression(file: {
  size: number;
  type: string;
}): boolean {
  if (!/^image\//.test(file.type || "")) return false;
  // HEIC/HEIF/TIFF тощо — нормалізуємо в JPEG незалежно від розміру.
  if (!WEB_SAFE_TYPES.has(file.type)) return true;
  return file.size > COMPRESS_SKIP_BELOW_BYTES;
}

/** Масштаб довшої сторони до `maxSide`; ніколи не збільшує (≤1). */
export function downscaleFactor(
  width: number,
  height: number,
  maxSide: number = COMPRESS_MAX_SIDE_PX,
): number {
  const longSide = Math.max(width, height);
  if (!Number.isFinite(longSide) || longSide <= 0) return 1;
  return longSide > maxSide ? maxSide / longSide : 1;
}

type Decoded = ImageBitmap | HTMLImageElement;

function decodedWidth(d: Decoded): number {
  return "naturalWidth" in d ? d.naturalWidth : d.width;
}

function decodedHeight(d: Decoded): number {
  return "naturalHeight" in d ? d.naturalHeight : d.height;
}

/**
 * `createImageBitmap` з `imageOrientation: "from-image"` — EXIF-поворот
 * застосовується до пікселів (фото з телефона в портреті інакше лягло б
 * у canvas боком). Старіші Safari кидають на options-аргументі — друга
 * спроба без нього; зовсім без `createImageBitmap` — `<img>`-fallback
 * (браузерний декодер так само застосовує EXIF за замовчуванням).
 */
async function decodeImage(file: File): Promise<Decoded | null> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        /* спробуємо <img> нижче */
      }
    }
  }
  return await new Promise<Decoded | null>((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      let done = false;
      const settle = (value: Decoded | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
        resolve(value);
      };
      // Страховка від середовищ, де <img> не стріляє НІ load, НІ error
      // (залиплий декодер на битому файлі): без таймауту промис завис би
      // вічно і фото ніколи б не відправилось. `settle` виконується лише
      // асинхронно — на момент будь-якого виклику `timer` уже існує.
      const timer = setTimeout(() => settle(null), DECODE_TIMEOUT_MS);
      const img = new Image();
      img.onload = () => settle(img);
      img.onerror = () => settle(null);
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

/**
 * Стискає фото у JPEG ≤2048px по довшій стороні. `null` = лишай
 * оригінал (див. докстрінг модуля — це і skip, і graceful failure).
 */
export async function compressImageFile(file: File): Promise<File | null> {
  if (typeof document === "undefined") return null;
  if (!shouldAttemptCompression(file)) return null;
  // Без робочого 2D-canvas (jsdom у тестах, екзотичні embedded-браузери)
  // декодувати нема сенсу — намалювати все одно не буде куди.
  try {
    if (!document.createElement("canvas").getContext("2d")) return null;
  } catch {
    return null;
  }

  const decoded = await decodeImage(file);
  if (!decoded) return null;
  try {
    const w0 = decodedWidth(decoded);
    const h0 = decodedHeight(decoded);
    if (w0 <= 0 || h0 <= 0) return null;
    const scale = downscaleFactor(w0, h0);
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(decoded, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob(resolve, "image/jpeg", COMPRESS_JPEG_QUALITY);
      } catch {
        resolve(null);
      }
    });
    if (!blob || blob.size === 0) return null;
    // Перекодування нічого не виграло (наприклад, уже оптимальний JPEG
    // трохи над порогом) — оригінал кращий за пере-стиснуту копію.
    if (WEB_SAFE_TYPES.has(file.type) && blob.size >= file.size) return null;

    const base = file.name ? file.name.replace(/\.[^.]+$/, "") : "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } finally {
    if ("close" in decoded) {
      try {
        decoded.close();
      } catch {
        /* ignore */
      }
    }
  }
}
