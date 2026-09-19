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
 * (§ Definition of done, пункт «Р2а»): запис, створений БЕЗ входу, після
 * першого успішного логіну опиняється під акаунтом того, хто його створив.
 *
 * До 2026-09-19 цього тесту не було — `anonymous-persistence.spec.ts`
 * доводить лише «анонім → reload → запис на місці», без логіну взагалі.
 * `migrateAnonymousDataToProfile` (`core/durability/anonymousDataMigration.ts`)
 * усередині перемикає активну SQLite-партицію, ганяє реальний SQL проти
 * реальної схеми (`PRAGMA table_info`, `sqlite_master`) і чекає підтвердження
 * від сервера (`assertServerAcknowledged`) — тобто чесний барʼєр «міграція
 * завершилась успішно» не може бути юніт-моком, лише живий backend.
 *
 * Барʼєр «сервер підтвердив перенос» тут — тост
 * `messages.sync.anonymousMigrationSuccess` з
 * [`AnonymousDataMigrationProvider.tsx`](../../src/core/durability/AnonymousDataMigrationProvider.tsx):
 * `AuthenticatedMigrationGate` показує його ЛИШЕ коли
 * `migrateAnonymousDataToProfile(...)` резолвиться з `migratedRows > 0` —
 * тобто це не факт логіну, а факт завершеного й підтвердженого переносу.
 * Доки перенос не резолвнеться (`state !== "ready"`), гейт блокує рендер
 * дітей повністю (`main`/hub теж), тож саме на цьому тості, а не на таймауті
 * чи URL, тримається різниця «міграція відпрацювала» / «міграція не
 * відпрацювала чи ще триває».
 *
 * Фінальна перевірка — пряме читання: свіжий, щойно зареєстрований акаунт
 * (без жодних серверних даних) показує рядок, створений до входу. Якщо
 * перенос не спрацював, `expandTodayAndExpect` нижче впаде по таймауту —
 * тест не може позеленіти випадково, бо порожній акаунт і не мусить нічого
 * показати без реальної міграції.
 */

// Анонімно: порожній стан, той самий прийом, що в `anonymous-persistence.spec.ts`
// і `auth.spec.ts`.
test.use({ storageState: { cookies: [], origins: [] } });

const EXPENSE_TITLE = `ANON→акаунт ${crypto.randomUUID().slice(0, 8)}`;
const SUCCESS_TOAST_TEXT = "Дані перенесено й безпечно збережено у профілі.";

/**
 * Розгортає день-групу «Сьогодні» і чекає на текст усередині. Копія
 * однойменного хелпера з `anonymous-persistence.spec.ts` — той локальний і
 * не експортований, а спека прямо просить не чіпати цей файл без потреби.
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

test("@critical anonymous: запис, створений без входу, зʼявляється під акаунтом після першого логіну", async ({
  page,
}) => {
  // Анонімний бут + реєстрація через UI + перенос + повторний бут під
  // акаунтом — чотири мережеві фази, кожна дорожча за дефолтні 30 с.
  test.setTimeout(150_000);
  const errors = await collectPageErrors(page);

  // Доказ анонімності, той самий, що в `anonymous-persistence.spec.ts`:
  // жодного cookie до старту і 401 від `/api/me` на першому запиті.
  expect(await page.context().cookies()).toEqual([]);
  const meResponse = page.waitForResponse(
    (response) =>
      /\/api(\/v\d+)?\/me(\?|$)/.test(response.url()) &&
      response.request().method() === "GET",
    { timeout: 30_000 },
  );

  await seedFTUX(page, "post-ftux", {
    extra: { finyk_manual_only_v1: "1" },
  });
  await page.goto("/finyk/transactions", { waitUntil: "domcontentloaded" });
  expect(
    (await meResponse).status(),
    "анонімний візитер: GET /api/me має віддати 401",
  ).toBe(401);
  await waitForInitialSqliteRefresh(page, "finyk");

  // Створюємо витрату анонімно — той самий FAB-флоу, що в
  // `anonymous-persistence.spec.ts`.
  await page.getByRole("button", { name: "Додати", exact: true }).click();
  await page.getByRole("menuitem", { name: "Додати витрату" }).click();
  const createDialog = page.getByRole("dialog", { name: "Додати витрату" });
  await expect(createDialog).toBeVisible();
  await page.getByLabel("Сума ₴").fill("88");
  await page.getByLabel("Назва").fill(EXPENSE_TITLE);

  await settleToasts(page);
  // Барʼєр «запис долетів до SQLite анонімної партиції» — чекаємо на тишу
  // лічильника refresh-ів, не на перший інкремент (див.
  // `tests/utils/sqliteRefresh.ts`).
  await waitForSqliteRefreshAfter(page, "finyk", async () => {
    await createDialog
      .getByRole("button", { name: "Додати витрату", exact: true })
      .click();
  });
  await expect(createDialog).toBeHidden();

  // Діагностичний рубіж: запис видимий анонімно, ЩЕ ДО реєстрації. Без
  // нього падіння нижче не розрізняє «не створився» і «не переніс».
  await expandTodayAndExpect(page, EXPENSE_TITLE);

  // Реєстрація через UI (не `fetch("/api/auth/sign-up")` — правило apps/web/AGENTS.md
  // § E2E smoke, пункт 3): реальна форма ловить регресії в `RegisterForm` +
  // `AuthContext`, а не лише в `anonymousDataMigration.ts`.
  const nonce = crypto.randomUUID();
  const email = `r2a_${nonce}@example.com`;
  const password = `pw_${nonce}_long_enough`;

  // Барʼєр проти гонки з сервіс-воркером на повній навігації (apps/web/AGENTS.md
  // § E2E smoke, пункт 7): прекеш кладеться у `waitUntil` події `install`, і
  // навігація, що потрапляє РІВНО в перехід, абортиться. Тут воркер майже
  // напевно вже активний, але «майже» — це і є той клас флейку, який пункт 7
  // описує як «локально стабільно, у CI ні».
  await waitForServiceWorkerActivated(page);
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Немає акаунту? Зареєструватися" })
    .click();
  await page.fill("#auth-name", "R2a Smoke User");
  await page.fill("#auth-email", email);
  await page.fill("#auth-password", password);

  // Барʼєр «сервер підтвердив перенос» — тост зʼявляється лише коли
  // `migrateAnonymousDataToProfile` резолвиться з `migratedRows > 0`.
  // Підписка стоїть ДО кліку: у свіжозареєстрованого акаунта міграція може
  // відпрацювати швидше, ніж встигне навіситись очікування «після».
  const migrationSuccessToast = page.getByText(SUCCESS_TOAST_TEXT, {
    exact: true,
  });
  await Promise.all([
    migrationSuccessToast.waitFor({ state: "visible", timeout: 60_000 }),
    page.getByRole("button", { name: "Зареєструватися", exact: true }).click(),
  ]);
  await expect(page).not.toHaveURL(/\/sign-in/);

  // Фінальна перевірка — прямий факт, не побічний сигнал: свіжий акаунт без
  // жодних серверних даних показує рядок, створений до входу. Повторний
  // повний перехід (не SPA-навігація) навмисний — це другий, незалежний
  // бут під акаунтом, який заодно перевіряє ідемпотентність повторного
  // прогону `migrateAnonymousDataToProfile` (спека: «повторний логін —
  // no-op»), а не лише те, що запис лишився в памʼяті поточної сесії.
  await waitForServiceWorkerActivated(page);
  await page.goto("/finyk/transactions", { waitUntil: "domcontentloaded" });
  await waitForInitialSqliteRefresh(page, "finyk");
  await expandTodayAndExpect(page, EXPENSE_TITLE, 60_000);

  expect(
    errors,
    "Uncaught page errors during anonymous-to-account migration",
  ).toEqual([]);
});
