import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROUTE_META } from "./lib/pageMeta";
import { STATUS_UPDATED } from "./pages/StanPage";

/**
 * Гейт узгодженості копії між сторінками. Аудит сайту 2026-09-01 знайшов,
 * що чотири сторінки обіцяли експорт «в один клік», а чотири інші чесно
 * казали, що єдиної кнопки немає, і обидві версії жили на сайті водночас.
 * Для продукту, чия головна теза – чесність, це найдорожча з можливих
 * помилок, і оком рецензента вона не ловиться: сторінки правлять поодинці.
 */
const SRC = path.dirname(fileURLToPath(import.meta.url));

function sourceFiles(): string[] {
  const out: string[] = [];
  for (const dir of ["pages", "components", "content"]) {
    for (const name of readdirSync(path.join(SRC, dir))) {
      if (/\.test\.tsx?$/.test(name)) continue;
      if (/\.tsx?$/.test(name)) out.push(path.join(SRC, dir, name));
    }
  }
  return out;
}

function read(file: string): string {
  return readFileSync(path.join(SRC, file), "utf8");
}

describe("узгодженість копії між сторінками", () => {
  it("«один клік» не стоїть в одному рядку зі словом «експорт»", () => {
    const hits: string[] = [];
    for (const file of sourceFiles()) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (
            /експорт|вивантаж/i.test(line) &&
            /один клік|одним кліком/i.test(line)
          ) {
            hits.push(`${path.relative(SRC, file)}:${i + 1}`);
          }
        });
    }
    expect(hits).toEqual([]);
  });

  it("сторінки, що обіцяють експорт, беруть формулу з одного джерела", () => {
    for (const file of [
      "pages/BetaPage.tsx",
      "pages/TermsPage.tsx",
      "pages/PrivacyPage.tsx",
      "pages/GuideBankBezpekaPage.tsx",
    ]) {
      expect(read(file), file).toMatch(/EXPORT_CLAIM/);
    }
  });

  it("підписи впевненості на головній – лише з канонічної шкали", () => {
    for (const file of ["pages/HomePage.tsx", "components/HomeSections.tsx"]) {
      const src = read(file);
      expect(src, file).not.toMatch(
        /закономірність тримається|впевненість висока/,
      );
      expect(src, file).toMatch(/CONFIDENCE\./);
    }
  });

  it("дата стану на /stan збігається з lastmod маршруту в sitemap", () => {
    expect(ROUTE_META["/stan"].lastmod).toBe(STATUS_UPDATED);
  });
});
