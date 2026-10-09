import { expect, test, type Page } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { waitForServiceWorkerActivated } from "../utils/serviceWorker";
import { waitForSqliteRefreshAfter } from "../utils/sqliteRefresh";
import {
  collectPageErrors,
  settleToasts,
  waitForInitialSqliteRefresh,
} from "./smokeHelpers";

/**
 * E2E-приймання спеки `docs/work/specs/anonymous-local-first-persistence.md`
 * (§ Definition of done, пункт 3): запис, створений БЕЗ входу, переживає
 * перезавантаження сторінки.
 *
 * Чому саме витрата Фініка, хоча спека наживо міряла звичку Рутини: резолвер
 * анонімного id один на всі чотири модулі (`useLocalUserId` → `local-anon`),
 * тож різниця «анонім ↔ акаунт» перевіряється будь-яким із них однаково, а
 * детермінований барʼєр «запис долетів до SQLite» є лише у модулів із
 * лічильником `__sergeantSqliteRefreshCounts` (finyk / fizruk / nutrition —
 * див. `createSqliteReadGate`). Рутина його не публікує, і рестарт після
 * її запису був би гонкою, а не кроком сценарію.
 *
 * Анонімність тут — не відсутність `storageState`, а доведений стан:
 * `GET /api/me` віддає 401, і саме з цього `AuthContext` виводить
 * `status = "unauthenticated"`, а `useLocalUserId` — синтетичний
 * `local-anon`, під яким і пише dual-write.
 */

// Анонімно: порожній стан замість пре-запеченого `hub-user` зі
// `playwright.smoke.config.ts` — той самий прийом, що в `demo-mode-smoke`.
test.use({ storageState: { cookies: [], origins: [] } });

const EXPENSE_TITLE = "ANON кава без входу";

/**
 * Розгортає день-групу «Сьогодні» і чекає на текст усередині. Атомарний
 * `toPass`: між boot-refresh і hydration-refresh група може перерендеритись
 * назад згорнутою і зʼїсти одиночний клік (та сама поправка, що в
 * `deep-module-crud.spec.ts`).
 */
async function expandTodayAndExpect(
  page: Page,
  text: string,
  timeoutMs = 30_000,
) {
  await expect(async () => {
    const toggle = page.getByRole("button", {
      name: /(Розгорнути|Згорнути) Сьогодні/,
    });
    const name =
      (await toggle.getAttribute("aria-label")) ??
      (await toggle.textContent()) ??
      "";
    if (name.includes("Розгорнути")) await toggle.dispatchEvent("click");
    await expect(page.getByText(text)).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: timeoutMs });
}

test("@critical anonymous: витрата, створена без входу, переживає перезавантаження", async ({
  page,
}) => {
  // Два холодні буті плюс барʼєр сервіс-воркера (~2 с) — дефолтних 30 с
  // на це не розраховано (див. `apps/web/AGENTS.md § E2E smoke`, п. 7).
  test.setTimeout(90_000);
  await seedFTUX(page, "post-ftux", {
    extra: { finyk_manual_only_v1: "1" },
  });
  const errors = await collectPageErrors(page);

  // Доказ анонімності, а не припущення: жодного cookie до старту і 401 від
  // `/api/me` на першому ж запиті. Підписка ставиться ДО навігації —
  // інакше швидка відповідь проскочить повз `waitForResponse`. Версійний
  // сегмент (`/api/v1/me`) додає `apiUrl` → `applyVersion`, тож регекс
  // приймає обидві форми.
  expect(await page.context().cookies()).toEqual([]);
  const meResponse = page.waitForResponse(
    (response) =>
      /\/api(\/v\d+)?\/me(\?|$)/.test(response.url()) &&
      response.request().method() === "GET",
    { timeout: 30_000 },
  );

  await page.goto("/finyk/transactions", { waitUntil: "domcontentloaded" });
  expect(
    (await meResponse).status(),
    "анонімний візитер: GET /api/me має віддати 401",
  ).toBe(401);
  await waitForInitialSqliteRefresh(page, "finyk");

  // FAB — фан-меню (PR #818): головна кнопка «Додати», дія — menuitem.
  await page
    .getByTestId("add-action-bar")
    .getByRole("button", { name: "Додати витрату" })
    .click();
  const createDialog = page.getByRole("dialog", { name: "Додати витрату" });
  await expect(createDialog).toBeVisible();
  await page.getByLabel("Сума ₴").fill("77");
  await page.getByLabel("Назва").fill(EXPENSE_TITLE);

  // Тост «Додаток готовий до роботи офлайн» лягає поверх футера аркуша —
  // прибираємо його перед кліком, а не чекаємо, доки Playwright перечекає
  // перехоплення.
  await settleToasts(page);
  // Барʼєр «запис долетів»: `click()` повертається одразу після диспатчу
  // події, а dual-write ставить задачу в чергу. Чекаємо на ТИШУ лічильника
  // refresh-ів, не на перший інкремент (каскад записів — див.
  // `tests/utils/sqliteRefresh.ts`).
  await waitForSqliteRefreshAfter(page, "finyk", async () => {
    await createDialog
      .getByRole("button", { name: "Додати витрату", exact: true })
      .click();
  });
  await expect(createDialog).toBeHidden();

  // Діагностичний рубіж: запис видимий ЩЕ ДО рестарту. Без нього падіння
  // нижче не розрізняє «не створився» і «не зберігся».
  await expandTodayAndExpect(page, EXPENSE_TITLE);

  // Барʼєр сервіс-воркера перед рестартом — інакше `reload` стріляє на
  // межі install → activate прекешу (розбір у `tests/utils/serviceWorker.ts`).
  // `timeout` означає, що рестарт знову став гонкою — падаємо тут із
  // названою причиною; `no-service-worker` допустимий.
  expect(await waitForServiceWorkerActivated(page)).not.toBe("timeout");
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });

  // Після рестарту лічильник обнуляється; список рендериться лише після
  // SQLite boot+refresh з анонімної партиції `sergeant-anon.db`.
  await waitForInitialSqliteRefresh(page, "finyk");
  await expandTodayAndExpect(page, EXPENSE_TITLE, 60_000);

  expect(errors, "Uncaught page errors during anonymous persistence").toEqual(
    [],
  );
});
