import { expect, test, type Page, type BrowserContext } from "@playwright/test";

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

const PASSWORD = "QaProfile#2026";

/** Шум середовища, який не є дефектом продукту. */
const IGNORED_CONSOLE = [
  /OPFS sqlite3_vfs/i,
  /Atomics\.wait/i,
  // VAPID-ключі та Mono-вебхук вимикаються env-прапорцями локально.
  /push\/vapid-public/i,
  /mono\/sync-state/i,
];

interface Recorder {
  errors: string[];
}

function recordConsole(page: Page): Recorder {
  const rec: Recorder = { errors: [] };
  page.on("pageerror", (err) => {
    rec.errors.push(`pageerror: ${err.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    rec.errors.push(`console: ${text}`);
  });
  return rec;
}

/**
 * Chromium друкує в консоль «Failed to load resource: …» на кожну не-2xx
 * відповідь, без URL — відрізнити продуктовий баг від локально вимкненого
 * сервісу (AI-квота, VAPID, Mono-вебхук, rate-limit web-vitals) там
 * неможливо. Сигнал, який справді щось означає, — це неперехоплений виняток
 * (`pageerror`); за HTTP-статусами дивись лог сервера.
 */
function uncaughtOnly(rec: Recorder): string[] {
  return rec.errors.filter((e) => e.startsWith("pageerror:"));
}

/** Текст, який реально видно на екрані (а не його прихована копія в закритому діалозі). */
function visibleText(page: Page, value: string | RegExp) {
  return page.getByText(value).filter({ visible: true }).first();
}

async function goto(page: Page, route: string): Promise<void> {
  try {
    await page.goto(route, { waitUntil: "domcontentloaded" });
  } catch (err) {
    // Клієнтський редірект (напр. пост-signup міграція стану) може перервати
    // щойно розпочату навігацію — `net::ERR_ABORTED`. Це не дефект застосунку,
    // а гонка тесту з роутером: повторюємо один раз.
    if (!String(err).includes("ERR_ABORTED")) throw err;
    await page.goto(route, { waitUntil: "domcontentloaded" });
  }
  // `#root` порожній довше за розумний час = застосунок не змонтувався. Це не
  // повільність: entry-чанк або вже виконався, або його статичні залежності
  // (`vendor-react*`) померли з `net::ERR_ABORTED`, і тоді екран лишається
  // білим назавжди. Тому спершу даємо чесний таймаут, а вже потім — reload.
  const rootChildren = () =>
    page.evaluate(
      () => document.getElementById("root")?.childElementCount ?? -1,
    );
  try {
    await expect.poll(rootChildren, { timeout: 15_000 }).toBeGreaterThan(0);
  } catch {
    await page.reload({ waitUntil: "domcontentloaded" });
    const recovered = await expect
      .poll(rootChildren, { timeout: 15_000 })
      .toBeGreaterThan(0)
      .then(() => true)
      .catch(() => false);
    throw new Error(
      `Біла сторінка на ${route}: #root лишився порожнім. ` +
        `Reload ${recovered ? "врятував" : "НЕ врятував"} екран. ` +
        `Симптом гонки service-worker-а з бутом (аудит 2026-08-05, знахідка B1) — ` +
        `дивись docs/90-work/audits/2026-08-05-browser-profile-testing.md.`,
    );
  }
  await expect(
    page.getByRole("link", { name: "Перейти до основного вмісту" }),
  ).toBeAttached();
}

async function signUp(page: Page, name: string, email: string): Promise<void> {
  await goto(page, "/sign-in");
  await page
    .getByRole("button", { name: /Немає акаунту\? Зареєструватися/ })
    .click();
  await page.getByPlaceholder("Твоє ім'я").fill(name);
  await page.getByPlaceholder("email@example.com").fill(email);
  await page.getByPlaceholder(/Мінімум 10 символів/).fill(PASSWORD);
  await page
    .getByRole("button", { name: "Зареєструватися", exact: true })
    .click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

async function signIn(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await goto(page, "/sign-in");
  await page.getByPlaceholder("email@example.com").fill(email);
  await page.getByPlaceholder("Пароль").fill(password);
  await page.getByRole("button", { name: "Увійти", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

async function addExpense(
  page: Page,
  title: string,
  amount: string,
): Promise<void> {
  await goto(page, "/finyk/transactions");
  await page.getByRole("button", { name: "Додати витрату" }).first().click();
  await page.getByPlaceholder("0").first().fill(amount);
  await page.getByPlaceholder(/Кава, продукти, таксі/).fill(title);
  await page
    .getByRole("button", { name: "Додати витрату", exact: true })
    .last()
    .click();
  await expect(visibleText(page, "Витрату додано.")).toBeVisible();
}

async function addHabit(page: Page, title: string): Promise<void> {
  await goto(page, "/routine/habits");
  await page.getByRole("button", { name: "Додати звичку" }).first().click();
  await page.getByPlaceholder(/Напр\. Пити воду/).fill(title);
  await page
    .getByRole("button", { name: "Додати звичку", exact: true })
    .last()
    .click();
  await expect(visibleText(page, title)).toBeVisible();
}

async function addPantryItem(page: Page, title: string): Promise<void> {
  await goto(page, "/nutrition/pantry");
  await page.getByPlaceholder(/напр\. лосось/).fill(title);
  const add = page.getByRole("button", { name: "Додати", exact: true }).first();
  await expect(add).toBeEnabled();
  await add.click();
  // Рядковий матчер у Playwright — це вже case-insensitive підрядок (`exact`
  // за замовчуванням `false`), тож регулярка тут не потрібна; збирати її з
  // назви продукту було ще й `js/regex-injection` (CodeQL).
  await expect(visibleText(page, title)).toBeVisible();
}

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
        // під'їхали з сервера, а не що їх можна створити ще раз.
        await goto(page, "/routine/habits");
        await expect(
          visibleText(page, `QA ${profile.id} звичка`),
        ).toBeVisible();
        await goto(page, "/finyk/transactions");
        await expect(visibleText(page, "-249,00₴")).toBeVisible();
        return;
      }
      await addExpense(page, `QA ${profile.id} витрата`, "249");
      await addHabit(page, `QA ${profile.id} звичка`);
      await addPantryItem(page, `QA${profile.id}молоко`);
    });

    test(`${profile.id}: стан переживає перезавантаження`, async () => {
      await goto(page, "/routine/habits");
      await page.reload({ waitUntil: "domcontentloaded" });
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
        await expect(visibleText(page, "Зараз ваш план")).toBeVisible();
      }
    });

    test(`${profile.id}: PDF-експорт відповідає тарифу`, async () => {
      await goto(page, "/insights");
      await page.getByRole("button", { name: /Експортувати PDF/ }).click();
      const paywall = page.getByText("PDF-звіти — у Premium");
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
