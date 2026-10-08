/**
 * Іконки сайту з `public/icon.svg`: `apple-touch-icon.png` (180×180) і
 * `favicon.ico` (16 і 32 px).
 *
 * Джерело одне – SVG зі знаком з личками на папері, той самий знак, що в
 * шапці (`src/components/Wordmark.tsx`). До 2026-10-08 іконки показували
 * смарагдову «S» попереднього напряму, а в `apple-touch-icon` були прозорі
 * кути, які iOS заливає чорним (аудит сайту 2026-10-08, V12). Фон тут
 * суцільний: округлення кутів робить сама система.
 *
 * Запуск: `node scripts/generate-icons.mjs` з `apps/landing` після зміни SVG.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, "..", "public");
const svg = readFileSync(path.join(pub, "icon.svg"), "utf8");

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function render(size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  return page.screenshot({ type: "png", omitBackground: false });
}

writeFileSync(path.join(pub, "apple-touch-icon.png"), await render(180));

// ICO з PNG усередині (так читають усі сучасні браузери): заголовок,
// по запису на розмір і самі PNG підряд.
const images = [await render(16), await render(32)];
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = 6 + 16 * images.length;
const entries = images.map((png, i) => {
  const size = i === 0 ? 16 : 32;
  const e = Buffer.alloc(16);
  e.writeUInt8(size, 0);
  e.writeUInt8(size, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += png.length;
  return e;
});
writeFileSync(
  path.join(pub, "favicon.ico"),
  Buffer.concat([header, ...entries, ...images]),
);

await browser.close();
console.log("apple-touch-icon.png, favicon.ico written");
