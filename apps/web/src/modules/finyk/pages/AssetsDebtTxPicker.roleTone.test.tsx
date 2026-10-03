// @vitest-environment jsdom
/**
 * Last validated: 2026-08-07
 * Status: Active
 *
 * Вартовий рішення Б (власник, 2026-08-07, матеріал
 * `mockups/product/debt-role-colors.html`): підпис ролі фарбується
 * ПАРОЮ класів, а `source` лишається нейтральним.
 *
 * AI-DANGER: обидві помилки тут виглядають як покращення.
 *
 * Перша — «повернути третій колір»: агент побачить сірий підпис серед
 * двох кольорових і «допише пропущене». Але виникнення боргу — це факт,
 * з якого запис починається, а не попередження; третій сигнал додає
 * тривогу на екран, де нічого не зламано.
 *
 * Друга — «спростити до одного класу»: пара `text-X-strong dark:text-X`
 * виглядає надлишковою, поки не згадаєш, що підпис стоїть і на бежевому
 * фоні, і на чорнильному. Один клас неминуче провалить один із ґрунтів —
 * саме так і жили сирі хекси до цієї зміни (2.76:1 у світлій темі).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "AssetsDebtTxPicker.tsx"),
  "utf8",
);

/** Тіло обʼєкта `ROLE_TONE`. */
function roleToneBody(): string {
  const start = SOURCE.indexOf("const ROLE_TONE");
  expect(start, "ROLE_TONE зник із пікера").toBeGreaterThan(-1);
  const end = SOURCE.indexOf("};", start);
  return SOURCE.slice(start, end);
}

describe("ROLE_TONE — межа рішення Б", () => {
  it("payment і increase несуть колір, source лишається нейтральним", () => {
    const body = roleToneBody();
    expect(body).toContain('payment: "text-success-strong dark:text-success"');
    expect(body).toContain('increase: "text-danger-strong dark:text-danger"');
    expect(body).toContain('source: "text-muted"');
  });

  it("source не отримує жодного семантичного кольору", () => {
    const source = roleToneBody()
      .split("\n")
      .find((l) => l.trim().startsWith("source:"));
    expect(source).toBeTruthy();
    for (const token of ["success", "warning", "danger"]) {
      expect(
        source,
        `source отримав ${token} — це повертає третій сигнал на екран`,
      ).not.toContain(token);
    }
  });

  it("кожен кольоровий тон має темну пару", () => {
    for (const line of roleToneBody().split("\n")) {
      if (!/^\s*(payment|increase):/.test(line)) continue;
      expect(
        line,
        "тон без `dark:`-пари провалить один із двох ґрунтів",
      ).toContain("dark:");
    }
  });

  it("домен більше не віддає колір", () => {
    // Пікер мусить брати тон із `ROLE_TONE`, а не з поля, що приїхало
    // з `@sergeant/finyk-domain`.
    expect(SOURCE).not.toContain("style={{ color:");
    expect(SOURCE).toContain("ROLE_TONE[role]");
  });
});
