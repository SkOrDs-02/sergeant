import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  QA_PASSWORD,
  addExpense,
  addHabit,
  goto,
  signIn,
  signUp,
  visibleText,
} from "../utils/liveJourneyHelpers";

/**
 * Автосідер персони BT5 «Активний тиждень» (дизайн-док
 * `docs/90-work/beta-launch/beta-browser-run.md` § Чому BT5 не
 * опціональна). Проживає 8 «днів» одним «пристроєм» тестера: один
 * signup, `storageState` між днями, тікаючий бек-дейт годинник
 * (`page.clock.install`), і всі записи йдуть звичайним UI-шляхом та
 * синкаються на сервер. День-ключ у продукті device-local (ADR-0078),
 * тому підміна годинника — це чесна симуляція «користувався щодня»,
 * а не бекдор у сховище.
 *
 * Патерн навмисно корельований під куровану пару `spending × habit_rate`
 * (`digestCorrelations.ts` § PAIRS): у «добрі» дні звичка відмічена
 * bulk-кнопкою і витрата велика, в «звичайні» — звичка пропущена і
 * витрата мала. Обидві метрики мають семантику «відсутність = виміряний
 * нуль» (`ABSENCE_MEANS`), тож 8 днів дають n ≥ MIN_N=5 і |r| ≫ 0.4 —
 * секція звʼязків зобовʼязана заговорити.
 *
 * AI-DANGER: поки відкрита знахідка F7 (звіт репетиції 2026-08-07 —
 * серія spending читає лише Monobank-дзеркало, ручні витрати для
 * звʼязків невидимі) фінальна верифікація ЧЕСНО ЧЕРВОНА на
 * manual-only акаунті. Це прийомний гейт, не флейк — не «лагодь» його
 * послабленням асерту.
 *
 * Запуск (стек як для решти лейна; проти бети — додати PW_BETA_BASE_URL):
 *
 *   PW_BETA_SEED=1 pnpm --filter @sergeant/web exec playwright test \
 *     --config playwright.beta.config.ts --grep @seed
 *
 * Наприкінці друкує креденшели акаунта — передай їх журні-прогону через
 * PW_BETA_RICH_EMAIL / PW_BETA_RICH_PASSWORD.
 */

const SEED_ENABLED = process.env["PW_BETA_SEED"] === "1";

/** Скільки «днів» проживаємо. 8 = запас над MIN_N=5 на випадок
 *  недоїхавшого синку одного-двох днів. */
const SEED_DAYS = 8;

const RUN_TAG = `${Date.now()}`;
const EMAIL = `qa.beta.bt5.${RUN_TAG}@example.com`;

function dayAt(daysBack: number): Date {
  const now = new Date();
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: сідер симулює особистий день ПРИСТРОЮ тестера (звичка/витрата), а день-ключ особистих сутностей device-local за каноном.
  d.setDate(d.getDate() - daysBack);
  // Опівдні «сьогодні» — у МАЙБУТНЬОМУ, якщо сідер запущено вночі. Такий
  // запис локально створюється (тост є), але на сервер не доїжджає, і
  // прогін мовчки лишається без останнього дня — 7 із 8 замість 8
  // (знахідка B6/B7, прогін 2026-08-09). Тримаємо позначку в минулому.
  return d.getTime() > now.getTime() ? new Date(now.getTime() - 60_000) : d;
}

/**
 * Лічильник POST /api/v2/sync/push — щоб не закривати «день», поки
 * черга опів не пішла на сервер (урок репетиції: ранній close контексту
 * лишає записи незапушеними).
 */
function trackSyncPushes(page: Page): { count: () => number } {
  let n = 0;
  page.on("response", (res) => {
    if (
      res.url().includes("/api/v2/sync/push") &&
      res.request().method() === "POST" &&
      res.ok()
    ) {
      n += 1;
    }
  });
  return { count: () => n };
}

async function waitForPushAfter(
  pushes: { count: () => number },
  before: number,
): Promise<boolean> {
  return expect
    .poll(() => pushes.count(), { timeout: 20_000 })
    .toBeGreaterThan(before)
    .then(() => true)
    .catch(() => false);
}

test.describe.serial("@seed BT5 — автосідер активного тижня", () => {
  test("проживає тиждень корельованих даних і залишає акаунт", async ({
    browser,
  }) => {
    test.skip(
      !SEED_ENABLED,
      "PW_BETA_SEED не заданий — сідер запускається свідомо, бо створює акаунт і 8 днів записів",
    );
    test.setTimeout(600_000);

    const missedPushDays: number[] = [];
    // «Пристрій» тестера: кукі + localStorage переносяться між днями, як
    // на одному телефоні. Це не лише реалістичніше за 8 чистих контекстів
    // з 8 логінами — це ще й обовʼязково: серія sign-in-ів з одного IP
    // впирається в auth-рейт-ліміт («Забагато спроб» — знахідка прогону
    // сідера 2026-08-07). Логін тут один: signup першого дня.
    let deviceState:
      Awaited<ReturnType<BrowserContext["storageState"]>> | undefined;

    for (let daysBack = SEED_DAYS - 1; daysBack >= 0; daysBack -= 1) {
      const context: BrowserContext = await browser.newContext({
        locale: "uk-UA",
        timezoneId: "Europe/Kyiv",
        ...(deviceState ? { storageState: deviceState } : {}),
      });
      const page = await context.newPage();
      const pushes = trackSyncPushes(page);

      if (daysBack === SEED_DAYS - 1) {
        // Автентифікація — на РЕАЛЬНОМУ годиннику: під зафіксованою
        // датою вхід зависає на /sign-in (клієнтська перевірка сесії
        // треться об зсув часу — знахідка того ж прогону). День-ключ
        // читається в момент ЗАПИСУ, тож дату фіксуємо після входу.
        await signUp(page, "QA BT5", EMAIL, QA_PASSWORD);
      }
      // Годинник ЙДЕ від зсунутої дати (`install`, не `setFixedTime`):
      // заморожений Date.now() робить клієнтські ID записів однаковими
      // між прогонами сідера, і сервер тихо відкидає «дублікати», що
      // належать акаунту попереднього прогону — саме так три прогони
      // поспіль лишали нові акаунти без жодної витрати на сервері
      // (знахідка 2026-08-07). Тікаючий бек-дейт = чесний «пристрій із
      // переведеною датою»: таймери, дебаунси і синк живуть як у проді.
      await page.clock.install({ time: dayAt(daysBack) });
      if (daysBack === SEED_DAYS - 1) {
        await addHabit(page, "QA BT5 звичка тижня");
      }

      // «Добрі» дні — непарні daysBack (включно з першим, днем signup),
      // щоб обидва кластери мали по 4 точки.
      const good = daysBack % 2 === 1;
      if (good) {
        await goto(page, "/routine");
        // Модуль може відкритись на останній активній вкладці («Звички»
        // після addHabit — слід F1) — bulk-кнопка живе на «Огляд»,
        // переходимо туди явно.
        const overviewTab = page
          .getByRole("tab", { name: "Огляд" })
          .or(page.getByRole("button", { name: "Огляд" }))
          .or(page.getByRole("link", { name: "Огляд" }))
          .first();
        if (await overviewTab.isVisible().catch(() => false)) {
          await overviewTab.click();
        }
        const bulk = page.getByRole("button", {
          name: /Відмітити всі звички на цей день/,
        });
        await expect(bulk).toBeVisible({ timeout: 15_000 });
        const before = pushes.count();
        await bulk.click();
        // Кнопка зникає, коли все відмічено (`canBulkMark`) — видимий
        // доказ, що відмітка застосувалась саме до цього дня.
        await expect(bulk).toBeHidden({ timeout: 10_000 });
        await addExpense(page, `QA BT5 добрий день ${daysBack}`, "900");
        if (!(await waitForPushAfter(pushes, before)))
          missedPushDays.push(daysBack);
      } else {
        const before = pushes.count();
        await addExpense(page, `QA BT5 звичайний день ${daysBack}`, "40");
        if (!(await waitForPushAfter(pushes, before)))
          missedPushDays.push(daysBack);
      }

      // Знімок «пристрою» для наступного дня — ДО закриття контексту.
      deviceState = await context.storageState();
      await context.close();
    }

    if (missedPushDays.length > 0) {
      test.info().annotations.push({
        type: "warning",
        description: `Синк-пуш не спостерігався у днях: ${missedPushDays.join(", ")} — звʼязок може недорахувати ці дні`,
      });
    }

    // ─── Верифікація на реальному годиннику: чистий пристрій, sign-in,
    //     звʼязки мусять заговорити ───
    const verifyCtx = await browser.newContext({
      locale: "uk-UA",
      timezoneId: "Europe/Kyiv",
    });
    const verifyPage = await verifyCtx.newPage();
    await signIn(verifyPage, EMAIL, QA_PASSWORD);
    // Секція звʼязків рахує серії ОДИН раз на маунт (useMemo з порожніми
    // deps у CrossModuleLinksSection) — заходити на /insights до
    // завершення pull-гідрації марно: перерахунку не буде. Тому спершу
    // доказ гідрації в обох модулях-донорах пари, і лише потім — свіжий
    // маунт /insights.
    await goto(verifyPage, "/routine/habits");
    await expect(visibleText(verifyPage, "QA BT5 звичка тижня")).toBeVisible({
      timeout: 30_000,
    });
    // Серії читають Фінік через кеш SQLite (`getCachedFinykSqliteState`)
    // — синглтон JS-графа ДОКУМЕНТА: повна навігація на /insights обнуляє
    // його, і секція рахує по порожньому (так виглядала «0 з 5» при
    // повній базі — знахідка сідера). Тому як тестер: повне завантаження
    // на транзакціях (кеш гріється даними), далі SPA-кліками «На хаб» →
    // «Звʼязки» — без reload, кеш живий на момент маунту секції.
    let silent = true;
    for (let attempt = 0; attempt < 3 && silent; attempt += 1) {
      await goto(verifyPage, "/finyk/transactions");
      // Доказ гідрації — будь-яка група дня. Чекати саме «Сьогодні» не
      // можна: сідер, запущений після опівночі, кладе день 0 у майбутнє
      // (`dayAt(0)` = сьогодні 12:00), той запис не доїжджає на сервер, і
      // остання видима група — вчорашня (знахідка B6, прогін 2026-08-09).
      await expect(
        verifyPage.getByRole("button", { name: /^Розгорнути / }).first(),
      ).toBeVisible({ timeout: 30_000 });
      await verifyPage.getByRole("button", { name: "На хаб" }).click();
      const hubNav = verifyPage.getByRole("navigation", {
        name: "Розділи хабу",
      });
      await expect(hubNav).toBeVisible({ timeout: 15_000 });
      await hubNav.getByRole("tab", { name: /Зв.язки/ }).click();
      await expect(visibleText(verifyPage, /Зв.язки між сферами/)).toBeVisible({
        timeout: 15_000,
      });
      silent = await visibleText(verifyPage, /Поки що зв.язків не бачу/)
        .isVisible()
        .catch(() => false);
    }
    expect(
      silent,
      "8 насіяних днів із |r|≈1 по парі spending×habit_rate — стан мовчання означає, що синк або серії зламані",
    ).toBe(false);
    await verifyCtx.close();

    // Креденшели — оператору для журні-прогону (PW_BETA_RICH_*).
    // Це QA-акаунт із загальновідомим QA-паролем лейна, не секрет.
    console.log(`[seed-rich] PW_BETA_RICH_EMAIL=${EMAIL}`);
    console.log(`[seed-rich] PW_BETA_RICH_PASSWORD=${QA_PASSWORD}`);
    test.info().annotations.push({
      type: "seed-account",
      description: `PW_BETA_RICH_EMAIL=${EMAIL} (пароль — стандартний QA_PASSWORD лейна)`,
    });
  });
});
