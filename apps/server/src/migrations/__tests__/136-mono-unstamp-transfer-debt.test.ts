// Migration 136 — зняття мітки «Борги та кредити» з переказів card-to-card.
//
// Статичний тест тієї ж природи, що й `130-pantry-item-sources.test.ts`:
// реальний прогін up → down → up покриває `rollback-sanity.test.ts`, а тут
// перевіряється НАМІР, який відбиток схеми не ловить взагалі — бо ця
// міграція схему не чіпає, а виправляє дані. Помилка в її WHERE тиха: вона
// не падає, вона мовчки стирає категорію там, де не мала.

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { MCC_CATEGORIES } from "@sergeant/finyk-domain/constants";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");
const UP = path.join(MIGRATIONS_DIR, "136_mono_unstamp_transfer_debt.sql");
const DOWN = path.join(
  MIGRATIONS_DIR,
  "136_mono_unstamp_transfer_debt.down.sql",
);

let up = "";
let down = "";

beforeAll(async () => {
  up = await fs.readFile(UP, "utf8");
  down = await fs.readFile(DOWN, "utf8");
});

/** SQL без коментарів — щоб слова з преамбули не ламали перевірки. */
function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("136 — межі UPDATE", () => {
  it("чіпає лише mono_transaction і лише category_slug", () => {
    const body = statementsOnly(up);
    const tables = [...body.matchAll(/UPDATE\s+(\w+)/gi)].map((m) => m[1]);
    expect(new Set(tables)).toEqual(new Set(["mono_transaction"]));
    expect(body).toMatch(/SET\s+category_slug\s*=\s*NULL/i);
  });

  it("не чіпає ручний вибір людини (`category_overridden`)", () => {
    expect(statementsOnly(up)).toMatch(/category_overridden\s*=\s*FALSE/i);
  });

  it("звужено до 4829 + 'debt' — 6012/6051/6099 лишаються боргом", () => {
    const body = statementsOnly(up);
    expect(body).toMatch(/mcc\s*=\s*4829/i);
    expect(body).toMatch(/category_slug\s*=\s*'debt'/i);
    for (const mcc of [6012, 6051, 6099]) {
      expect(body).not.toContain(String(mcc));
    }
  });

  it("щадить погашення, яке має власний доказ в описі", () => {
    // Список слів у SQL мусить збігатись із `keywords` категорії `debt`:
    // розійдуться — і міграція зітре мітку з рядка, який клієнтська
    // евристика тут же поставить назад (мигання категорії між пристроями).
    const debtKeywords =
      MCC_CATEGORIES.find((category) => category.id === "debt")?.keywords ?? [];
    expect(debtKeywords.length).toBeGreaterThan(0);
    const body = statementsOnly(up).toLowerCase();
    for (const keyword of debtKeywords) {
      expect(body).toContain(keyword.toLowerCase());
    }
  });

  it("4829 прибрано з каталогу — інакше вебхук стампне мітку назад", () => {
    const debt = MCC_CATEGORIES.find((category) => category.id === "debt");
    expect(debt?.mccs).not.toContain(4829);
  });

  it("не є DDL: жодного ALTER / DROP / CREATE (Hard Rule #4 не застосовний)", () => {
    const body = statementsOnly(up);
    expect(body).not.toMatch(/\bALTER\b/i);
    expect(body).not.toMatch(/\bDROP\b/i);
    expect(body).not.toMatch(/\bCREATE\b/i);
  });
});

describe("136 — down", () => {
  it("no-op: не відновлює помилкову мітку і не чіпає схему", () => {
    const body = statementsOnly(down);
    expect(body).not.toMatch(/\bUPDATE\b/i);
    expect(body).not.toMatch(/\bALTER\b/i);
    expect(body).not.toMatch(/\bDROP\b/i);
  });
});
