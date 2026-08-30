/**
 * Спільні хелпери «живих» браузерних лейнів — тих, що йдуть проти
 * реального сервера з реальною БД, а не проти моків: `e2e:profiles`
 * (локальний профільний прогін) і `e2e:beta` (прийомний прогін бети).
 *
 * Витягнуто з `tests/profiles/profile-journeys.spec.ts` без змін
 * поведінки, коли зʼявився другий споживач — інакше кожен лейн віз би
 * свою копію goto/signUp/CRUD і вони б розповзались (та сама історія,
 * що колись була з розсипаними seed-мапами до появи `seedFTUX`).
 */

import { expect, type Page } from "@playwright/test";

/** Спільний пароль QA-акаунтів живих лейнів. */
export const QA_PASSWORD = "QaProfile#2026";

/** Шум середовища, який не є дефектом продукту. */
export const IGNORED_CONSOLE = [
  /OPFS sqlite3_vfs/i,
  /Atomics\.wait/i,
  // VAPID-ключі та Mono-вебхук вимикаються env-прапорцями локально.
  /push\/vapid-public/i,
  /mono\/sync-state/i,
];

export interface Recorder {
  errors: string[];
}

export function recordConsole(page: Page): Recorder {
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
export function uncaughtOnly(rec: Recorder): string[] {
  return rec.errors.filter((e) => e.startsWith("pageerror:"));
}

/** Текст, який реально видно на екрані (а не його прихована копія в закритому діалозі). */
export function visibleText(page: Page, value: string | RegExp) {
  return page.getByText(value).filter({ visible: true }).first();
}

/**
 * Запрошення увійти після відмови аноніму.
 *
 * Свідомо шукаємо ДІЮ (посилання/кнопку входу), а не конкретну копію: тест
 * пінить контракт «відмова дає наступний крок», а не формулювання. Саме
 * відсутність такого кроку була дефектом F-25 (браузерний QA 2026-08-24) —
 * гість бачив голе «Доступ заборонено.» і не мав куди тиснути.
 */
export function signInInvite(page: Page) {
  return page
    .getByRole("link", { name: /увійти|вхід|зареєстр/i })
    .or(page.getByRole("button", { name: /увійти|вхід|зареєстр/i }))
    .filter({ visible: true })
    .first();
}

export async function goto(page: Page, route: string): Promise<void> {
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

/**
 * `page.reload()` із тією ж толерантністю до `net::ERR_ABORTED`, що й
 * {@link goto}.
 *
 * Сирий `page.reload()` рветься, якщо перезавантаження збіглося з роботою
 * застосунку — у спостереженому випадку в черзі стояв невідправлений
 * синк-пуш, і індикатор показував «Синхронізація · 1 в черзі». Це та сама
 * гонка тесту з роутером, яку `goto` лікує повтором, — просто reload її не
 * отримав (знахідка B9 прийомного прогону 2026-08-09: падало 1 із 4
 * прогонів на кроці «BT2: стан переживає перезавантаження»).
 *
 * Повтор рівно один: якщо навігація рветься двічі поспіль, це вже не гонка
 * і тест мусить впасти з оригінальною помилкою.
 */
export async function reload(page: Page): Promise<void> {
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
  } catch (err) {
    if (!String(err).includes("ERR_ABORTED")) throw err;
    await page.reload({ waitUntil: "domcontentloaded" });
  }
}

/**
 * Чекає, поки черга синку спорожніє — справжній барʼєр «мої записи вже на
 * сервері» перед тим, як інша персона піде їх читати.
 *
 * `OfflineBanner` рендерить `null` у стані спокою, а поки черга не порожня —
 * кнопку «Синхронізація · N в черзі». Тож зникнення цієї кнопки і є сигнал.
 *
 * Навіщо окремий барʼєр (знахідка BT4-флейку прогону 2026-08-09): персона,
 * що дописує дані, закривала «пристрій» одразу після останнього асерту, а
 * наступна персона починала читати з сервера те, що ще стояло в черзі.
 * Той самий урок уже вшито в автосідер (`trackSyncPushes` +
 * `waitForPushAfter`) — тут він потрібен рівно з тієї ж причини.
 */
export async function waitForSyncQuiet(
  page: Page,
  timeoutMs = 30_000,
): Promise<void> {
  await expect(page.getByRole("button", { name: /в черзі/ })).toBeHidden({
    timeout: timeoutMs,
  });
}

export async function signUp(
  page: Page,
  name: string,
  email: string,
  password: string = QA_PASSWORD,
): Promise<void> {
  await goto(page, "/sign-in");
  await page
    .getByRole("button", { name: /Немає акаунту\? Зареєструватися/ })
    .click();
  await page.getByPlaceholder("Твоє імʼя").fill(name);
  await page.getByPlaceholder("email@example.com").fill(email);
  await page.getByPlaceholder(/Мінімум 10 символів/).fill(password);
  await page
    .getByRole("button", { name: "Зареєструватися", exact: true })
    .click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

export async function signIn(
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

export async function addExpense(
  page: Page,
  title: string,
  amount: string,
): Promise<void> {
  await goto(page, "/finyk/transactions");
  // FAB — фан-меню з трьох дій (PR #818, чек-скан): головна кнопка
  // «Додати», дія «Додати витрату» — menuitem усередині фану.
  await page.getByRole("button", { name: "Додати", exact: true }).click();
  await page.getByRole("menuitem", { name: "Додати витрату" }).click();
  await page.getByPlaceholder("0").first().fill(amount);
  await page.getByPlaceholder(/Кава, продукти, таксі/).fill(title);
  await page
    .getByRole("button", { name: "Додати витрату", exact: true })
    .last()
    .click();
  await expect(visibleText(page, "Витрату додано.")).toBeVisible();
}

export async function addHabit(page: Page, title: string): Promise<void> {
  await goto(page, "/routine/habits");
  await page.getByRole("button", { name: "Додати звичку" }).first().click();
  await page.getByPlaceholder(/Напр\. Пити воду/).fill(title);
  await page
    .getByRole("button", { name: "Додати звичку", exact: true })
    .last()
    .click();
  await expect(visibleText(page, title)).toBeVisible();
}

export async function addPantryItem(page: Page, title: string): Promise<void> {
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
