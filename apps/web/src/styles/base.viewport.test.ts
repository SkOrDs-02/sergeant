import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const baseCss = readFileSync(new URL("./base.css", import.meta.url), "utf8");
const utilitiesCss = readFileSync(
  new URL("./utilities.css", import.meta.url),
  "utf8",
);
const themeCss = readFileSync(new URL("./theme.css", import.meta.url), "utf8");
const animationsCss = readFileSync(
  new URL("./animations.css", import.meta.url),
  "utf8",
);

describe("app viewport shell CSS contract", () => {
  it("locks document scrolling without fixing #root to WebKit's inset viewport", () => {
    expect(baseCss).toMatch(/html,\s*body\s*{[^}]*overflow:\s*hidden/s);
    expect(baseCss).toMatch(/#root\s*{[^}]*height:\s*100dvh/s);
    expect(baseCss).not.toMatch(/#root\s*{[^}]*position:\s*fixed/s);
    expect(baseCss).not.toMatch(/#root\s*{[^}]*inset:\s*0/s);
  });

  it("uses legacy vh for the full safe-area height in standalone PWA mode", () => {
    expect(baseCss).toMatch(
      /@media\s*\(display-mode:\s*standalone\)\s*{\s*html,\s*body,\s*#root\s*{[^}]*height:\s*100vh/s,
    );
  });

  it("sizes app shells from the CSS root instead of visualViewport", () => {
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

  /**
   * Регресія — рожеві смуги від застарілої заливки в «Рутині».
   *
   * `fill-mode: both` лишав на корені модуля/хаба вічну identity-трансформу
   * (`matrix(1,0,0,1,0,0)`), бо фінальний кадр збігається з природним станом.
   * Разом із нею лишався промоутнутий композиторний шар, у якому iOS не
   * інвалідує перемальовку: заливка попередньо обраної пігулки лишалась на
   * екрані. Заміряно у Chromium через ланцюг предків — до фікса
   * `transform: matrix(...)`, після — `none`.
   */
  it("не лишає залишкову трансформу на корені модуля після входу", () => {
    const moduleEnter = animationsCss
      .split(".module-enter {")[1]
      ?.split("}")[0];
    const hubEnter = animationsCss.split(".hub-enter {")[1]?.split("}")[0];

    expect(moduleEnter).toBeDefined();
    expect(hubEnter).toBeDefined();
    // `backwards` тримає from-стан до старту (гасить спалах), але нічого не
    // лишає після завершення. `both`/`forwards` — саме те, що ламало iOS.
    expect(moduleEnter).toContain("backwards");
    expect(moduleEnter).not.toMatch(/\bboth\b|\bforwards\b/);
    expect(hubEnter).toContain("backwards");
    expect(hubEnter).not.toMatch(/\bboth\b|\bforwards\b/);
  });

  it("does not paint an out-of-flow apron below the bottom nav", () => {
    const bottomNavUtility = utilitiesCss
      .split("@utility bottom-nav-shell")[1]
      ?.split("@utility no-scrollbar")[0];

    expect(bottomNavUtility).toBeDefined();
    expect(bottomNavUtility).not.toContain("&::after");
    expect(bottomNavUtility).not.toContain("&::before");
    expect(bottomNavUtility).not.toContain("height: 4rem");
    expect(bottomNavUtility).not.toContain("top: 100%");
    expect(bottomNavUtility).not.toContain("position: fixed");
  });
});
