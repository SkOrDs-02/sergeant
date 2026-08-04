/**
 * Status: Active
 * WCAG-AA contract for every foreground/background soft-token pair.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8");
const FAMILIES = [
  "brand",
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
  "success",
  "warning",
  "danger",
  "info",
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function variablesFor(selector: string): Record<string, string> {
  const values: Record<string, string> = {};
  const blocks = new RegExp(
    `(?:^|\\n)\\s*${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`,
    "g",
  );
  for (const block of css.matchAll(blocks)) {
    for (const variable of block[1]!.matchAll(
      /--([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g,
    )) {
      values[variable[1]!] = `${variable[2]} ${variable[3]} ${variable[4]}`;
    }
  }
  return values;
}

function luminance(triplet: string): number {
  const [r, g, b] = triplet.split(/\s+/).map(Number);
  const linear = [r!, g!, b!].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(foreground: string, background: string): number {
  const fg = luminance(foreground);
  const bg = luminance(background);
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
}

const root = variablesFor(":root");
const dark = variablesFor(".dark");
const hc = variablesFor("html.hc");
const darkHc = variablesFor("html.hc.dark");
const THEMES = {
  light: root,
  dark: { ...root, ...dark },
  hc: { ...root, ...hc },
  darkHc: { ...root, ...dark, ...hc, ...darkHc },
};

describe("soft design-token contrast", () => {
  for (const [theme, variables] of Object.entries(THEMES)) {
    for (const family of FAMILIES) {
      it(`${theme}: ${family}-soft-fg on ${family}-soft is at least 4.5:1`, () => {
        const foreground = variables[`c-${family}-soft-fg`];
        const background = variables[`c-${family}-soft`];
        expect(foreground).toBeDefined();
        expect(background).toBeDefined();
        expect(contrast(foreground!, background!)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

// Module families that carry a `-soft-hover` token (status colors don't).
const MODULE_FAMILIES = [
  "brand",
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
] as const;

describe("HC text hierarchy vs surfaces is at least 7:1 (AAA contract)", () => {
  for (const scope of ["hc", "darkHc"] as const) {
    const variables = THEMES[scope];
    for (const role of ["c-text", "c-muted", "c-subtle"] as const) {
      for (const surface of ["c-bg", "c-panel"] as const) {
        it(`${scope}: ${role} on ${surface} is at least 7:1`, () => {
          const foreground = variables[role];
          const background = variables[surface];
          expect(foreground).toBeDefined();
          expect(background).toBeDefined();
          expect(contrast(foreground!, background!)).toBeGreaterThanOrEqual(7);
        });
      }
    }
  }
});

describe("accent vs bg contrast is at least 3:1 (all scopes)", () => {
  for (const [theme, variables] of Object.entries(THEMES)) {
    it(`${theme}: c-accent on c-bg is at least 3:1`, () => {
      const foreground = variables["c-accent"];
      const background = variables["c-bg"];
      expect(foreground).toBeDefined();
      expect(background).toBeDefined();
      expect(contrast(foreground!, background!)).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("celebration vs bg contrast is at least 3:1 (light + dark)", () => {
  for (const theme of ["light", "dark"] as const) {
    const variables = THEMES[theme];
    it(`${theme}: c-celebration on c-bg is at least 3:1`, () => {
      const foreground = variables["c-celebration"];
      const background = variables["c-bg"];
      expect(foreground).toBeDefined();
      expect(background).toBeDefined();
      expect(contrast(foreground!, background!)).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("-soft-hover is distinct from resting -soft (all scopes)", () => {
  for (const [theme, variables] of Object.entries(THEMES)) {
    for (const family of MODULE_FAMILIES) {
      it(`${theme}: ${family}-soft-hover differs from ${family}-soft`, () => {
        const soft = variables[`c-${family}-soft`];
        const hover = variables[`c-${family}-soft-hover`];
        expect(soft).toBeDefined();
        expect(hover).toBeDefined();
        expect(hover).not.toBe(soft);
      });
    }
  }
});
