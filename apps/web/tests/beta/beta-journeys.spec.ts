import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  QA_PASSWORD,
  addExpense,
  addHabit,
  addPantryItem,
  goto,
  recordConsole,
  signIn,
  signUp,
  uncaughtOnly,
  visibleText,
  type Recorder,
} from "../utils/liveJourneyHelpers";
import { seedFTUX } from "../utils/seedFTUX";
import { MAX_LIVE_AI_MESSAGES_PER_RUN } from "./betaMatrix";

/**
 * Прийомний браузерний прогін бети — auto-половина матриці
 * `betaMatrix.ts`. Дизайн, порядок циклів, manual-чекліст і критерії
 * приймання — `docs/90-work/beta-launch/beta-browser-run.md`.
 *
 * Два режими (обидва — цей самий файл):
 *
 *  - РЕПЕТИЦІЯ (без env): проти локального стека, як `e2e:profiles`
 *    (Postgres + `@sergeant/server` :3000 + прод-білд у `vite preview`
 *    :4173). AI-кроки скіпаються з причиною.
 *  - БОЙОВИЙ: `PW_BETA_BASE_URL=https://<бета> PW_BETA_LIVE_AI=1` —
 *    проти живого бета-середовища; пише РЕАЛЬНІ дані в прод-базу, тому
 *    запускається ДО розсилки інвайтів (див. дизайн-док § Режими).
 *
 * Змінні акаунтів (без них відповідні персони скіпаються голосно):
 *   PW_BETA_PRO_EMAIL / PW_BETA_PRO_PASSWORD   — BT3/BT4, Pro виданий
 *     через `scripts/billing/grant-beta-pro.mjs` (status='trialing')
 *   PW_BETA_RICH_EMAIL / PW_BETA_RICH_PASSWORD — BT5, ≥7 днів даних
 */

const LIVE_AI = process.env["PW_BETA_LIVE_AI"] === "1";
/**
 * Ціль — розгорнута бета, а не локальна репетиція. Частина санітарних
 * перевірок має сенс лише там: локальний стек свідомо будується з
 * `VITE_API_BASE_URL=http://127.0.0.1:3000` і ходить на API крос-ориджн
 * через CORS (`vite preview` не проксіює `/api` — проксі є лише в dev і
 * на edge бети), тож same-origin-інваріант у репетиції хибно-червоний.
 */
const IS_BETA_TARGET = Boolean(process.env["PW_BETA_BASE_URL"]);
const PRO_EMAIL = process.env["PW_BETA_PRO_EMAIL"];
const PRO_PASSWORD = process.env["PW_BETA_PRO_PASSWORD"] ?? QA_PASSWORD;
const RICH_EMAIL = process.env["PW_BETA_RICH_EMAIL"];
const RICH_PASSWORD = process.env["PW_BETA_RICH_PASSWORD"] ?? QA_PASSWORD;

/** Мітка прогону — звʼязує записи BT3 із перевіркою BT4 на «іншому пристрої». */
const RUN_TAG = `${Date.now()}`;

/**
 * Бюджетний лічильник живих AI-повідомлень — спільний на весь прогін
 * (workers=1). Кожне повідомлення — реальні токени під денними порогами
 * бети; коли ліміт вибрано, наступний AI-крок скіпається, а не «якось
 * доганяє».
 */
let aiMessagesSpent = 0;

function takeAiBudget(count = 1): boolean {
  if (aiMessagesSpent + count > MAX_LIVE_AI_MESSAGES_PER_RUN) return false;
  aiMessagesSpent += count;
  return true;
}

/**
 * Надсилає живе повідомлення Сержанту і чекає відповіді POST /api/chat.
 * Патерн — `tests/smoke/hub-chat-live-smoke.spec.ts`.
 */
async function sendChatMessage(
  page: Page,
  text: string,
): Promise<{ status: number }> {
  await goto(page, "/chat");
  const input = page.getByLabel("Повідомлення асистенту");
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(text);

  const chatResponse = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        url.pathname.endsWith("/chat") && response.request().method() === "POST"
      );
    },
    { timeout: 90_000 },
  );
  await page.getByRole("button", { name: "Надіслати" }).click();
  const response = await chatResponse;
  return { status: response.status() };
}

/** Кількість озвучуваних відповідей асистента на екрані — маркер реплік. */
function assistantReplies(page: Page) {
  return page.getByRole("button", { name: "Озвучити відповідь" });
}

/**
 * `goto`, стійкий до «крадіжки» deep-link-а: у репетиційному прогоні
 * 2026-08-07 бут на `/pricing` одразу після CRUD в модулі інколи
 * програвав гонку відновленню модульного стану, і сторінка сама їхала
 * на `/routine/habits` (потенційний продуктовий баг — записаний у
 * знахідках прогону). Повторюємо навігацію один раз і лишаємо анотацію,
 * щоб подія була видимою в репорті, а не замаскованою.
 */
async function gotoSticky(page: Page, route: string): Promise<void> {
  await goto(page, route);
  const bounced = await page
    .waitForURL((u) => !u.pathname.startsWith(route), { timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (bounced) {
    test.info().annotations.push({
      type: "warning",
      description: `Deep-link ${route} було перехоплено (сторінка поїхала на ${new URL(page.url()).pathname}) — див. знахідку про викрадення deep-link-а`,
    });
    await goto(page, route);
  }
}

async function newPersonaContext(browser: {
  newContext: (opts: {
    locale: string;
    timezoneId: string;
  }) => Promise<BrowserContext>;
}): Promise<{ context: BrowserContext; page: Page; rec: Recorder }> {
  const context = await browser.newContext({
    locale: "uk-UA",
    timezoneId: "Europe/Kyiv",
  });
  const page = await context.newPage();
  return { context, page, rec: recordConsole(page) };
}

/**
 * Санітарний цикл — перший: якщо середовище зібране не так, персонні
 * прогони лише зашумлять картину.
 */
test.describe.serial("Цикл 3 — санітарні перевірки середовища", () => {
  test("запити застосунку йдуть same-origin (edge-проксі, без CORS)", async ({
    page,
  }) => {
    test.skip(
      !IS_BETA_TARGET,
      "Санітарна перевірка edge-проксі має сенс лише проти бети (PW_BETA_BASE_URL); локальна репетиція свідомо ходить на :3000 через CORS",
    );
    const apiOrigins = new Set<string>();
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.pathname.startsWith("/api/")) apiOrigins.add(url.origin);
      // Абсолютний URL на чужий хост із «/api» усередині шляху — теж обхід
      // проксі (пряме звернення до Coolify-хоста замість відносного шляху).
      if (!url.pathname.startsWith("/api/") && /\/api\//.test(url.pathname)) {
        apiOrigins.add(url.origin);
      }
    });
    await goto(page, "/");
    await goto(page, "/finyk/transactions");
    const pageOrigin = new URL(page.url()).origin;
    expect(
      [...apiOrigins].filter((o) => o !== pageOrigin),
      "Кожен /api-запит має йти на origin бети (BACKEND_URL-проксі), інакше CORS і ALLOWED_ORIGINS",
    ).toEqual([]);
  });

  test("бут переживає серію hard reload (регресія B1)", async ({ page }) => {
    // `goto` сам валить тест із діагностикою B1, якщо #root лишився порожнім.
    for (let i = 0; i < 3; i += 1) {
      await goto(page, "/");
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.getElementById("root")?.childElementCount ?? -1,
          ),
        )
        .toBeGreaterThan(0);
    }
  });

  test("юридичні сторінки відкриваються", async ({ page }) => {
    await goto(page, "/legal/offer");
    await expect(page).toHaveTitle(/оферта/i);
    await goto(page, "/legal/privacy");
    await expect(page).toHaveTitle(/приватності/i);
    await goto(page, "/legal/terms");
    await expect(page).toHaveTitle(/Умови використання/i);
  });
});

test.describe.serial("BT1 — анонім із Telegram-групи", () => {
  let context: BrowserContext;
  let page: Page;
  let rec: Recorder;

  test.beforeAll(async ({ browser }) => {
    ({ context, page, rec } = await newPersonaContext(browser));
    // Анонім без FTUX-стану — welcome-сплеш перекриває «/». Сідаємо
    // post-ftux (як hub-chat-live-smoke): питання BT1 — модулі і квота,
    // онбординг покривають BT2 (auto) і manual-чекліст.
    await seedFTUX(page, "post-ftux");
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("BT1: базові CRUD-дії працюють без акаунта", async () => {
    await addExpense(page, `QA BT1 витрата ${RUN_TAG}`, "149");
    await addHabit(page, `QA BT1 звичка ${RUN_TAG}`);
    await addPantryItem(page, `QABT1продукт${RUN_TAG}`);
  });

  test("BT1: стан переживає перезавантаження", async () => {
    await goto(page, "/routine/habits");
    await page.reload({ waitUntil: "domcontentloaded" });
    // Після reload список чекає гідрації SQLite (OPFS) — на повільному
    // пристрої це довше за дефолтні 5 с expect-таймауту (флейк першого
    // репетиційного прогону 2026-08-07).
    await expect(visibleText(page, `QA BT1 звичка ${RUN_TAG}`)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("BT1: PDF-експорт загейчено paywall-ом, а не помилкою", async () => {
    await goto(page, "/insights");
    await page.getByRole("button", { name: /Експортувати PDF/ }).click();
    await expect(page.getByText("PDF-звіти — у Premium")).toBeVisible();
  });

  test("BT1: Сержант відповідає або чемно просить увійти", async () => {
    test.skip(!LIVE_AI, "PW_BETA_LIVE_AI не заданий — живий AI не палимо");
    test.skip(!takeAiBudget(), "Бюджет AI-повідомлень прогону вичерпано");
    const { status } = await sendChatMessage(
      page,
      "Відповідай одним коротким реченням українською: beta QA ping.",
    );
    if (status === 200) {
      await expect(assistantReplies(page)).toHaveCount(1, { timeout: 90_000 });
    } else {
      // Анонімна квота (AI_DAILY_ANON_LIMIT, IP-ключ) могла бути вибрана
      // попереднім прогоном цього ж дня — тоді одразу 429 з підказкою.
      expect(status, "POST /api/chat для аноніма").toBe(429);
      await expect(
        visibleText(page, /Безкоштовна проба на сьогодні вичерпана/),
      ).toBeVisible();
    }
  });

  test("BT1: вичерпання анонімної квоти — підказка увійти, не глухий кут", async () => {
    test.skip(!LIVE_AI, "PW_BETA_LIVE_AI не заданий — живий AI не палимо");
    // Ліміт задається env-ом (дефолт коду 1); перевіряємо ПОВЕДІНКУ на
    // вичерпанні, тому шлемо ще до 3 повідомлень, поки не впремось у 429.
    let saw429 = false;
    for (let i = 0; i < 3 && !saw429; i += 1) {
      if (!takeAiBudget()) break;
      const { status } = await sendChatMessage(page, `beta QA ping ${i + 2}`);
      saw429 = status === 429;
    }
    if (!saw429) {
      test.info().annotations.push({
        type: "warning",
        description:
          "AI_DAILY_ANON_LIMIT вище за витрачений бюджет прогону — вичерпання не спостережено; перевір manual-кроком",
      });
      return;
    }
    await expect(
      visibleText(page, /Безкоштовна проба на сьогодні вичерпана/),
    ).toBeVisible();
  });

  test("BT1: без неперехоплених винятків", async () => {
    expect(uncaughtOnly(rec), "Персона BT1").toEqual([]);
  });
});

test.describe.serial("BT2 — щойно зареєстрований, ще без Pro", () => {
  let context: BrowserContext;
  let page: Page;
  let rec: Recorder;
  const email = `qa.beta.bt2.${RUN_TAG}@example.com`;

  test.beforeAll(async ({ browser }) => {
    // Без seedFTUX: питання персони — що бачить людина ОДРАЗУ після
    // signup, тож FTUX-стан має бути справжнім, а не насіяним.
    ({ context, page, rec } = await newPersonaContext(browser));
    await signUp(page, "QA BT2", email);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("BT2: хаб після signup не порожній (регресія B2)", async () => {
    await goto(page, "/");
    await expect(page.getByText(/Модулів увімкнено: 0 з/)).toBeHidden();
  });

  test("BT2: базові CRUD-дії доходять до кінця", async () => {
    await addExpense(page, `QA BT2 витрата ${RUN_TAG}`, "249");
    await addHabit(page, `QA BT2 звичка ${RUN_TAG}`);
    await addPantryItem(page, `QABT2продукт${RUN_TAG}`);
  });

  test("BT2: стан переживає перезавантаження", async () => {
    await goto(page, "/routine/habits");
    await page.reload({ waitUntil: "domcontentloaded" });
    // Див. коментар у BT1 — пост-reload гідрація SQLite повільніша за
    // дефолтний expect-таймаут.
    await expect(visibleText(page, `QA BT2 звичка ${RUN_TAG}`)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("BT2: тариф — free, PDF за paywall-ом", async () => {
    await goto(page, "/pricing");
    await expect(visibleText(page, "Зараз ваш план")).toBeVisible();
    await goto(page, "/insights");
    await page.getByRole("button", { name: /Експортувати PDF/ }).click();
    await expect(page.getByText("PDF-звіти — у Premium")).toBeVisible();
  });

  test("BT2: секція звʼязків мовчить чесно, не падає", async () => {
    await goto(page, "/insights");
    await expect(visibleText(page, /Зв.язки між сферами/)).toBeVisible();
  });

  test("BT2: Сержант відповідає залогіненому free-користувачу", async () => {
    test.skip(!LIVE_AI, "PW_BETA_LIVE_AI не заданий — живий AI не палимо");
    test.skip(!takeAiBudget(), "Бюджет AI-повідомлень прогону вичерпано");
    const { status } = await sendChatMessage(
      page,
      "Відповідай одним коротким реченням українською: beta QA ping.",
    );
    expect(status, "POST /api/chat для free-користувача").toBe(200);
    await expect(assistantReplies(page)).toHaveCount(1, { timeout: 90_000 });
  });

  test("BT2: без неперехоплених винятків", async () => {
    expect(uncaughtOnly(rec), `Персона BT2 (${email})`).toEqual([]);
  });
});

test.describe.serial("BT3 — канонічний бета-тестер (Pro trialing)", () => {
  let context: BrowserContext;
  let page: Page;
  let rec: Recorder;

  test.beforeAll(async ({ browser }) => {
    test.skip(
      !PRO_EMAIL,
      "PW_BETA_PRO_EMAIL не заданий — створи акаунт через UI бети і видай Pro скриптом grant-beta-pro.mjs (див. дизайн-док § Створення користувачів)",
    );
    ({ context, page, rec } = await newPersonaContext(browser));
    await signIn(page, PRO_EMAIL!, PRO_PASSWORD);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("BT3: базові CRUD-дії доходять до кінця", async () => {
    await addExpense(page, `QA BT3 витрата ${RUN_TAG}`, "349");
    await addHabit(page, `QA BT3 звичка ${RUN_TAG}`);
  });

  test("BT3: trialing відображається як платний план (B5)", async () => {
    await gotoSticky(page, "/pricing");
    // Платнику пропонують керувати підпискою, а не купувати її знову.
    await expect(
      page.getByRole("button", { name: /Керувати підпискою/ }),
    ).toBeVisible();
  });

  test("BT3: trialing знімає PDF-гейт", async () => {
    await gotoSticky(page, "/insights");
    await page.getByRole("button", { name: /Експортувати PDF/ }).click();
    await expect(page.getByText("PDF-звіти — у Premium")).toBeHidden();
  });

  test("BT3: Сержант відповідає Pro-користувачу", async () => {
    test.skip(!LIVE_AI, "PW_BETA_LIVE_AI не заданий — живий AI не палимо");
    test.skip(!takeAiBudget(), "Бюджет AI-повідомлень прогону вичерпано");
    const { status } = await sendChatMessage(
      page,
      "Відповідай одним коротким реченням українською: beta QA ping.",
    );
    expect(status, "POST /api/chat для Pro-користувача").toBe(200);
    await expect(assistantReplies(page)).toHaveCount(1, { timeout: 90_000 });
  });

  test("BT3: без неперехоплених винятків", async () => {
    expect(uncaughtOnly(rec), `Персона BT3 (${PRO_EMAIL})`).toEqual([]);
  });
});

test.describe.serial("BT4 — той самий тестер на другому пристрої", () => {
  let context: BrowserContext;
  let page: Page;
  let rec: Recorder;

  test.beforeAll(async ({ browser }) => {
    test.skip(
      !PRO_EMAIL,
      "PW_BETA_PRO_EMAIL не заданий — BT4 перевіряє повернення стану саме цього акаунта",
    );
    // Чистий контекст = порожні localStorage/SQLite, як новий телефон.
    ({ context, page, rec } = await newPersonaContext(browser));
    await signIn(page, PRO_EMAIL!, PRO_PASSWORD);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("BT4: дані BT3 приїхали з сервера на чистий пристрій", async () => {
    await goto(page, "/routine/habits");
    await expect(visibleText(page, `QA BT3 звичка ${RUN_TAG}`)).toBeVisible({
      timeout: 30_000,
    });
    await goto(page, "/finyk/transactions");
    // НЕ асертимо суму згорнутого заголовка дня: BT3-акаунт живе всю бету
    // (як у справжніх тестерів) і накопичує записи між прогонами, тож
    // агрегат дня — рухома мішень (знахідка репетиції: −349 → −1047).
    // Чекаємо групу дня (= синк доїхав), розгортаємо (bulk-гідрація день
    // не розгортає — свідома межа фіксу B6) і шукаємо запис ЦЬОГО прогону.
    await expect(
      page.getByRole("button", { name: /Сьогодні/ }).first(),
    ).toBeVisible({ timeout: 30_000 });
    const expand = page.getByRole("button", { name: /Розгорнути Сьогодні/ });
    if (await expand.count()) await expand.first().click();
    await expect(visibleText(page, `QA BT3 витрата ${RUN_TAG}`)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("BT4: активні модулі повернулись (регресія B2)", async () => {
    await goto(page, "/");
    await expect(page.getByText(/Модулів увімкнено: 0 з/)).toBeHidden();
  });

  test("BT4: Pro-стан видно і на другому пристрої", async () => {
    await gotoSticky(page, "/pricing");
    await expect(
      page.getByRole("button", { name: /Керувати підпискою/ }),
    ).toBeVisible();
  });

  test("BT4: без неперехоплених винятків", async () => {
    expect(uncaughtOnly(rec), `Персона BT4 (${PRO_EMAIL})`).toEqual([]);
  });
});

test.describe.serial("BT5 — активний тиждень (насіяні 7+ днів)", () => {
  let context: BrowserContext;
  let page: Page;
  let rec: Recorder;

  test.beforeAll(async ({ browser }) => {
    test.skip(
      !RICH_EMAIL,
      "PW_BETA_RICH_EMAIL не заданий — насій акаунт тижнем бек-дейтнутих даних (див. дизайн-док § Чому BT5 не опціональна)",
    );
    ({ context, page, rec } = await newPersonaContext(browser));
    await signIn(page, RICH_EMAIL!, RICH_PASSWORD);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("BT5: звʼязки показують контент, а не стан мовчання", async () => {
    // Дані звʼязків рахуються локально з синкнутих рядів — даємо синку
    // час, а потім вимагаємо КОНТЕНТ: стан мовчання рендерить
    // `silentTitle` («Поки що зв'язків не бачу»), знайдений звʼязок — ні.
    await goto(page, "/insights");
    await expect(visibleText(page, /Зв.язки між сферами/)).toBeVisible();
    await expect(
      visibleText(page, /Поки що зв.язків не бачу/),
      "На акаунті з ≥7 днями даних секція звʼязків не має лишатись у стані мовчання — перевір насіяний патерн (|r|≥0.4) і синк",
    ).toBeHidden({ timeout: 30_000 });
  });

  test("BT5: аналітика і дайджест рендеряться з тижнем даних", async () => {
    await goto(page, "/finyk/analytics");
    await goto(page, "/insights");
    // Глибина перевірки дайджесту/порад — manual-кроки insights-advice,
    // insights-digest (див. betaMatrix.ts): якість контенту судить людина.
  });

  test("BT5: без неперехоплених винятків", async () => {
    expect(uncaughtOnly(rec), `Персона BT5 (${RICH_EMAIL})`).toEqual([]);
  });
});
