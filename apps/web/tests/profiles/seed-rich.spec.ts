import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  QA_PASSWORD,
  addExpense,
  addHabit,
  addPantryItem,
  goto,
  signIn,
  signUp,
  visibleText,
} from "../utils/liveJourneyHelpers";

/**
 * Автосідер насиченого акаунта Q3 продуктового аудиту
 * (`docs/90-work/audits/2026-09-01-product-audit/accounts.md` § heavy).
 * Відновлений і розширений спадкоємець бета-сідера `tests/beta/seed-rich.spec.ts`
 * (видалений разом із бета-лейном, #946): проживає N «днів» одним
 * «пристроєм» — один signup, `storageState` між днями, тікаючий бек-дейт
 * годинник (`page.clock.install`), усі записи йдуть звичайним UI-шляхом і
 * синкаються на сервер. День-ключ у продукті device-local (ADR-0078), тому
 * підміна годинника — чесна симуляція «користувався щодня», а не бекдор.
 *
 * Патерн навмисно корельований під куровану пару `spending × habit_rate`
 * (`digestCorrelations.ts` § PAIRS): у «добрі» дні звичка відмічена
 * bulk-кнопкою і витрата велика, у «звичайні» — звичка пропущена і витрата
 * мала. Кожен 7-й день додає продукт у комору, щоб Їжа теж мала історію.
 * Тренування й прийоми їжі сідер НЕ створює: для них немає UI-хелперів, і
 * вони наповнюються руками в межах прогону (частина перевірки форм).
 *
 * AI-DANGER: фінальна верифікація — секція звʼязків мусить ЗАГОВОРИТИ.
 * Мовчання при |r|≈1 на n ≫ MIN_N означає зламаний синк або серії
 * (знахідка F7 репетиції 2026-08-07, B1 прийомного прогону 2026-08-09).
 * Це прийомний гейт, не флейк — не «лагодь» його послабленням асерту.
 *
 * Запуск (стек піднято зовні, як для решти profiles-лейна):
 *
 *   PW_SEED_RICH=1 PW_SEED_DAYS=60 pnpm --filter @sergeant/web e2e:seed-rich
 *
 * Наприкінці друкує креденшели — передай їх прогону через
 * PW_RICH_EMAIL / PW_RICH_PASSWORD (або внеси в `accounts.md` § 4).
 */

const SEED_ENABLED = process.env["PW_SEED_RICH"] === "1";

/** Скільки «днів» проживаємо. 60 = вікно `WINDOW_DAYS` кореляцій дайджесту;
 *  для швидкої репетиції задай PW_SEED_DAYS=8. */
const SEED_DAYS = Math.max(
  2,
  Number.parseInt(process.env["PW_SEED_DAYS"] ?? "60", 10) || 60,
);

const RUN_TAG = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const EMAIL =
  process.env["PW_RICH_EMAIL"] ??
  `qa.q3.${RUN_TAG}.${Date.now() % 100_000}@example.com`;

function dayAt(daysBack: number): Date {
  const now = new Date();
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: сідер симулює особистий день ПРИСТРОЮ тестера, день-ключ особистих сутностей device-local.
  d.setDate(d.getDate() - daysBack);
  // Опівдні «сьогодні» — у МАЙБУТНЬОМУ, якщо сідер запущено вранці/вночі.
  // Такий запис локально створюється, але на сервер не доїжджає (B6/B7,
  // прогін 2026-08-09). Тримаємо позначку в минулому.
  return d.getTime() > now.getTime() ? new Date(now.getTime() - 60_000) : d;
}

/** Сума витрати за день: «добрі» дні великі, «звичайні» малі, з невеликим
 *  детермінованим розкидом, щоб кільце категорій і графіки не були плоскими. */
function amountFor(daysBack: number, good: boolean): string {
  const jitter = (daysBack * 37) % 90;
  return String(good ? 700 + jitter * 5 : 30 + jitter);
}

/** Назви продуктів для комори — без цифр (див. коментар у циклі днів). */
const PANTRY_WORDS = [
  "молоко",
  "гречка",
  "сир",
  "яйця",
  "яблука",
  "рис",
  "олія",
  "кава",
  "хліб",
  "квасоля",
] as const;

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

test.describe.serial("@seed Q3 — автосідер насиченого акаунта", () => {
  test("проживає N днів корельованих даних і залишає акаунт", async ({
    browser,
  }) => {
    test.skip(
      !SEED_ENABLED,
      "PW_SEED_RICH не заданий — сідер запускається свідомо, бо створює акаунт і десятки днів записів",
    );
    // ~20 с на день: 60 днів ≈ 20 хв плюс верифікація.
    test.setTimeout(SEED_DAYS * 45_000 + 300_000);

    const missedPushDays: number[] = [];
    // «Пристрій»: кукі + localStorage переносяться між днями. Логін один —
    // signup першого дня: серія sign-in-ів з одного IP впирається в
    // auth-рейт-ліміт («Забагато спроб», прогін сідера 2026-08-07).
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
        // Автентифікація — на РЕАЛЬНОМУ годиннику: під зафіксованою датою
        // вхід зависає на /sign-in (клієнтська перевірка сесії треться об
        // зсув часу). День-ключ читається в момент ЗАПИСУ.
        await signUp(page, "QA Q3 Насичений", EMAIL, QA_PASSWORD);
      }
      // Годинник ЙДЕ від зсунутої дати (`install`, не `setFixedTime`):
      // заморожений Date.now() робить клієнтські ID однаковими між прогонами,
      // і сервер тихо відкидає «дублікати» (знахідка 2026-08-07).
      await page.clock.install({ time: dayAt(daysBack) });
      if (daysBack === SEED_DAYS - 1) {
        await addHabit(page, "QA Q3 звичка щодня");
      }

      // «Добрі» дні — непарні daysBack, щоб обидва кластери були рівні.
      const good = daysBack % 2 === 1;
      const before = pushes.count();
      if (good) {
        await goto(page, "/routine");
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
        await bulk.click();
        // Кнопка зникає, коли все відмічено — доказ, що відмітка лягла в
        // саме цей день.
        await expect(bulk).toBeHidden({ timeout: 10_000 });
        await addExpense(
          page,
          `QA Q3 добрий день ${daysBack}`,
          amountFor(daysBack, true),
        );
      } else {
        await addExpense(
          page,
          `QA Q3 звичайний день ${daysBack}`,
          amountFor(daysBack, false),
        );
      }
      if (daysBack % 7 === 3) {
        // Без цифр у назві: парсер комори читає хвостове число як кількість
        // («… продукт 59» → «продукт», 59 шт), і назва в списку вже інша.
        await addPantryItem(page, `QA Q3 ${PANTRY_WORDS[(daysBack / 7) | 0]!}`);
      }
      if (!(await waitForPushAfter(pushes, before))) {
        missedPushDays.push(daysBack);
      }

      deviceState = await context.storageState();
      await context.close();
    }

    if (missedPushDays.length > 0) {
      test.info().annotations.push({
        type: "warning",
        description: `Синк-пуш не спостерігався у днях: ${missedPushDays.join(", ")} — звʼязок може недорахувати ці дні`,
      });
    }

    // ─── Верифікація на реальному годиннику: чистий пристрій, sign-in ───
    const verifyCtx = await browser.newContext({
      locale: "uk-UA",
      timezoneId: "Europe/Kyiv",
    });
    const verifyPage = await verifyCtx.newPage();
    await signIn(verifyPage, EMAIL, QA_PASSWORD);
    await goto(verifyPage, "/routine/habits");
    await expect(visibleText(verifyPage, "QA Q3 звичка щодня")).toBeVisible({
      timeout: 30_000,
    });

    // Шлях 1 (SPA, як тестер): повне завантаження на транзакціях гріє кеш
    // Фініка, далі кліками «На хаб» → «Звʼязки».
    let silentSpa = true;
    for (let attempt = 0; attempt < 3 && silentSpa; attempt += 1) {
      await goto(verifyPage, "/finyk/transactions");
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
      silentSpa = await visibleText(verifyPage, /Поки що зв.язків не бачу/)
        .isVisible()
        .catch(() => false);
    }
    // Гейт має сенс лише від MIN_N=5 спільних днів із запасом: коротка
    // репетиція (PW_SEED_DAYS < 8) чесно НЕ може досягти порогу, тож там
    // мовчання — анотація, не провал.
    if (SEED_DAYS >= 8) {
      expect(
        silentSpa,
        `${SEED_DAYS} насіяних днів із |r|≈1 по парі spending×habit_rate — мовчання означає, що синк або серії зламані`,
      ).toBe(false);
    } else {
      test.info().annotations.push({
        type: "rehearsal",
        description: `SEED_DAYS=${SEED_DAYS} < 8: поріг MIN_N недосяжний за побудовою; звʼязки мовчать: ${silentSpa}`,
      });
    }

    // Шлях 2 (deep-link, регресія B1 прогону 2026-08-09): повне завантаження
    // /insights має давати ту саму відповідь, що й SPA-шлях. Не гейт сідера —
    // анотація, бо це знахідка прогону, а не умова наповнення.
    await goto(verifyPage, "/insights");
    await expect(visibleText(verifyPage, /Зв.язки між сферами/)).toBeVisible({
      timeout: 30_000,
    });
    const silentDeepLink = await visibleText(
      verifyPage,
      /Поки що зв.язків не бачу/,
    )
      .isVisible()
      .catch(() => false);
    if (silentDeepLink) {
      test.info().annotations.push({
        type: "finding",
        description:
          "B1 (2026-08-09) відтворюється: звʼязки мовчать при повному завантаженні /insights, хоча SPA-шлях їх показує",
      });
    }
    await verifyCtx.close();

    // Креденшели — оператору. QA-акаунт зі спільним QA-паролем лейна, не секрет.
    console.log(`[seed-rich] PW_RICH_EMAIL=${EMAIL}`);
    console.log(`[seed-rich] PW_RICH_PASSWORD=${QA_PASSWORD}`);
    test.info().annotations.push({
      type: "seed-account",
      description: `PW_RICH_EMAIL=${EMAIL} (пароль — стандартний QA_PASSWORD лейна); днів: ${SEED_DAYS}; deep-link мовчить: ${silentDeepLink}`,
    });
  });
});
