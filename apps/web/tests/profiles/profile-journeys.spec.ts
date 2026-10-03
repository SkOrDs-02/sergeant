import { expect, test, type Page, type BrowserContext } from "@playwright/test";

import {
  QA_PASSWORD,
  addExpense,
  addHabit,
  addPantryItem,
  goto,
  recordConsole,
  reload,
  signIn,
  signUp,
  uncaughtOnly,
  visibleText,
  type Recorder,
} from "../utils/liveJourneyHelpers";
import { JOURNEY, PROFILES, type TestProfile } from "./profileMatrix";

/**
 * Прогін матриці з `profileMatrix.ts`. Один `test.describe.serial` на профіль —
 * кроки всередині профілю навмисно залежні (спочатку створюємо запис, потім
 * перевіряємо, що він видимий), а самі профілі ізольовані власним контекстом.
 *
 * Лейн локальний (`pnpm --filter @sergeant/web e2e:profiles`) і потребує вже
 * піднятого стека — Postgres + `@sergeant/server` (:3000) + прод-білд web у
 * `vite preview` (:4173). Найпростіше:
 *
 * ```bash
 * pnpm db:up
 * pnpm --filter @sergeant/db-schema build
 * pnpm --filter @sergeant/server db:migrate:dev
 * pnpm --filter @sergeant/server dev &
 * pnpm --filter @sergeant/web build
 * pnpm --filter @sergeant/web preview -- --port 4173 --host 127.0.0.1 &
 * pnpm --filter @sergeant/web e2e:profiles
 * ```
 *
 * ВАЖЛИВО: білдити web **без** `NODE_ENV=development` — Vite бере
 * `isProduction` саме з `process.env.NODE_ENV`, і з dev-значенням прогін піде
 * по dev-бандлу (dev-JSX-рантайм + react-query devtools), тобто ти
 * тестуватимеш не те, що їде в прод.
 *
 * Профіль `P4-pro` потребує акаунта з активною підпискою. UI-шляху оплати
 * локально немає, тож користувача створюють руками:
 *
 * ```sql
 * INSERT INTO subscriptions (user_id, plan, status, provider, current_period_end)
 * SELECT id, 'pro', 'active', 'manual', now() + interval '30 days'
 *   FROM "user" WHERE email = '<email>';
 * ```
 *
 * і передають `PW_PRO_USER_EMAIL` / `PW_PRO_USER_PASSWORD`. Без них профіль
 * скіпається — мовчки «зеленим» він не стає.
 */

const PASSWORD = QA_PASSWORD;

// Хелпери goto/signUp/signIn/CRUD/console-recorder переїхали в
// `tests/utils/liveJourneyHelpers.ts`, коли зʼявився другий споживач —
// прийомний лейн бети (`e2e:beta`). Поведінка не змінювалась.

/** Профіль, який вимагає акаунта, отримує свій — або скіпається зі зрозумілою причиною. */
async function establishAccount(
  profile: TestProfile,
  page: Page,
): Promise<{ email: string; password: string } | null> {
  if (profile.account === "anonymous") return null;

  if (profile.plan === "pro") {
    const email = process.env["PW_PRO_USER_EMAIL"];
    const password = process.env["PW_PRO_USER_PASSWORD"] ?? PASSWORD;
    test.skip(
      !email,
      "PW_PRO_USER_EMAIL не заданий — див. шапку файлу про створення Pro-акаунта",
    );
    await signIn(page, email!, password);
    return { email: email!, password };
  }

  const email = `qa.${profile.id.toLowerCase()}.${Date.now()}@example.com`;
  await signUp(page, `QA ${profile.id}`, email);
  return { email, password: PASSWORD };
}

for (const profile of PROFILES) {
  test.describe.serial(`${profile.id} — ${profile.title}`, () => {
    let context: BrowserContext;
    let page: Page;
    let rec: Recorder;
    let credentials: { email: string; password: string } | null = null;

    test.beforeAll(async ({ browser }) => {
      const newCtx = async () => {
        const c = await browser.newContext({
          locale: "uk-UA",
          timezoneId: "Europe/Kyiv",
        });
        return { c, p: await c.newPage() };
      };
      const first = await newCtx();
      context = first.c;
      page = first.p;
      rec = recordConsole(page);
      credentials = await establishAccount(profile, page);

      if (profile.account === "returning" && credentials) {
        // Сенс профілю — «той самий акаунт, інший пристрій». Наповнюємо дані
        // на першому пристрої, потім ВИКИДАЄМО контекст (порожній
        // localStorage/SQLite, як на новому телефоні) і заходимо наново.
        await addExpense(page, `QA ${profile.id} витрата`, "249");
        await addHabit(page, `QA ${profile.id} звичка`);
        await context.close();

        const second = await newCtx();
        context = second.c;
        page = second.p;
        rec = recordConsole(page);
        await signIn(page, credentials.email, credentials.password);
      }
    });

    test.afterAll(async () => {
      await context?.close();
    });

    test(`${profile.id}: жодного маршруту матриці не валить рендер`, async () => {
      for (const step of JOURNEY) {
        await goto(page, step.route);
      }
    });

    test(`${profile.id}: базові CRUD-дії доходять до кінця`, async () => {
      if (profile.account === "returning") {
        // Дані створені до зміни «пристрою» — тут перевіряємо, що вони
        // підʼїхали з сервера, а не що їх можна створити ще раз.
        await goto(page, "/routine/habits");
        await expect(
          visibleText(page, `QA ${profile.id} звичка`),
        ).toBeVisible();
        await goto(page, "/finyk/transactions");
        // UI рендерить типографський мінус U+2212 і пробіл перед ₴ —
        // рядковий матчер з ASCII-дефісом його не ловить (знайдено
        // репетиційним прогоном бета-лейна 2026-08-07).
        await expect(visibleText(page, /[−-]\s?249,00\s?₴/)).toBeVisible();
        return;
      }
      await addExpense(page, `QA ${profile.id} витрата`, "249");
      await addHabit(page, `QA ${profile.id} звичка`);
      await addPantryItem(page, `QA${profile.id}молоко`);
    });

    test(`${profile.id}: стан переживає перезавантаження`, async () => {
      await goto(page, "/routine/habits");
      await reload(page);
      await expect(visibleText(page, `QA ${profile.id} звичка`)).toBeVisible();
    });

    test(`${profile.id}: тариф відображається консистентно`, async () => {
      await goto(page, "/pricing");
      if (profile.plan === "pro") {
        // Платнику пропонують керувати підпискою, а не купувати її знову.
        await expect(
          page.getByRole("button", { name: /Керувати підпискою/ }),
        ).toBeVisible();
      } else {
        await expect(visibleText(page, "Зараз твій план")).toBeVisible();
      }
    });

    test(`${profile.id}: PDF-експорт відповідає тарифу`, async () => {
      await goto(page, "/insights");
      await page.getByRole("button", { name: /Експортувати PDF/ }).click();
      const paywall = page.getByText("PDF-звіти у Premium");
      if (profile.plan === "pro") {
        await expect(paywall).toBeHidden();
      } else {
        await expect(paywall).toBeVisible();
      }
    });

    test(`${profile.id}: прогін не залишив неперехоплених винятків`, async () => {
      expect(
        uncaughtOnly(rec),
        `Профіль ${profile.id}${credentials ? ` (${credentials.email})` : ""}`,
      ).toEqual([]);
    });
  });
}
