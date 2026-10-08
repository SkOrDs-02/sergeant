import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render } from "../entry-server";
import { ROUTE_META } from "./pageMeta";

/**
 * Гейт свіжості дат: текст сторінки не змінюється без нового `lastmod`.
 *
 * `lastmod` іде в sitemap, у видиму «Оновлено» і в `dateModified` розмітки.
 * Аудит сайту 2026-10-08 (S5, T4) застав його застиглим на 14-21 вересня на
 * сторінках, які правили до 1 жовтня, зокрема на /privacy, /terms і /stan,
 * де дата редакції входить у зміст. Git тут не допомагає: репо переїхало
 * одним комітом 2026-09-30, тож історія файлів починається з тієї дати.
 * Рішення власника: гейт за хешем тексту.
 *
 * Хешується текст `<main>` пререндеру разом із title і description, без
 * самих дат (`<time>`), шапки і підвалу: правка навігації не вимагає
 * оновлювати тридцять дат. Збережені значення лежать у
 * `contentHashes.json` поруч.
 *
 * Змінив текст сторінки – підніми її `lastmod` у `routeMeta.json`, потім
 * перезапиши хеші:
 *
 *   pnpm --filter @sergeant/landing content:hashes
 */
const HASHES_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "contentHashes.json",
);

type Stored = Record<string, { lastmod: string; hash: string }>;

function mainText(html: string): string {
  const main = html.match(/<main[^>]*>([\s\S]*)<\/main>/)?.[1] ?? "";
  return main
    .replace(/<time[^>]*>[\s\S]*?<\/time>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const current: Stored = {};
for (const [route, meta] of Object.entries(ROUTE_META)) {
  if (!("lastmod" in meta) || !meta.lastmod) continue;
  const { html } = render(route, "https://sergeant.com.ua");
  const hash = createHash("sha256")
    .update(`${meta.title}\n${meta.description}\n${mainText(html)}`)
    .digest("hex")
    .slice(0, 16);
  current[route] = { lastmod: meta.lastmod, hash };
}

if (process.env["UPDATE_CONTENT_HASHES"]) {
  writeFileSync(HASHES_FILE, `${JSON.stringify(current, null, 2)}\n`);
}

// Друга правка того самого дня: дата вже сьогоднішня, піднімати нікуди.
const today = new Date().toLocaleDateString("sv-SE", {
  timeZone: "Europe/Kyiv",
});

const stored: Stored = existsSync(HASHES_FILE)
  ? (JSON.parse(readFileSync(HASHES_FILE, "utf8")) as Stored)
  : {};

describe("дата «Оновлено» йде за текстом сторінки", () => {
  for (const [route, now] of Object.entries(current)) {
    it(route, () => {
      const was = stored[route];
      expect(
        was,
        `${route}: немає збереженого хешу, перезапиши contentHashes.json`,
      ).toBeDefined();
      if (!was) return;
      if (was.hash !== now.hash && now.lastmod !== today) {
        expect(
          now.lastmod,
          `${route}: текст змінився, а lastmod лишився ${was.lastmod}. Підніми lastmod у routeMeta.json і перезапиши хеші`,
        ).not.toBe(was.lastmod);
      }
      expect(
        { lastmod: now.lastmod, hash: now.hash },
        `${route}: перезапиши хеші: pnpm --filter @sergeant/landing content:hashes`,
      ).toEqual(was);
    });
  }
});
