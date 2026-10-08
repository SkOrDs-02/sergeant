import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AUTHOR_NAME } from "./content/author";
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

  // Обіцянка «дані не продаються» стояла трьома різними реченнями на трьох
  // сторінках; тепер це одна формула, і сторінки мають брати її з джерела.
  it("обіцянка про непродаж даних береться з одного джерела", () => {
    for (const file of [
      "pages/DataPage.tsx",
      "pages/VyhidPage.tsx",
      "content/faqItems.ts",
      // Гайд про безпеку банку обіцяв «передачі стороннім немає» своїми
      // словами, поза формулою, і суперечив сторінкам про AI-провайдера
      // (аудит сайту 2026-10-08, T1).
      "pages/GuideBankBezpekaPage.tsx",
    ]) {
      const src = read(file);
      expect(src, file).toMatch(/NO_SALE_CLAIM/);
      expect(src, file).not.toMatch(/не продаються і не передаються/);
      expect(src, file).not.toMatch(/передачі стороннім немає/);
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

  // Sunset-зобовʼязання (рішення 2026-09-15): 30 днів попередження. Три
  // сторінки несуть його трьома реченнями, і саме так розʼїжджаються
  // обіцянки, тож строк звіряється тут, а не оком.
  it("строк попередження перед зупинкою однаковий на /vyhid, /obitsyanky і /terms", () => {
    for (const file of [
      "pages/VyhidPage.tsx",
      "pages/ObitsyankyPage.tsx",
      "pages/TermsPage.tsx",
    ]) {
      expect(read(file), file).toMatch(/щонайменше за 30 днів/);
    }
  });

  // «Серія», не «стрік» (рішення 2026-09-15): так каже продукт і сайт.
  // Слово перевіряється в коді сторінок, у меті маршрутів і в llms.txt.
  it("звичкова серія ніде не називається стріком", () => {
    const hits: string[] = [];
    const files = [
      ...sourceFiles(),
      path.join(SRC, "lib", "routeMeta.json"),
      path.join(SRC, "..", "public", "llms.txt"),
    ];
    for (const file of files) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/стрік/i.test(line)) {
            hits.push(`${path.relative(SRC, file)}:${i + 1}`);
          }
        });
    }
    expect(hits).toEqual([]);
  });

  // Формула про CSV живе лише в exportClaim.ts (рішення 2026-09-17, аудит
  // копії §3.1). Після появи кнопки «Завантажити CSV» у профілі формулу
  // виправили, а два рядки-літерали на /vyhid і /stan ще три дні казали
  // «CSV немає»: гейт звіряв сторінки між собою, а не літерал із джерелом.
  // Тепер заперечення поруч зі словом «CSV» поза джерелом формули – помилка.
  it("«CSV» не стоїть поруч із «немає / поки» поза exportClaim.ts", () => {
    const near =
      /CSV[^.!?\n]{0,25}(?:немає|поки)|(?:немає|поки)[^.!?\n]{0,25}CSV/;
    // Регекс мусить ловити рівно ті рядки, з яких почалась ця перевірка.
    expect(near.test("CSV сьогодні немає – це також чесна межа")).toBe(true);
    expect(near.test("локальним бекапом. CSV теж поки немає.")).toBe(true);
    const hits: string[] = [];
    const files = [
      ...sourceFiles().filter(
        (file) => !file.endsWith(path.join("content", "exportClaim.ts")),
      ),
      path.join(SRC, "lib", "routeMeta.json"),
      path.join(SRC, "..", "public", "llms.txt"),
    ];
    for (const file of files) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (near.test(line)) {
            hits.push(`${path.relative(SRC, file)}:${i + 1}`);
          }
        });
    }
    expect(hits).toEqual([]);
  });

  // Імʼя автора (рішення власника 2026-09-15) живе в одному модулі: до того
  // в двадцяти трьох файлах стояла заглушка «Автор Sergeant», і кожна копія
  // була окремим шансом розійтись при наступній правці. Гейт тримає два
  // інваріанти: Article-розмітка бере автора з константи, а самé імʼя ніде
  // не написане літералом повз неї.
  it("автор береться з константи, а не написаний літералом", () => {
    const literal: string[] = [];
    const missing: string[] = [];
    for (const file of sourceFiles()) {
      if (file.endsWith(path.join("content", "author.ts"))) continue;
      const src = readFileSync(file, "utf8");
      if (src.includes(AUTHOR_NAME)) literal.push(path.relative(SRC, file));
      if (/"@type": "Article"/.test(src) && !src.includes("AUTHOR_JSON_LD")) {
        missing.push(path.relative(SRC, file));
      }
    }
    expect(literal).toEqual([]);
    expect(missing).toEqual([]);
  });
});
