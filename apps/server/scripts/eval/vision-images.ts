/**
 * Зображення для зорового стенду — намальовані програмно, не завантажені.
 *
 * AI-DANGER: це НЕ фотографії їжі. Це синтетичні PNG (плоскі заливки, диски,
 * растровий шрифт 3×5), і жодна модель не «впізнає» на них справжню страву.
 * Тому судді у `vision.ts` міряють НЕ впізнавання, а рівно те, що синтетика
 * вимірює чесно:
 *
 *   * структуру — чи вижила відповідь у `normalizePhotoResult` (прод-парсер);
 *   * OCR — чи прочитано текст, який ми самі й намалювали (числа етикетки);
 *   * стриманість — чи модель НЕ вигадала КБЖВ там, де дивитись нема на що.
 *
 * Замінити на реальні фото можна будь-коли: судді від джерела картинки не
 * залежать, міняється лише цей файл. Мережею нічого не тягнемо навмисно —
 * стенд має відтворюватись без зовнішніх ресурсів.
 */

import { deflateSync } from "node:zlib";

// ── PNG-енкодер ─────────────────────────────────────────────────────
// Мінімальний, лише truecolor 8-bit без інтерлейсу. Прод його не бачить:
// файл живе у scripts/ і потрібен тільки стенду.

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (const byte of buf)
    c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

export interface Canvas {
  width: number;
  height: number;
  /** RGB, 3 байти на піксель. */
  px: Uint8Array;
}

export type Rgb = readonly [number, number, number];

function canvas(width: number, height: number, bg: Rgb): Canvas {
  const px = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    px[i * 3] = bg[0];
    px[i * 3 + 1] = bg[1];
    px[i * 3 + 2] = bg[2];
  }
  return { width, height, px };
}

function setPx(c: Canvas, x: number, y: number, rgb: Rgb): void {
  if (x < 0 || y < 0 || x >= c.width || y >= c.height) return;
  const i = (y * c.width + x) * 3;
  c.px[i] = rgb[0];
  c.px[i + 1] = rgb[1];
  c.px[i + 2] = rgb[2];
}

function rect(
  c: Canvas,
  x0: number,
  y0: number,
  w: number,
  h: number,
  rgb: Rgb,
): void {
  for (let y = y0; y < y0 + h; y += 1)
    for (let x = x0; x < x0 + w; x += 1) setPx(c, x, y, rgb);
}

function disc(c: Canvas, cx: number, cy: number, r: number, rgb: Rgb): void {
  for (let y = cy - r; y <= cy + r; y += 1)
    for (let x = cx - r; x <= cx + r; x += 1)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) setPx(c, x, y, rgb);
}

/**
 * Box-blur радіусом `radius`, `passes` проходів. Роздільний (спершу по X,
 * потім по Y) — квадратне ядро на цих розмірах рахувалося б секундами, а
 * радіус тут мусить бути великим: штрих шрифту 6 px, і слабке розмиття
 * лишало б текст читабельним, тобто кейс «розмите фото» міряв би не ту пастку.
 */
function blur(c: Canvas, radius: number, passes: number): void {
  for (let p = 0; p < passes; p += 1) {
    for (const horizontal of [true, false]) {
      const src = Uint8Array.from(c.px);
      for (let y = 0; y < c.height; y += 1) {
        for (let x = 0; x < c.width; x += 1) {
          for (let ch = 0; ch < 3; ch += 1) {
            let sum = 0;
            let n = 0;
            for (let d = -radius; d <= radius; d += 1) {
              const nx = horizontal ? x + d : x;
              const ny = horizontal ? y : y + d;
              if (nx < 0 || ny < 0 || nx >= c.width || ny >= c.height) continue;
              sum += src[(ny * c.width + nx) * 3 + ch] as number;
              n += 1;
            }
            c.px[(y * c.width + x) * 3 + ch] = Math.round(sum / n);
          }
        }
      }
    }
  }
}

export function encodePngBase64(c: Canvas): string {
  const raw = Buffer.alloc(c.height * (1 + c.width * 3));
  for (let y = 0; y < c.height; y += 1) {
    const rowStart = y * (1 + c.width * 3);
    raw[rowStart] = 0; // filter: None
    Buffer.from(c.px.subarray(y * c.width * 3, (y + 1) * c.width * 3)).copy(
      raw,
      rowStart + 1,
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.width, 0);
  ihdr.writeUInt32BE(c.height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}

// ── Растровий шрифт 3×5 ─────────────────────────────────────────────
// Латиниця навмисно: кейс-пастка — етикетка ІНОЗЕМНОЮ, і кирилиця тут була б
// не потрібна. Символи поза таблицею малюються як пробіл.

export const FONT: Record<string, readonly string[]> = {
  A: [".#.", "#.#", "###", "#.#", "#.#"],
  B: ["##.", "#.#", "##.", "#.#", "##."],
  C: [".##", "#..", "#..", "#..", ".##"],
  D: ["##.", "#.#", "#.#", "#.#", "##."],
  E: ["###", "#..", "##.", "#..", "###"],
  F: ["###", "#..", "##.", "#..", "#.."],
  G: [".##", "#..", "#.#", "#.#", ".##"],
  H: ["#.#", "#.#", "###", "#.#", "#.#"],
  I: ["###", ".#.", ".#.", ".#.", "###"],
  J: ["..#", "..#", "..#", "#.#", ".#."],
  K: ["#.#", "#.#", "##.", "#.#", "#.#"],
  L: ["#..", "#..", "#..", "#..", "###"],
  M: ["#.#", "###", "###", "#.#", "#.#"],
  N: ["#.#", "##.", "###", ".##", "#.#"],
  O: [".#.", "#.#", "#.#", "#.#", ".#."],
  P: ["##.", "#.#", "##.", "#..", "#.."],
  Q: [".#.", "#.#", "#.#", "##.", ".##"],
  R: ["##.", "#.#", "##.", "#.#", "#.#"],
  S: [".##", "#..", ".#.", "..#", "##."],
  T: ["###", ".#.", ".#.", ".#.", ".#."],
  U: ["#.#", "#.#", "#.#", "#.#", ".#."],
  V: ["#.#", "#.#", "#.#", ".#.", ".#."],
  W: ["#.#", "#.#", "###", "###", "#.#"],
  X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
  Y: ["#.#", "#.#", ".#.", ".#.", ".#."],
  Z: ["###", "..#", ".#.", "#..", "###"],
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["##.", "..#", ".#.", "#..", "###"],
  "3": ["##.", "..#", ".#.", "..#", "##."],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "##.", "..#", "##."],
  "6": [".##", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", ".#.", ".#.", ".#."],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "##."],
  "%": ["#.#", "..#", ".#.", "#..", "#.#"],
  ",": ["...", "...", "...", ".#.", "#.."],
  ".": ["...", "...", "...", "...", ".#."],
  "-": ["...", "...", "###", "...", "..."],
  " ": ["...", "...", "...", "...", "..."],
};

function drawText(
  c: Canvas,
  text: string,
  x0: number,
  y0: number,
  scale: number,
  rgb: Rgb,
): void {
  let cursor = x0;
  for (const ch of text.toUpperCase()) {
    const glyph = FONT[ch] ?? (FONT[" "] as readonly string[]);
    glyph.forEach((row, rowIndex) => {
      for (let col = 0; col < row.length; col += 1) {
        if (row[col] !== "#") continue;
        rect(c, cursor + col * scale, y0 + rowIndex * scale, scale, scale, rgb);
      }
    });
    cursor += 4 * scale;
  }
}

// ── Голден-зображення ───────────────────────────────────────────────

const W = 320;
const H = 240;
const INK: Rgb = [24, 24, 28];

/** Етикетка іноземною — числа тут ЄДИНЕ, що суддя може перевірити обʼєктивно. */
function labelCanvas(): Canvas {
  const c = canvas(W, H, [246, 246, 240]);
  rect(c, 12, 12, W - 24, H - 24, [255, 255, 255]);
  rect(c, 12, 12, W - 24, 6, [20, 90, 180]);
  drawText(c, "VOLLMILCH", 24, 50, 6, INK);
  drawText(c, "3,5% FETT", 24, 110, 6, INK);
  drawText(c, "950 ML", 24, 170, 6, INK);
  return c;
}

export const LABEL_PNG_B64 = encodePngBase64(labelCanvas());

export const BLURRED_PNG_B64 = (() => {
  const c = labelCanvas();
  // Радіус 12 × 3 проходи — текст перестає читатись, силует лишається. Саме
  // тут слабка модель починає вигадувати впевнені КБЖВ замість питання.
  blur(c, 12, 3);
  return encodePngBase64(c);
})();

export const MULTI_DISH_PNG_B64 = (() => {
  const c = canvas(W, H, [235, 232, 226]);
  disc(c, 160, 120, 105, [252, 252, 250]);
  disc(c, 110, 100, 42, [86, 140, 52]); // «зелене»
  disc(c, 205, 95, 38, [214, 132, 40]); // «помаранчеве»
  disc(c, 160, 175, 40, [128, 78, 44]); // «коричневе»
  return encodePngBase64(c);
})();

export const EMPTY_PNG_B64 = (() => {
  const c = canvas(W, H, [178, 178, 178]);
  // Легкий градієнт замість ідеальної заливки: чиста площина інколи ріжеться
  // препроцесингом провайдера, і кейс перестав би доїжджати до моделі.
  for (let y = 0; y < H; y += 1)
    rect(c, 0, y, W, 1, [172 + (y % 8), 172 + (y % 8), 172 + (y % 8)]);
  return encodePngBase64(c);
})();

/**
 * Не-їжа: предмет у кадрі (телефон екраном догори на столі).
 *
 * Синтетика тут чесніша, ніж деінде: щоб провалити кейс, моделі не треба
 * «впізнати кота» — досить не назвати стравою прямокутник із рамкою. Саме на
 * такому кадрі прод і зламався: замість відмови приходили нулі КБЖВ і питання
 * про порцію (див. `resolveIsFood` у `lib/nutritionResponse.ts`).
 */
export const NON_FOOD_PNG_B64 = (() => {
  const c = canvas(W, H, [208, 205, 198]); // «стіл»
  rect(c, 96, 28, 128, 184, [32, 32, 36]); // корпус
  rect(c, 104, 44, 112, 152, [72, 116, 168]); // екран
  rect(c, 140, 34, 40, 4, [96, 96, 104]); // динамік
  disc(c, 160, 204, 6, [96, 96, 104]); // кнопка
  return encodePngBase64(c);
})();

export const PNG_MIME = "image/png";
