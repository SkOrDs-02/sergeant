/**
 * Status: Active
 *
 * Ранній сигнал на те, щоб рідер SQLite-кешу Фініка не повернувся на
 * критичний шлях.
 *
 * AI-CONTEXT (2026-10-08): `useActivationV2Boot.ts` монтується в
 * `RootLayout` (eager) і читає з кешу Фініка лише `budgets.length` та
 * `refreshedAt`. Статичний імпорт `modules/finyk/lib/sqliteReader` тягнув
 * до першого екрана сам рідер, `finyk-domain/lib/merchantRules` +
 * `recurringDetect` і `finyk-domain/constants` — разом ~6 kB brotli з
 * 277.9 kB при ліміті 268. Стан кешу винесено в легкий
 * `sqliteCacheState.ts`, і eager-код імпортує звідти.
 *
 * AI-DANGER: ФАКТ міряє лише `scripts/ci/check-eager-bundle.mjs`; цей тест
 * бачить тільки перелічені файли (див. також `uk.core.eagerImports.test.ts`).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

/** Рідер Фініка — аліасом або відносним шляхом, з `.js` чи без. */
const FINYK_READER =
  /from\s+["'](?:@finyk|(?:\.{1,2}\/)+(?:modules\/finyk))\/lib\/sqliteReader(?:\.js)?["']/;

describe("рідер SQLite Фініка не на критичному шляху", () => {
  it("useActivationV2Boot читає кеш із легкого sqliteCacheState", () => {
    const src = read("./useActivationV2Boot.ts");
    expect(src).not.toMatch(FINYK_READER);
    expect(src).toMatch(/modules\/finyk\/lib\/sqliteCacheState["']/);
  });

  it("sqliteCacheState має лише type-імпорти (інакше ребро повертається)", () => {
    const src = read("../../modules/finyk/lib/sqliteCacheState.ts");
    const runtimeImports = src
      .split("\n")
      .filter((l) => /^import\s/.test(l) && !/^import\s+type\s/.test(l));
    expect(runtimeImports).toEqual([]);
  });

  it("регекс ловить обидві форми шляху", () => {
    expect(`import { x } from "../../modules/finyk/lib/sqliteReader";`).toMatch(
      FINYK_READER,
    );
    expect(`import { x } from "@finyk/lib/sqliteReader";`).toMatch(
      FINYK_READER,
    );
    expect(
      `import { x } from "../../modules/finyk/lib/sqliteCacheState";`,
    ).not.toMatch(FINYK_READER);
  });
});
