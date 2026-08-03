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
