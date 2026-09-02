/**
 * Status: Active
 *
 * WCAG-AA контракт для чорнильного (текстового) тиру в `global.css`.
 *
 * AI-CONTEXT (2026-09-02): `text-{family}-strong` резолвиться через
 * `--c-{family}-ink` у спільному пресеті. Мобільний `global.css` цих
 * змінних не мав, тож пресет віддавав статичний світлий тир -800, і в
 * темній темі текст статусу та модуля виходив 1.70…2.66:1 — темне по
 * темному. Веб цю половину закрив (`theme.softContrast.test.ts`), а
 * мобільний лишався без змінних І без гейта.
 *
 * Тест читає САМ CSS, а не копію значень: інакше він доводив би лише те,
 * що дві константи в тесті рівні одна одній.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { accentInkHex, statusInkHex } from "@sergeant/design-tokens/tokens";

const css = readFileSync(join(__dirname, "..", "global.css"), "utf8");

function variablesFor(selector: string): Record<string, string> {
  const values: Record<string, string> = {};
  const block = new RegExp(
    `(?:^|\\n)\\s*${selector}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`,
    "g",
  );
  for (const match of css.matchAll(block)) {
    for (const variable of match[1]!.matchAll(
      /--([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g,
    )) {
      values[variable[1]!] = `${variable[2]} ${variable[3]} ${variable[4]}`;
    }
  }
  return values;
}

function luminance(triplet: string): number {
  const linear = triplet
    .split(/\s+/)
    .map(Number)
    .map((channel) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(foreground: string, background: string): number {
  const fg = luminance(foreground);
  const bg = luminance(background);
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
}

function hexToTriple(hex: string): string {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");
}

const root = variablesFor(":root");
const dark = { ...root, ...variablesFor("\\.dark") };
const FAMILIES = [
  "success",
  "warning",
  "danger",
  "info",
  "brand",
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
] as const;

describe("global.css — чорнильний тир", () => {
  for (const [theme, variables] of Object.entries({ light: root, dark })) {
    for (const family of FAMILIES) {
      for (const surface of ["c-bg", "c-panel", "c-panel-hi"] as const) {
        it(`${theme}: c-${family}-ink на ${surface} ≥ 4.5:1`, () => {
          const foreground = variables[`c-${family}-ink`];
          const background = variables[surface];
          expect(foreground).toBeDefined();
          expect(background).toBeDefined();
          expect(contrast(foreground!, background!)).toBeGreaterThanOrEqual(
            4.5,
          );
        });
      }
    }
  }

  // Значення темного тиру мусять збігатися з пакетом токенів, а не жити
  // тут окремою копією — саме розбіжність копії з джерелом колись лишила
  // `warning-strong` на 4.21 під підписом «4.83».
  const inkHex: Record<string, string> = { ...statusInkHex, ...accentInkHex };
  for (const family of FAMILIES) {
    it(`dark: c-${family}-ink дзеркалить пакет токенів`, () => {
      expect(dark[`c-${family}-ink`]).toBe(hexToTriple(inkHex[family]!));
    });
  }
});
