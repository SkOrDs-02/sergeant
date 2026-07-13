import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const baseCss = readFileSync(new URL("./base.css", import.meta.url), "utf8");
const utilitiesCss = readFileSync(
  new URL("./utilities.css", import.meta.url),
  "utf8",
);
const themeCss = readFileSync(new URL("./theme.css", import.meta.url), "utf8");

describe("app viewport shell CSS contract", () => {
  it("locks document scrolling and pins #root to the viewport", () => {
    expect(baseCss).toMatch(/html,\s*body\s*{[^}]*overflow:\s*hidden/s);
    expect(baseCss).not.toMatch(/html,\s*body,\s*#root/);
    expect(baseCss).toMatch(
      /#root\s*{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*width:\s*auto[^}]*height:\s*auto/s,
    );
  });

  it("sizes app shells from the pinned root instead of visualViewport", () => {
    expect(utilitiesCss).toMatch(/@utility h-app-dvh\s*{[^}]*height:\s*100%/s);
    expect(utilitiesCss).not.toContain("var(--app-dvh");
  });

  it("uses the exact page mesh for the exposed iOS window canvas", () => {
    expect(themeCss).toContain("--app-mesh-background:");
    expect(themeCss).toMatch(
      /\.bg-mesh\s*{[^}]*background:\s*var\(--app-mesh-background\)/s,
    );
    expect(baseCss).toMatch(
      /html\s*{[^}]*background:\s*var\(--app-mesh-background/s,
    );
  });

  it("does not paint an out-of-flow apron below the bottom nav", () => {
    const bottomNavUtility = utilitiesCss
      .split("@utility bottom-nav-shell")[1]
      ?.split("@utility no-scrollbar")[0];

    expect(bottomNavUtility).toBeDefined();
    expect(bottomNavUtility).not.toContain("&::after");
    expect(bottomNavUtility).not.toContain("height: 4rem");
    expect(bottomNavUtility).not.toContain("top: 100%");
    expect(bottomNavUtility).toMatch(
      /&::before\s*{[^}]*position:\s*fixed[^}]*bottom:\s*0[^}]*height:\s*max\(/s,
    );
  });
});
