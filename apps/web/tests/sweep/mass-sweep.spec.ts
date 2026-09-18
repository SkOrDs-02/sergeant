/**
 * Ad-hoc mass browser sweep (не CI-гейт).
 *
 * Збирає, а не асертить: по кожній поверхні знімає console-помилки,
 * незловлені винятки, невдалі запити, axe-порушення всіх impact-ів,
 * горизонтальний overflow (обидва заміри), 44px-флор і обрізані підписи.
 * Результат — JSONL, який читає агент.
 *
 * Status: Scaffolded (тимчасовий інструмент прогону, не гейт).
 */
import { test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { seedFTUX, type FtuxSeedMode } from "../utils/seedFTUX";
import { FLOOR_SELECTOR, mockApi } from "../mobile/audit";

const OUT = process.env["SWEEP_OUT"] ?? "/tmp/sergeant-sweep/report.jsonl";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

interface RouteCase {
  id: string;
  path: string;
  seed?: FtuxSeedMode;
}

const ROUTES: readonly RouteCase[] = [
  // Hub shell
  { id: "HUB", path: "/" },
  { id: "HUB_REPORTS", path: "/?tab=reports" },
  { id: "HUB_SETTINGS_TAB", path: "/?tab=settings" },
  { id: "HUB_PRE_FTUX", path: "/", seed: "pre-ftux" },
  { id: "WELCOME", path: "/welcome", seed: "cold" },
  // Finyk — п'ять сторінок з finykRouter.ts
  { id: "FINYK_OVERVIEW", path: "/finyk" },
  { id: "FINYK_TRANSACTIONS", path: "/finyk/transactions" },
  { id: "FINYK_BUDGETS", path: "/finyk/budgets" },
  { id: "FINYK_ANALYTICS", path: "/finyk/analytics" },
  { id: "FINYK_ASSETS", path: "/finyk/assets" },
  // Fizruk — з fizrukRouter.ts
  { id: "FIZRUK_DASHBOARD", path: "/fizruk" },
  { id: "FIZRUK_ATLAS", path: "/fizruk/atlas" },
  { id: "FIZRUK_WORKOUTS", path: "/fizruk/workouts" },
  { id: "FIZRUK_PROGRESS", path: "/fizruk/progress" },
  { id: "FIZRUK_MEASUREMENTS", path: "/fizruk/measurements" },
  { id: "FIZRUK_PROGRAMS", path: "/fizruk/programs" },
  { id: "FIZRUK_BODY", path: "/fizruk/body" },
  { id: "FIZRUK_HISTORY", path: "/fizruk/history" },
  { id: "FIZRUK_CATALOG", path: "/fizruk/catalog" },
  { id: "FIZRUK_TEMPLATES", path: "/fizruk/templates" },
  // Nutrition — з nutritionRouter.ts
  { id: "NUTRITION_START", path: "/nutrition" },
  { id: "NUTRITION_PANTRY", path: "/nutrition/pantry" },
  { id: "NUTRITION_LOG", path: "/nutrition/log" },
  { id: "NUTRITION_MENU", path: "/nutrition/menu" },
  // Routine — з routineRouter.ts
  { id: "ROUTINE_CALENDAR", path: "/routine" },
  { id: "ROUTINE_HABITS", path: "/routine/habits" },
  { id: "ROUTINE_STATS", path: "/routine/stats" },
  // Core surfaces
  { id: "INSIGHTS", path: "/insights" },
  { id: "SETTINGS", path: "/settings" },
  { id: "ASSISTANT", path: "/assistant" },
  { id: "CHAT", path: "/chat" },
  { id: "PRICING", path: "/pricing" },
  { id: "SIGN_IN", path: "/sign-in" },
  { id: "STATUS", path: "/status" },
  { id: "NOT_FOUND", path: "/zzz-no-such-route" },
];

test.describe.configure({ mode: "serial" });

for (const routeCase of ROUTES) {
  test(`sweep ${routeCase.id} ${routeCase.path}`, async ({
    page,
  }, testInfo) => {
    const consoleErrors: string[] = [];
    const consoleWarnings: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const badResponses: string[] = [];

    page.on("console", (msg) => {
      const text = msg.text();
      if (msg.type() === "error") consoleErrors.push(text);
      else if (msg.type() === "warning") consoleWarnings.push(text);
    });
    page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
    page.on("requestfailed", (req) => {
      failedRequests.push(
        `${req.method()} ${req.url()} — ${req.failure()?.errorText ?? "?"}`,
      );
    });
    page.on("response", (res) => {
      if (res.status() >= 400) {
        badResponses.push(`${res.status()} ${res.url()}`);
      }
    });

    await mockApi(page);
    await seedFTUX(page, routeCase.seed ?? "post-ftux");

    let navError: string | null = null;
    try {
      await page.goto(routeCase.path, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page
        .waitForLoadState("networkidle", { timeout: 12_000 })
        .catch(() => undefined);
      await page
        .locator("main, [role='main'], [data-a11y-root], #root > *")
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });
    } catch (err) {
      navError = String((err as Error)?.message ?? err).slice(0, 300);
    }

    // Дочекатись скінченних анімацій — той самий мотив, що в
    // tests/a11y/axe.spec.ts і tests/mobile/audit.ts: міряємо кадр,
    // який уже приземлився, інакше opacity предка підробляє контраст.
    await page
      .locator('[aria-busy="true"]')
      .first()
      .waitFor({ state: "hidden", timeout: 8_000 })
      .catch(() => undefined);
    await page
      .evaluate(async () => {
        const deadline = performance.now() + 3_000;
        for (let pass = 0; pass < 5; pass++) {
          const pending = document
            .getAnimations()
            .filter(
              (a) =>
                a.playState !== "finished" &&
                a.effect?.getComputedTiming().iterations !== Infinity,
            );
          const budget = deadline - performance.now();
          if (pending.length === 0 || budget <= 0) return;
          await Promise.race([
            Promise.all(pending.map((a) => a.finished.catch(() => undefined))),
            new Promise((resolve) => setTimeout(resolve, budget)),
          ]);
        }
      })
      .catch(() => undefined);

    const metrics = await page
      .evaluate((selector) => {
        const FLOOR = 44;
        const EXCLUDED_ROLES = new Set(["switch", "checkbox", "radio"]);
        const undersized: Array<{ label: string; w: number; h: number }> = [];
        for (const el of Array.from(document.querySelectorAll(selector))) {
          if (el.getAttribute("aria-hidden") === "true") continue;
          const role = el.getAttribute("role");
          if (role && EXCLUDED_ROLES.has(role)) continue;
          const maybe = el as HTMLElement & {
            checkVisibility?: (opts?: {
              checkOpacity?: boolean;
              checkVisibilityCSS?: boolean;
            }) => boolean;
          };
          if (
            typeof maybe.checkVisibility === "function" &&
            !maybe.checkVisibility({
              checkOpacity: true,
              checkVisibilityCSS: true,
            })
          ) {
            continue;
          }
          const rect = el.getBoundingClientRect();
          if (rect.width <= 1 || rect.height <= 1) continue;
          if (
            rect.bottom <= 0 ||
            rect.right <= 0 ||
            rect.top >= window.innerHeight ||
            rect.left >= window.innerWidth
          ) {
            continue;
          }
          if (rect.height < FLOOR - 0.5 || rect.width < FLOOR - 0.5) {
            undersized.push({
              label: (
                el.textContent ||
                el.getAttribute("aria-label") ||
                el.tagName
              )
                .trim()
                .slice(0, 40),
              w: Math.round(rect.width),
              h: Math.round(rect.height),
            });
          }
        }

        const clippedLabels: Array<{ label: string; lostPx: number }> = [];
        const clippedContent: Array<{ cls: string; lostPx: number }> = [];
        for (const el of Array.from(document.querySelectorAll("*"))) {
          const cs = getComputedStyle(el);
          if (
            cs.textOverflow === "ellipsis" &&
            cs.textTransform === "uppercase" &&
            el.scrollWidth > el.clientWidth + 2 &&
            el.clientWidth > 12
          ) {
            const txt = (el.textContent || "").trim();
            if (txt) {
              clippedLabels.push({
                label: txt.slice(0, 40),
                lostPx: el.scrollWidth - el.clientWidth,
              });
            }
          }
          if (cs.overflowX === "hidden" && cs.textOverflow !== "ellipsis") {
            const lostPx = el.scrollWidth - el.clientWidth;
            if (lostPx > 1 && el.clientWidth > 12) {
              clippedContent.push({
                cls: (el.getAttribute("class") || "").slice(0, 80),
                lostPx,
              });
            }
          }
        }

        const root = document.getElementById("root");
        return {
          overflowPx: document.documentElement.scrollWidth - window.innerWidth,
          undersized,
          clippedLabels,
          clippedContent,
          rootEmpty: !root || root.childElementCount === 0,
          title: document.title,
          h1: Array.from(document.querySelectorAll("h1"))
            .map((h) => (h.textContent || "").trim())
            .slice(0, 3),
          bodyTextLen: (document.body.innerText || "").trim().length,
        };
      }, FLOOR_SELECTOR)
      .catch((err) => ({ evalError: String(err).slice(0, 200) }));

    let axeViolations: unknown[] = [];
    try {
      const results = await new AxeBuilder({ page })
        .withTags(AXE_TAGS)
        .analyze();
      axeViolations = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        count: v.nodes.length,
        sample: v.nodes.slice(0, 2).map((n) => ({
          target: n.target.join(" "),
          html: n.html.replace(/\s+/g, " ").slice(0, 180),
          why: (n.failureSummary || "").replace(/\s+/g, " ").slice(0, 220),
        })),
      }));
    } catch (err) {
      axeViolations = [{ axeError: String(err).slice(0, 200) }];
    }

    const shotDir = `${dirname(OUT)}/shots`;
    mkdirSync(shotDir, { recursive: true });
    const shot = `${shotDir}/${testInfo.project.name}-${routeCase.id}.png`;
    await page
      .screenshot({ path: shot, fullPage: false })
      .catch(() => undefined);

    mkdirSync(dirname(OUT), { recursive: true });
    appendFileSync(
      OUT,
      `${JSON.stringify({
        project: testInfo.project.name,
        id: routeCase.id,
        path: routeCase.path,
        navError,
        consoleErrors,
        consoleWarnings,
        pageErrors,
        failedRequests,
        badResponses,
        metrics,
        axeViolations,
        shot,
      })}\n`,
      "utf8",
    );
  });
}
