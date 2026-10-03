import { expect, test } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { auditPage, mockApi } from "./audit";
import { applyScenario } from "../utils/scenario";

// Steady-state surfaces (post-FTUX). One entry per module plus the
// Hub/Settings/Reports/Insights shells.
//
// Why no demo-seeded block: the demo funnel activates via a `?demo=1` reload
// handshake that seeds the SQLite kvStore and then re-seeds on every cold
// navigation (reset → rewrite all four modules). In Playwright's cold, isolated
// contexts that reseed takes several seconds and is timing-fragile — it seeds
// reliably only for hub-rooted paths and even then flakes under load, so it is
// not shippable as a deterministic gate (the smoke-env SQLite caveat in
// apps/web/AGENTS.md § E2E smoke). Manual passes already confirmed the demo
// Reports/Finyk surfaces neither overflow nor truncate at mobile width;
// reliable demo-content mobile checks belong on a real device/emulator.
//
// Другий блок — дірки, які закрив масовий браузерний свіп 2026-09-16.
// Кожен доданий маршрут заміряний свіпом і дав НУЛЬ підрозмірних таргетів,
// нуль overflow і нуль обрізаних підписів, тож лейн розширено на доведено
// зелених, а не навмання.
//
// `/fizruk/atlas` СВІДОМО не додано, і це не недогляд. Розширена тап-зона
// атласа зроблена прозорим ШТРИХОМ (`atlasHitStroke`), а
// `getBoundingClientRect()` штрих не показує — `auditPage` побачив би голий
// bbox мʼяза і зарапортував би шість фальшивих порушень 44px при робочій
// зоні. Атлас покритий поведінково у `atlas-tap-zones.spec.ts` (тап обирає
// групу + шар підписів інертний) і на контраст — у a11y-лейні.
const ROUTES: ReadonlyArray<{ id: string; path: string }> = [
  { id: "ASSISTANT", path: "/assistant" },
  { id: "HUB", path: "/" },
  { id: "FINYK", path: "/finyk/budgets" },
  { id: "FINYK_OVERVIEW", path: "/finyk" },
  { id: "FIZRUK", path: "/fizruk" },
  { id: "ROUTINE", path: "/routine" },
  { id: "NUTRITION", path: "/nutrition/menu" },
  { id: "SETTINGS", path: "/settings" },
  { id: "REPORTS", path: "/?tab=reports" },
  { id: "INSIGHTS", path: "/insights" },
  { id: "FINYK_TRANSACTIONS", path: "/finyk/transactions" },
  { id: "FINYK_ANALYTICS", path: "/finyk/analytics" },
  { id: "FIZRUK_PROGRAMS", path: "/fizruk/programs" },
  { id: "FIZRUK_MEASUREMENTS", path: "/fizruk/measurements" },
  { id: "NUTRITION_LOG", path: "/nutrition/log" },
  { id: "ROUTINE_HABITS", path: "/routine/habits" },
  { id: "STATUS", path: "/status" },
];

test.describe("mobile coarse-pointer UI audit", () => {
  for (const routeCase of ROUTES) {
    test(`${routeCase.id} ${routeCase.path}`, async ({ page }) => {
      await mockApi(page);
      await seedFTUX(page, "post-ftux");
      await page.goto(routeCase.path, { waitUntil: "domcontentloaded" });
      await auditPage(page, routeCase.id);
    });
  }

  // Аркуш ручного запису — стан, до якого свіп по `ROUTES` структурно не
  // дістає: він за FAB-ом, тож у steady-state його полів на сторінці немає
  // взагалі. Розкриваємо «Іншу дату» явно — згорнутий `<details>` не
  // рендерить поле, тобто замір над ним нічого не доводив би.
  //
  // ЧОГО цей кейс НЕ ловить, і це заміряно: intrinsic inline-size нативного
  // `input[type=date]` — дефект WebKit. Той самий аркуш із сирим
  // `<Input type="date" className="w-full">` проходить тут із нульовим
  // overflow (прогін 2026-09-15, Pixel 5 / Chromium). Контракт ширини поля
  // дати пінить юніт на клас `[min-inline-size:0]` у
  // `ManualExpenseSheet.extra.test.tsx` — він на сирому `Input` падає.
  // Цінність цього кейсу в іншому: решта аркуша (стрічка днів, чіпи
  // категорій, довгі підписи) доти не мала жодного overflow-покриття.
  // Рецепт: docs/start/instructions/fix-mobile-horizontal-overflow.md.
  test("MANUAL_EXPENSE sheet with the native date fallback open", async ({
    page,
  }) => {
    await mockApi(page);
    await seedFTUX(page, "post-ftux");
    await page.goto("/finyk", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "Додати", exact: true }).click();
    await page.getByRole("menuitem", { name: "Додати витрату" }).click();

    const dateField = page.getByLabel("Дата", { exact: true });
    await page.getByText("Інша дата").click();
    await expect(dateField).toBeVisible();

    await auditPage(page, "MANUAL_EXPENSE");

    // Той самий аркуш обслуговує і надходження — вкладка міняє таксономію
    // категорій, а не розкладку дати, але перевірка дешева, а регресія
    // рівно тут і була б непомітною.
    await page.getByRole("tab", { name: "Надходження" }).click();
    await auditPage(page, "MANUAL_INCOME");
  });

  test("PANTRY /nutrition/pantry with receipt-length names", async ({
    page,
  }) => {
    await seedFTUX(page, "post-ftux");
    await applyScenario(page, "pantry-receipt-names", "/nutrition/pantry");
    await expect(
      page.getByRole("button", { name: /^Редагувати / }),
    ).toHaveCount(7);

    await auditPage(page, "PANTRY");
  });

  test("FINYK_MONTH /finyk", async ({ page }) => {
    await seedFTUX(page, "post-ftux");
    await applyScenario(page, "finyk-month", "/finyk");
    await expect(page.getByText("Синхронізовано").first()).toBeVisible({
      timeout: 15_000,
    });
    await auditPage(page, "FINYK_MONTH");
  });

  test("ROUTINE_STREAKS /routine", async ({ page }) => {
    await seedFTUX(page, "post-ftux");
    await applyScenario(page, "routine-streaks", "/routine");
    await expect(page.getByText("Читання перед сном").first()).toBeVisible({
      timeout: 15_000,
    });
    await auditPage(page, "ROUTINE_STREAKS");
  });

  test("FIZRUK_ACTIVE /fizruk/workouts", async ({ page }) => {
    await seedFTUX(page, "post-ftux");
    await applyScenario(page, "fizruk-active-session", "/fizruk/workouts");
    await expect(page.getByText("Активне тренування").first()).toBeVisible({
      timeout: 15_000,
    });
    await auditPage(page, "FIZRUK_ACTIVE");
  });
});
