import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const baseCss = readFileSync(new URL("./base.css", import.meta.url), "utf8");
const utilitiesCss = readFileSync(
  new URL("./utilities.css", import.meta.url),
  "utf8",
);

describe("app viewport shell CSS contract", () => {
  it("locks document scrolling and pins #root to the viewport", () => {
    expect(baseCss).toMatch(
      /html,\s*body,\s*#root\s*{[^}]*overflow:\s*hidden/s,
    );
    expect(baseCss).toMatch(/#root\s*{[^}]*position:\s*fixed[^}]*inset:\s*0/s);
  });

  it("sizes app shells from the pinned root instead of visualViewport", () => {
    expect(utilitiesCss).toMatch(/@utility h-app-dvh\s*{[^}]*height:\s*100%/s);
    expect(utilitiesCss).not.toContain("var(--app-dvh");
  });

  it("does not paint an out-of-flow apron below the bottom nav", () => {
    const bottomNavUtility = utilitiesCss.match(
      /@utility bottom-nav-shell\s*{([\s\S]*?)\n}/,
    )?.[1];

    expect(bottomNavUtility).toBeDefined();
    expect(bottomNavUtility).not.toContain("&::after");
    expect(bottomNavUtility).not.toContain("height: 4rem");
  });
});
