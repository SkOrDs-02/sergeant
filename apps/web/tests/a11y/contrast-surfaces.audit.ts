/**
 * Аудит контрасту і «пласких» поверхонь (WCAG AA, рішення власника
 * 2026-10-01: d1 «спершу аудит, потім токени», d2 «WCAG AA скрізь»).
 *
 * Status: Active — інструмент аудиту; НЕ входить у `pnpm test:a11y`
 * (суфікс `.audit.ts`, не `.spec.ts`). Запуск:
 *
 *   PW_SKIP_WEBSERVER=1 PW_BASE_URL=http://127.0.0.1:4173 \
 *   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium \
 *   AUDIT_OUT=/tmp/contrast-audit \
 *   pnpm --filter @sergeant/web exec playwright test \
 *     --config playwright.audit.config.ts
 *
 * Потрібен prod-білд з `VITE_E2E_SEED=true` (міст сценаріїв, як у a11y-лейні)
 * і `vite preview` на :4173. Без бекенду: API мокається світами з
 * `tests/fixtures/worlds`.
 *
 * Результат — JSON на кожну пару (viewport × тема) у `AUDIT_OUT` плюс
 * скріншоти. Визначення метрик — у шапці `tests/utils/contrastSurfaces.ts`.
 */
import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { getWorld } from "../fixtures/worlds";
import type { WorldId } from "../fixtures/worlds";
import type { ScenarioBridge } from "../../src/e2e/installScenarioBridge";
import { seedFTUX } from "../utils/seedFTUX";
import { installWorld } from "../utils/scenario";
import { waitForServiceWorkerActivated } from "../utils/serviceWorker";
import {
  measureFocusInPage,
  measureInPage,
  type FocusFinding,
  type PageMeasure,
} from "../utils/contrastSurfaces";

type Theme = "light" | "dark";
type BridgeWindow = Window & { __sergeantScenario?: ScenarioBridge };

const OUT = process.env["AUDIT_OUT"] ?? "test-results/contrast-surfaces";
const MAX_TABS = Number(process.env["AUDIT_MAX_TABS"] ?? 28);

const VIEWPORTS = {
  mobile: {
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  desktop: {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
} as const;

interface Screen {
  id: string;
  path: string;
  /** Дії перед виміром (відкрити шторку тощо). */
  act?: (page: Page) => Promise<void>;
  /** Виміряти лише всередині цього селектора (шторки). */
  scope?: string;
  /** `cold` = без світу й без пропуску онбордингу. */
  cold?: boolean;
}

const MAIN_SCREENS: Screen[] = [
  { id: "hub-home", path: "/" },
  { id: "finyk-overview", path: "/finyk" },
  { id: "finyk-transactions", path: "/finyk/transactions" },
  { id: "finyk-analytics", path: "/finyk/analytics" },
  {
    id: "finyk-tx-sheet",
    path: "/finyk/transactions",
    scope: "[role='dialog']",
    act: async (page) => {
      // Група дня за замовчуванням згорнута — розгорнути, тоді відкрити рядок.
      await page
        .getByRole("button", { name: /Сьогодні/ })
        .first()
        .click({ timeout: 8_000 });
      await page.getByText("Сільпо").first().click({ timeout: 8_000 });
      await page.locator("[role='dialog']").first().waitFor({
        state: "visible",
        timeout: 8_000,
      });
    },
  },
  { id: "fizruk-dashboard", path: "/fizruk" },
  { id: "fizruk-workouts", path: "/fizruk/workouts" },
  { id: "routine-home", path: "/routine" },
  { id: "routine-habits", path: "/routine/habits" },
  { id: "nutrition-start", path: "/nutrition" },
  { id: "nutrition-plan", path: "/nutrition/menu/plan" },
  { id: "nutrition-recipes", path: "/nutrition/menu/recipes" },
  { id: "nutrition-pantry", path: "/nutrition/pantry" },
  { id: "nutrition-shopping", path: "/nutrition/pantry/shopping" },
  { id: "nutrition-log", path: "/nutrition/log" },
  { id: "settings", path: "/?tab=settings" },
  { id: "chat", path: "/chat" },
  { id: "legal-privacy", path: "/legal/privacy" },
  { id: "sign-in", path: "/sign-in" },
  { id: "pricing", path: "/pricing" },
];

const COLD_SCREENS: Screen[] = [
  { id: "welcome", path: "/welcome", cold: true },
];

/** Складений світ: усі чотири модулі мають дані, hub показує картки. */
function auditWorld() {
  const base = getWorld("finyk-month");
  const parts = (
    [
      "pantry-receipt-names",
      "routine-streaks",
      "finyk-month",
      "fizruk-active-session",
    ] as WorldId[]
  ).map((id) => getWorld(id).local as Record<string, unknown>);
  const local = Object.assign({}, ...parts, { scenario: "finyk-month" });
  return { world: { ...base, local }, local };
}

async function settle(page: Page, budgetMs = 3_000) {
  await page.evaluate(async (budget: number) => {
    const deadline = performance.now() + budget;
    for (let pass = 0; pass < 6; pass++) {
      const pending = document
        .getAnimations()
        .filter(
          (a) =>
            a.playState !== "finished" &&
            a.effect?.getComputedTiming().iterations !== Infinity,
        );
      const left = deadline - performance.now();
      if (pending.length === 0 || left <= 0) return;
      await Promise.race([
        Promise.all(pending.map((a) => a.finished.catch(() => undefined))),
        new Promise((resolve) => setTimeout(resolve, left)),
      ]);
    }
  }, budgetMs);
}

/**
 * Дочекатись «тиші» DOM: ліниві чанки модулів і шторок монтуються після
 * `networkidle`, тож замір одразу після `main` бачив напівпорожню сторінку
 * (Налаштування: 6 текстових вузлів замість ~30). Тиша = жодних мутацій
 * 700 мс поспіль; стеля — 8 с.
 */
async function waitDomQuiet(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let timer = setTimeout(done, 700);
        const hard = setTimeout(done, 8_000);
        const mo = new MutationObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(done, 700);
        });
        mo.observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
        });
        function done() {
          clearTimeout(timer);
          clearTimeout(hard);
          mo.disconnect();
          resolve();
        }
      }),
  );
}

async function applyAuditWorld(page: Page) {
  const { world, local } = auditWorld();
  await installWorld(page, world);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (window as BridgeWindow).__sergeantScenario?.apply ===
          "function",
      ),
    )
    .toBe(true);
  await page.evaluate(
    (l) => (window as BridgeWindow).__sergeantScenario!.apply(l),
    local,
  );
  await waitForServiceWorkerActivated(page, 10_000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as BridgeWindow).__sergeantScenario?.snapshot() ?? null,
        ),
      { timeout: 25_000 },
    )
    .toMatchObject({ scenario: "finyk-month", sqliteReady: true });
}

async function focusWalk(page: Page): Promise<FocusFinding[]> {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
  const out: FocusFinding[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < MAX_TABS; i++) {
    await page.keyboard.press("Tab");
    await settle(page, 600);
    const f = await page.evaluate(measureFocusInPage);
    if (!f) continue;
    const key = `${f.sel}|${f.rect.x}|${f.rect.y}`;
    if (seen.has(key)) break;
    seen.add(key);
    out.push(f);
  }
  return out;
}

interface AxeNode {
  target: string;
  fg: string | null;
  bg: string | null;
  ratio: number | null;
  expected: number | null;
  fontSize: string | null;
  html: string;
}

async function axeContrast(page: Page, scope?: string) {
  let builder = new AxeBuilder({ page }).withRules(["color-contrast"]);
  if (scope) builder = builder.include(scope);
  const res = await builder.analyze();
  const nodes: AxeNode[] = [];
  for (const v of res.violations) {
    for (const n of v.nodes) {
      const d = (n.any[0]?.data ?? {}) as Record<string, unknown>;
      nodes.push({
        target: n.target.join(" "),
        fg: (d["fgColor"] as string) ?? null,
        bg: (d["bgColor"] as string) ?? null,
        ratio:
          typeof d["contrastRatio"] === "number" ? d["contrastRatio"] : null,
        expected:
          typeof d["expectedContrastRatio"] === "string"
            ? parseFloat(d["expectedContrastRatio"] as string)
            : null,
        fontSize: (d["fontSize"] as string) ?? null,
        html: n.html.replace(/\s+/g, " ").slice(0, 160),
      });
    }
  }
  const incomplete = res.incomplete
    .filter((r) => r.id === "color-contrast")
    .reduce((s, r) => s + r.nodes.length, 0);
  return { violations: nodes, incomplete };
}

interface ScreenResult {
  id: string;
  path: string;
  theme: Theme;
  viewport: string;
  htmlClass: string;
  pendingAnimations: number;
  axe: Awaited<ReturnType<typeof axeContrast>>;
  measure: PageMeasure;
  focus: FocusFinding[];
  consoleErrors: string[];
}

async function runScreen(
  page: Page,
  screen: Screen,
  theme: Theme,
  vp: string,
  shotDir: string,
): Promise<ScreenResult> {
  const consoleErrors: string[] = [];
  const onConsole = (m: { type(): string; text(): string }) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160));
  };
  page.on("console", onConsole);
  await page.goto(screen.path, { waitUntil: "domcontentloaded" });
  await page
    .waitForLoadState("networkidle", { timeout: 12_000 })
    .catch(() => undefined);
  await page
    .locator("main, [role='main'], [data-a11y-root], #root > *")
    .first()
    .waitFor({ state: "visible", timeout: 12_000 });
  await waitDomQuiet(page);
  if (screen.act) await screen.act(page);
  await waitDomQuiet(page);
  await settle(page);
  const htmlClass = await page.evaluate(
    () => document.documentElement.className,
  );
  const pendingAnimations = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter(
          (a) =>
            a.playState !== "finished" &&
            a.effect?.getComputedTiming().iterations !== Infinity,
        ).length,
  );
  const axe = await axeContrast(page, screen.scope);
  const measure = await page.evaluate(measureInPage, {
    scope: screen.scope,
  });
  fs.mkdirSync(shotDir, { recursive: true });
  await page
    .screenshot({
      path: path.join(shotDir, `${vp}-${theme}-${screen.id}.png`),
      fullPage: !screen.scope,
    })
    .catch(() => undefined);
  // Фокус-обхід лише для звичайних сторінок: у шторці фокус-пастка.
  const focus = screen.scope ? [] : await focusWalk(page);
  page.off("console", onConsole);
  return {
    id: screen.id,
    path: screen.path,
    theme,
    viewport: vp,
    htmlClass,
    pendingAnimations,
    axe,
    measure,
    focus,
    consoleErrors,
  };
}

test.describe.configure({ mode: "serial" });

const ONLY_SCREENS = (process.env["AUDIT_SCREENS"] ?? "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);
const ONLY_VP = process.env["AUDIT_VP"];
const ONLY_THEME = process.env["AUDIT_THEME"];
const pick = (list: Screen[]) =>
  ONLY_SCREENS.length ? list.filter((s) => ONLY_SCREENS.includes(s.id)) : list;

for (const [vpName, vpOpts] of Object.entries(VIEWPORTS)) {
  for (const theme of ["light", "dark"] as Theme[]) {
    if (ONLY_VP && ONLY_VP !== vpName) continue;
    if (ONLY_THEME && ONLY_THEME !== theme) continue;
    test(`audit ${vpName} ${theme}`, async ({ browser }) => {
      test.setTimeout(30 * 60_000);
      fs.mkdirSync(OUT, { recursive: true });
      const shotDir = path.join(OUT, "shots");
      const results: ScreenResult[] = [];

      const mkCtx = async (cold: boolean) => {
        const context = await browser.newContext({
          ...vpOpts,
          colorScheme: theme === "dark" ? "dark" : "light",
          locale: "uk-UA",
          timezoneId: "Europe/Kyiv",
          serviceWorkers: "allow",
        });
        const page = await context.newPage();
        await seedFTUX(page, cold ? "cold" : "post-ftux", {
          theme,
          extra: { hub_theme_v2: theme },
        });
        // Перший кадр уже у темі (як для користувача з уцілілим вибором).
        await page.addInitScript((t: string) => {
          if (t === "dark") document.documentElement.classList.add("dark");
        }, theme);
        return { context, page };
      };

      // 1) Основна група — зі світом.
      {
        const { context, page } = await mkCtx(false);
        await applyAuditWorld(page);
        for (const screen of pick(MAIN_SCREENS)) {
          try {
            results.push(await runScreen(page, screen, theme, vpName, shotDir));
          } catch (error) {
            results.push({
              id: screen.id,
              path: screen.path,
              theme,
              viewport: vpName,
              htmlClass: "",
              pendingAnimations: -1,
              axe: { violations: [], incomplete: 0 },
              measure: {
                text: [],
                boundary: [],
                surfaces: [],
                counts: { error: 1 },
                bodyBg: "",
                scrollHeight: 0,
              },
              focus: [],
              consoleErrors: [
                `AUDIT-ERROR: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`,
              ],
            });
          }
        }
        await context.close();
      }

      // 2) Холодний старт (welcome) — без пропуску онбордингу.
      for (const screen of pick(COLD_SCREENS)) {
        const { context, page } = await mkCtx(true);
        await installWorld(page, getWorld("empty"));
        try {
          results.push(await runScreen(page, screen, theme, vpName, shotDir));
        } catch (error) {
          results.push({
            id: screen.id,
            path: screen.path,
            theme,
            viewport: vpName,
            htmlClass: "",
            pendingAnimations: -1,
            axe: { violations: [], incomplete: 0 },
            measure: {
              text: [],
              boundary: [],
              surfaces: [],
              counts: { error: 1 },
              bodyBg: "",
              scrollHeight: 0,
            },
            focus: [],
            consoleErrors: [
              `AUDIT-ERROR: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`,
            ],
          });
        }
        await context.close();
      }

      fs.writeFileSync(
        path.join(OUT, `${vpName}-${theme}.json`),
        JSON.stringify(results, null, 1),
      );
      // Аудит збирає, а не блокує.
      expect(results.length).toBeGreaterThan(0);
    });
  }
}
