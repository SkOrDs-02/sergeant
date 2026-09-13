import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const utilitiesCss = readFileSync(
  new URL("./utilities.css", import.meta.url),
  "utf8",
);
const mobileCss = readFileSync(
  new URL("./mobile.css", import.meta.url),
  "utf8",
);

/**
 * PR-X2 (design-audit 2026-09-13). `above-tabbar-pill` (positions the
 * `DemoModeBadge` pill) and the `html[data-demo-badge] main` scroll-region
 * clearance in `mobile.css` (keeps card content from scrolling underneath
 * that same fixed pill) both derive from the pill's footprint. They used
 * to each hardcode their own copy of that arithmetic, and drifted apart
 * silently when the pill's own offset changed and the clearance rule
 * wasn't touched — the pill ended up sitting 64–116px INSIDE the
 * supposedly-cleared scroll band (live-browser audit, 390×844).
 *
 * This is the second time this exact pair has drifted (see the `mobile.css`
 * comment above the rule for the first). A behavioural/visual assertion
 * can't catch the regression without a real browser layout engine, so this
 * guards the *source* instead: both rules must read the same pair of CSS
 * custom properties, not their own copy-pasted numbers.
 */
describe("demo-badge clearance stays derived from the shared footprint vars", () => {
  const rootBlock = utilitiesCss.split(/:root\s*{/)[1]?.split(/\n}\n/)[0];

  const pillUtility = utilitiesCss
    .split("@utility above-tabbar-pill")[1]
    ?.split("@utility ")[0];

  const clearanceRule = mobileCss
    .split("html[data-demo-badge] main")[1]
    ?.split("}")[0];

  it("defines both footprint vars in utilities.css :root", () => {
    expect(rootBlock).toBeDefined();
    expect(rootBlock).toContain("--sgt-demo-badge-bottom-offset:");
    expect(rootBlock).toContain("--sgt-demo-badge-height:");
  });

  it("above-tabbar-pill positions the pill from the shared bottom-offset var", () => {
    expect(pillUtility).toBeDefined();
    expect(pillUtility).toMatch(
      /bottom:\s*var\(--sgt-demo-badge-bottom-offset\)/,
    );
  });

  it("mobile.css shrinks the scroll region by BOTH shared vars, not a hardcoded number", () => {
    expect(clearanceRule).toBeDefined();
    expect(clearanceRule).toContain("var(--sgt-demo-badge-bottom-offset)");
    expect(clearanceRule).toContain("var(--sgt-demo-badge-height)");
    // Regression guard for the exact bug: a bare `calc(2.75rem + 0.5rem)`
    // (or any other literal-only calc with no var()) is the shape that
    // silently went stale before.
    expect(clearanceRule).not.toMatch(/margin-bottom:\s*calc\(\s*[\d.]+rem/);
  });
});
