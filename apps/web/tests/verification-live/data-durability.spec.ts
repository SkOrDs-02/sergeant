import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { waitForServiceWorkerActivated } from "../utils/serviceWorker";
import {
  addExpense as addExpenseRaw,
  addHabit as addHabitRaw,
  goto,
  QA_PASSWORD,
  reload,
  visibleText,
} from "../utils/liveJourneyHelpers";

// Знахідка D1 цього аудиту: запис, після якого сторінка зникає за <0,5 с,
// губиться. Пауза після кожного запису свідомо обходить це вікно, щоб фази
// нижче міряли sync/офлайн/конфлікти, а не ту саму гонку.
const SETTLE_MS = 2000;
const settled =
  <A extends [Page, ...unknown[]]>(fn: (...a: A) => Promise<void>) =>
  async (...a: A) => {
    await fn(...a);
    await a[0].waitForTimeout(SETTLE_MS);
  };
const addExpense = settled(addExpenseRaw);
const addHabit = settled(addHabitRaw);
// Непорожня комора ховає поле вводу в аркуш за «Додати продукти»; спільний
// хелпер знає лише інлайн-форму порожньої комори.
const addPantryItem = settled(async (page: Page, title: string) => {
  await goto(page, "/nutrition/pantry");
  const input = page.getByPlaceholder(/напр\. лосось/);
  const openSheet = page.getByRole("button", { name: "Додати продукти" });
  await expect(input.or(openSheet).first()).toBeVisible({ timeout: 30_000 });
  if (!(await input.isVisible())) await openSheet.click();
  await input.fill(title);
  const add = page.getByRole("button", { name: "Додати", exact: true }).last();
  await expect(add).toBeEnabled();
  await add.click();
  await expect(visibleText(page, title)).toBeVisible();
});

const API = "http://127.0.0.1:3000";
const DB = process.env["VERIFY_DB"] ?? "sergeant_verification_20260928";
const OUT = process.env["VERIFY_RESULTS"] ?? "verify-results.jsonl";
const RUN = Date.now().toString(36).slice(-5);

// ---------- запис результатів ----------

type Verdict = "pass" | "fail";
function record(phase: string, check: string, verdict: Verdict, detail = "") {
  const line = {
    at: new Date().toISOString(),
    run: RUN,
    phase,
    check,
    verdict,
    detail,
  };
  appendFileSync(OUT, JSON.stringify(line) + "\n");
  console.log(
    `[${verdict.toUpperCase()}] ${phase} :: ${check}${detail ? ` :: ${detail}` : ""}`,
  );
}

let shotPage: Page | undefined;
let shotN = 0;
async function check(phase: string, name: string, fn: () => Promise<unknown>) {
  try {
    const detail = await fn();
    record(phase, name, "pass", typeof detail === "string" ? detail : "");
    return true;
  } catch (err) {
    let shot = "";
    if (shotPage && !shotPage.isClosed()) {
      shot = `${process.env["PW_VERIFY_OUT"] ?? "."}/fail-${String(++shotN).padStart(2, "0")}.png`;
      await shotPage
        .screenshot({ path: shot, fullPage: true })
        .catch(() => (shot = ""));
    }
    const msg = String(err)
      // eslint-disable-next-line no-control-regex
      .replace(/\u001b\[[0-9;]*m/g, "")
      .split("\n")
      .slice(0, 3)
      .join(" | ")
      .slice(0, 400);
    record(phase, name, "fail", `${msg}${shot ? ` | shot=${shot}` : ""}`);
    return false;
  }
}

// ---------- серверна правда ----------

function sql(query: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "hub-postgres",
      "psql",
      "-U",
      "hub",
      "-d",
      DB,
      "-At",
      "-F",
      "|",
      "-c",
      query,
    ],
    { encoding: "utf8" },
  ).trim();
}
const q = (s: string) => s.replace(/'/g, "''");

const SERVER_ROW: Record<string, (userId: string, token: string) => string> = {
  finyk: (u, t) =>
    `SELECT count(*) FROM finyk_manual_expenses WHERE user_id='${q(u)}' AND deleted_at IS NULL AND data_json::text LIKE '%${q(t)}%'`,
  nutrition: (u, t) =>
    `SELECT count(*) FROM nutrition_pantry_items p WHERE p.user_id='${q(u)}' AND p.deleted_at IS NULL AND lower(row_to_json(p)::text) LIKE lower('%${q(t)}%')`,
  routine: (u, t) =>
    `SELECT count(*) FROM routine_habits WHERE user_id='${q(u)}' AND deleted_at IS NULL AND name LIKE '%${q(t)}%'`,
  fizruk: (u, t) =>
    `SELECT count(*) FROM fizruk_daily_log l WHERE l.user_id='${q(u)}' AND l.deleted_at IS NULL AND row_to_json(l)::text LIKE '%${q(t)}%'`,
  profile: (u, t) =>
    `SELECT count(*) FROM user_profile WHERE user_id='${q(u)}' AND payload::text LIKE '%${q(t)}%'`,
};

async function expectOnServer(
  module: string,
  userId: string,
  token: string,
  want = 1,
  timeoutMs = 45_000,
) {
  await expect
    .poll(() => Number(sql(SERVER_ROW[module]!(userId, token))), {
      timeout: timeoutMs,
      intervals: [1000],
    })
    .toBe(want);
  return `server rows=${want}`;
}

async function userIdOf(page: Page): Promise<string> {
  const res = await page.request.get(`${API}/api/me`);
  expect(res.ok(), `/api/me HTTP ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { user?: { id?: string } };
  expect(body.user?.id).toBeTruthy();
  return body.user!.id!;
}

// ---------- «пристрої» ----------

async function newDevice(
  browser: Browser,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await ctx.newPage();
  await seedFTUX(page, "post-ftux", { extra: { finyk_manual_only_v1: "1" } });
  await dismissWhatsNew(page);
  return { ctx, page };
}

// «Що нового» може вискочити посеред сесії після входу — закриваємо, щоб не
// перекривав кліки (шум середовища, не предмет цього аудиту).
async function dismissWhatsNew(page: Page) {
  await page.addLocatorHandler(
    page.getByRole("button", { name: "Зрозуміло", exact: true }),
    async (btn) => {
      // Модалка анімується і може відмонтуватись посеред кліку: падіння хендлера
      // валить увесь воркер і стирає спільний стан фаз.
      await btn.click({ timeout: 5000 }).catch(() => {});
    },
  );
}

async function syncIdle(page: Page, timeoutMs = 45_000) {
  await expect(page.getByRole("button", { name: /в черзі/ })).toBeHidden({
    timeout: timeoutMs,
  });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="offline-banner"]') === null,
    null,
    {
      timeout: timeoutMs,
    },
  );
}

// ---------- модульні дії та перевірки видимості ----------

// Заголовок дня — кнопка з `aria-expanded` і назвою «Сьогодні · N …»
// (TransactionDayHeader.tsx); старий aria-label «Розгорнути Сьогодні» зник.
async function expandTodayAndExpect(
  page: Page,
  text: string,
  timeoutMs = 30_000,
) {
  await expect(async () => {
    const collapsed = page
      .locator('button[aria-expanded="false"]')
      .filter({ hasText: /^Сьогодні/ });
    if ((await collapsed.count()) > 0)
      await collapsed.first().dispatchEvent("click");
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible({
      timeout: 1500,
    });
  }).toPass({ timeout: timeoutMs });
}

// Після входу застосунок має піти з `/sign-in`. Бачили, як хаб уже
// відрендерений, а адреса лишилась `/sign-in`: така фаза не валиться, але
// аномалія пишеться з обома версіями адреси (Playwright і сама сторінка).
async function waitLeftSignIn(page: Page, phase: string, label: string) {
  const hub = page.getByRole("tab", { name: "Головна" }).first();
  const left = await expect
    .poll(
      async () =>
        !/\/sign-in/.test(page.url()) ||
        (await hub.isVisible().catch(() => false)),
      {
        timeout: 120_000,
        intervals: [1000],
      },
    )
    .toBe(true)
    .then(
      () => true,
      () => false,
    );
  const href = await page.evaluate(() => location.href).catch(() => "?");
  if (left && /\/sign-in/.test(page.url())) {
    record(
      phase,
      `${label}: хаб на екрані, адреса лишилась /sign-in`,
      "fail",
      `page.url=${page.url()} location.href=${href}`,
    );
  }
  if (!left) {
    const body = (
      await page
        .locator("body")
        .innerText()
        .catch(() => "")
    )
      .replace(/\s+/g, " ")
      .slice(0, 500);
    record(
      phase,
      `${label} застряг`,
      "fail",
      `location.href=${href} screen: ${body}`,
    );
    throw new Error(`${label}: не пішов із /sign-in за 120 с`);
  }
}

// Реєстрація з анонімними даними проходить через гейт «Переношу дані…», який
// тримає `/sign-in`, поки сервер не підтвердить перенос. 5 с за замовчуванням
// для цього замало.
async function signUpAndWait(page: Page, name: string, mail: string) {
  await goto(page, "/sign-in");
  await page
    .getByRole("button", { name: /Немає акаунту\? Зареєструватися/ })
    .click();
  await page.getByPlaceholder("Твоє імʼя").fill(name);
  await page.getByPlaceholder("email@example.com").fill(mail);
  await page.getByPlaceholder(/Мінімум 10 символів/).fill(QA_PASSWORD);
  await page
    .getByRole("button", { name: "Зареєструватися", exact: true })
    .click();
  await waitLeftSignIn(page, "signup", `реєстрація ${mail}`);
}

// Вхід на свіжому пристрої теж проходить через той самий гейт переносу.
async function signInAndWait(page: Page, mail: string) {
  await goto(page, "/sign-in");
  await page.getByPlaceholder("email@example.com").fill(mail);
  await page.getByPlaceholder("Пароль").fill(QA_PASSWORD);
  await page.getByRole("button", { name: "Увійти", exact: true }).click();
  await waitLeftSignIn(page, "signin", `вхід ${mail}`);
}

async function seeExpense(page: Page, title: string) {
  await goto(page, "/finyk/transactions");
  await expandTodayAndExpect(page, title);
}
async function seeHabit(page: Page, title: string) {
  await goto(page, "/routine/habits");
  await expect(visibleText(page, title)).toBeVisible({ timeout: 30_000 });
}
async function seePantry(page: Page, title: string) {
  await goto(page, "/nutrition/pantry");
  await expect(visibleText(page, title)).toBeVisible({ timeout: 30_000 });
}
async function addBody(page: Page, weight: string, note: string) {
  await goto(page, "/fizruk/body");
  await page.getByLabel("Вага (кг)").fill(weight);
  await page.getByPlaceholder(/Як почуваєшся сьогодні/).fill(note);
  await page
    .getByRole("button", { name: /^Записати|^Оновити|^Зберегти/ })
    .first()
    .click();
  await expect(visibleText(page, /Записано|Оновлено|Збережено/)).toBeVisible({
    timeout: 10_000,
  });
  await page.waitForTimeout(SETTLE_MS);
}
async function seeBody(page: Page, weight: string) {
  await goto(page, "/fizruk/body");
  const uk = weight.replace(".", ",");
  await expect(
    page.getByRole("button", { name: new RegExp(`${uk} кг`) }).first(),
  ).toBeVisible({ timeout: 30_000 });
}
async function openMemory(page: Page) {
  await goto(page, "/profile");
  const toggle = page.getByRole("button", { name: /Памʼять/ }).first();
  if ((await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click();
}
async function addMemory(page: Page, fact: string) {
  await openMemory(page);
  const manualEmpty = page.getByRole("button", { name: "Заповнити вручну" });
  if (await manualEmpty.isVisible().catch(() => false)) {
    await manualEmpty.click();
  } else {
    await page
      .getByRole("button", { name: "Додати", exact: true })
      .first()
      .click();
    await page.getByRole("menuitem", { name: /Вручну/ }).click();
  }
  await page.locator("#memory-manual-step").fill(fact);
  await page.getByRole("button", { name: /Зберегти і далі|Завершити/ }).click();
  const close = page.getByRole("button", { name: "Закрити ручне заповнення" });
  if (await close.isVisible().catch(() => false)) await close.click();
  await expect(visibleText(page, fact)).toBeVisible();
  await page.waitForTimeout(SETTLE_MS);
}
async function seeMemory(page: Page, fact: string) {
  await openMemory(page);
  await expect(visibleText(page, fact)).toBeVisible({ timeout: 30_000 });
}
// KV-ключ без durable-дзеркала: остання вкладка Рутини
// (`hub_routine_main_tab_v1`). Лише локальний, на сервер не їде, тож на новому
// пристрої його немає за контрактом. «Статистику» ніхто в P1 не обирає, отже в
// анонімному розділі її немає, і читання звідти (знахідка D2) дало б іншу вкладку.
async function pickRoutineStatsTab(page: Page) {
  await goto(page, "/routine");
  await page
    .getByRole("tab", { name: /Статистика/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/routine\/stats/);
  await page.waitForTimeout(SETTLE_MS);
}
async function routineRestoresStatsTab(page: Page) {
  await goto(page, "/routine");
  await expect(page).toHaveURL(/\/routine\/stats/, { timeout: 30_000 });
}
// На /routine/habits кнопки рядка — «Деталі / Змінити / В архів / Видалити»
// без назви звички, тож рядок шукаємо як найближчого предка з цими кнопками.
function habitRowButton(page: Page, name: string, button: string) {
  // Предки назви звички в порядку документа йдуть від зовнішнього до
  // внутрішнього, тож `.last()` — найглибший, тобто сам рядок.
  return page
    .locator("div, li")
    .filter({ has: page.getByText(name, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: button, exact: true }) })
    .last()
    .getByRole("button", { name: button, exact: true });
}
async function renameHabit(page: Page, from: string, to: string) {
  await goto(page, "/routine/habits");
  await habitRowButton(page, from, "Змінити").click();
  const edit = page.getByRole("dialog", { name: "Редагувати звичку" });
  await expect(edit).toBeVisible({ timeout: 10_000 });
  await edit.getByLabel("Назва звички").fill(to);
  await edit.getByRole("button", { name: "Зберегти зміни" }).click();
  await expect(edit).toBeHidden();
  await page.waitForTimeout(SETTLE_MS);
}
async function deleteHabit(page: Page, name: string) {
  await goto(page, "/routine/habits");
  await page
    .getByRole("button", { name: `Ще дії зі звичкою ${name}`, exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Видалити" }).click();
  const confirm = page.getByRole("alertdialog");
  if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirm.getByRole("button", { name: "Видалити" }).click();
  }
  await expect(page.getByText(name, { exact: true })).toHaveCount(0, {
    timeout: 10_000,
  });
  await page.waitForTimeout(SETTLE_MS);
}
async function renameExpense(page: Page, from: string, to: string) {
  await goto(page, "/finyk/transactions");
  await expandTodayAndExpect(page, from);
  await page
    .getByRole("button")
    .filter({ hasText: from })
    .first()
    .dispatchEvent("click");
  const dlg = page.getByRole("dialog", { name: "Редагувати витрату" });
  await expect(dlg).toBeVisible();
  await dlg.getByLabel("Назва").fill(to);
  await dlg.getByRole("button", { name: "Зберегти" }).click();
  await expect(dlg).toBeHidden();
  await page.waitForTimeout(SETTLE_MS);
}

// ---------- спільний стан між фазами ----------

const T = (k: string) => `V${RUN} ${k}`;
const email = `verify_${RUN}@example.com`;
let userId = "";
let A: { ctx: BrowserContext; page: Page };
let B: { ctx: BrowserContext; page: Page };

test.beforeAll(() => {
  mkdirSync(".", { recursive: true });
  record("meta", `run=${RUN} db=${DB} email=${email}`, "pass");
});

test("P1 анонім: записи в усіх модулях переживають reload", async ({
  browser,
}) => {
  A = await newDevice(browser);
  const p = A.page;
  shotPage = p;
  const ph = "P1-anon-reload";
  await goto(p, "/");
  const me = await p.request.get(`${API}/api/me`);
  record(
    ph,
    "анонімність: /api/me",
    me.status() === 401 ? "pass" : "fail",
    `HTTP ${me.status()}`,
  );

  await check(ph, "finyk: створити витрату", () =>
    addExpense(p, T("F1"), "11"),
  );
  await check(ph, "nutrition: створити продукт у коморі", () =>
    addPantryItem(p, T("N1").toLowerCase()),
  );
  await check(ph, "routine: створити звичку", () => addHabit(p, T("R1")));
  await check(ph, "fizruk: запис ваги", () => addBody(p, "81.2", T("Z1")));

  await check(ph, "SW activated перед reload", async () =>
    String(await waitForServiceWorkerActivated(p)),
  );
  await reload(p);
  await check(ph, "finyk після reload", () => seeExpense(p, T("F1")));
  await check(ph, "nutrition після reload", () =>
    seePantry(p, T("N1").toLowerCase()),
  );
  await check(ph, "routine після reload", () => seeHabit(p, T("R1")));
  await check(ph, "fizruk після reload", () => seeBody(p, "81.2"));
  await check(ph, "profile: сторінка доступна аноніму?", async () => {
    await goto(p, "/profile");
    return p.url();
  });
});

test("P2 анонім → реєстрація: дані переносяться в акаунт і доїжджають на сервер", async () => {
  const p = A.page;
  shotPage = p;
  const ph = "P2-anon-to-account";
  await waitForServiceWorkerActivated(p);
  const toast = p.getByText("Дані перенесено й безпечно збережено у профілі.", {
    exact: true,
  });
  const toastSeen = toast.waitFor({ state: "visible", timeout: 60_000 }).then(
    () => true,
    () => false,
  );
  await signUpAndWait(p, "Verify A", email);
  record(ph, "тост «Дані перенесено»", (await toastSeen) ? "pass" : "fail");
  userId = await userIdOf(p);
  record(ph, `userId=${userId}`, "pass");

  await check(ph, "server: finyk F1", () =>
    expectOnServer("finyk", userId, T("F1")),
  );
  await check(ph, "server: nutrition N1", () =>
    expectOnServer("nutrition", userId, T("N1")),
  );
  await check(ph, "server: routine R1", () =>
    expectOnServer("routine", userId, T("R1")),
  );
  await check(ph, "server: fizruk Z1", () =>
    expectOnServer("fizruk", userId, T("Z1")),
  );

  await check(ph, "profile: додати факт у памʼять", () =>
    addMemory(p, T("M1")),
  );
  await check(ph, "server: profile M1", () =>
    expectOnServer("profile", userId, T("M1")),
  );
  await check(ph, "KV без дзеркала: обрати вкладку «Статистика»", () =>
    pickRoutineStatsTab(p),
  );

  await reload(p);
  await check(ph, "UI після reload: finyk", () => seeExpense(p, T("F1")));
  await check(ph, "UI після reload: routine", () => seeHabit(p, T("R1")));
  await check(ph, "UI після reload: memory", () => seeMemory(p, T("M1")));
  await check(ph, "UI після reload: KV-вкладка Рутини на місці", () =>
    routineRestoresStatsTab(p),
  );
});

test("P3 новий пристрій: свіжий логін підтягує все", async ({ browser }) => {
  const ph = "P3-device-B-pull";
  await syncIdle(A.page).catch(() => undefined);
  B = await newDevice(browser);
  const p = B.page;
  shotPage = p;
  await signInAndWait(p, email);
  await check(ph, "B: finyk F1", () => seeExpense(p, T("F1")));
  await check(ph, "B: nutrition N1", () => seePantry(p, T("N1").toLowerCase()));
  await check(ph, "B: routine R1", () => seeHabit(p, T("R1")));
  await check(ph, "B: fizruk 81.2", () => seeBody(p, "81.2"));
  await check(ph, "B: memory M1", () => seeMemory(p, T("M1")));
  await check(ph, "B: KV-вкладка Рутини лишилась локальною на A", async () => {
    await goto(p, "/routine");
    await p.waitForTimeout(3000);
    await expect(p).not.toHaveURL(/\/routine\/stats/);
  });
  await check(ph, "B: KV-вкладка Рутини переживає reload", async () => {
    await pickRoutineStatsTab(p);
    await reload(p);
    await routineRestoresStatsTab(p);
  });
});

test("P4 офлайн на A: запис, reload без мережі, догон на сервер і на B", async () => {
  const p = A.page;
  shotPage = p;
  const ph = "P4-offline";
  await syncIdle(p).catch(() => undefined);
  await waitForServiceWorkerActivated(p);
  await A.ctx.setOffline(true);

  await check(ph, "offline: finyk F2", () => addExpense(p, T("F2"), "22"));
  await check(ph, "offline: nutrition N2", () =>
    addPantryItem(p, T("N2").toLowerCase()),
  );
  await check(ph, "offline: routine R2", () => addHabit(p, T("R2")));
  await check(ph, "offline: fizruk Z2", () => addBody(p, "82.3", T("Z2")));
  await check(ph, "offline: memory M2", () => addMemory(p, T("M2")));
  await check(ph, "offline: індикатор черги видно", async () => {
    await expect(
      p.getByRole("button", { name: /в черзі|Офлайн|офлайн/ }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
  await check(ph, "server НЕ має F2 поки офлайн", () =>
    expectOnServer("finyk", userId, T("F2"), 0, 3000),
  );

  await check(ph, "offline reload: застосунок відкривається", async () => {
    await reload(p);
    await expect
      .poll(
        () =>
          p.evaluate(
            () => document.getElementById("root")?.childElementCount ?? 0,
          ),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);
  });
  await check(ph, "offline reload: finyk F2", () => seeExpense(p, T("F2")));
  await check(ph, "offline reload: nutrition N2", () =>
    seePantry(p, T("N2").toLowerCase()),
  );
  await check(ph, "offline reload: routine R2", () => seeHabit(p, T("R2")));
  await check(ph, "offline reload: fizruk 82.3", () => seeBody(p, "82.3"));
  await check(ph, "offline reload: memory M2", () => seeMemory(p, T("M2")));

  await A.ctx.setOffline(false);
  await check(ph, "online: черга спорожніла", () => syncIdle(p, 60_000));
  await check(ph, "server: finyk F2", () =>
    expectOnServer("finyk", userId, T("F2")),
  );
  await check(ph, "server: nutrition N2", () =>
    expectOnServer("nutrition", userId, T("N2")),
  );
  await check(ph, "server: routine R2", () =>
    expectOnServer("routine", userId, T("R2")),
  );
  await check(ph, "server: fizruk Z2", () =>
    expectOnServer("fizruk", userId, T("Z2")),
  );
  await check(ph, "server: memory M2", () =>
    expectOnServer("profile", userId, T("M2"), 1, 60_000),
  );
  await check(ph, "server: F2 без дубля", async () => {
    const n = Number(sql(SERVER_ROW["finyk"]!(userId, T("F2"))));
    expect(n).toBe(1);
  });

  const b = B.page;
  shotPage = b;
  shotPage = b;
  await reload(b);
  await check(ph, "B після reload: finyk F2", () => seeExpense(b, T("F2")));
  await check(ph, "B після reload: nutrition N2", () =>
    seePantry(b, T("N2").toLowerCase()),
  );
  await check(ph, "B після reload: routine R2", () => seeHabit(b, T("R2")));
  await check(ph, "B після reload: fizruk 82.3", () => seeBody(b, "82.3"));
  await check(ph, "B після reload: memory M2", () => seeMemory(b, T("M2")));
});

test("P5 правки й видалення з B доходять до A", async () => {
  const ph = "P5-edit-delete-propagation";
  const b = B.page;
  shotPage = b;
  await check(ph, "B: перейменувати F1", () =>
    renameExpense(b, T("F1"), T("F1-ed")),
  );
  await check(ph, "B: видалити R1", () => deleteHabit(b, T("R1")));
  await check(ph, "B: черга спорожніла", () => syncIdle(b, 60_000));
  await check(ph, "server: F1-ed є", () =>
    expectOnServer("finyk", userId, T("F1-ed")),
  );
  await check(ph, "server: R1 soft-deleted", async () => {
    await expect
      .poll(
        () =>
          sql(
            `SELECT count(*) FROM routine_habits WHERE user_id='${q(userId)}' AND name='${q(T("R1"))}' AND deleted_at IS NULL`,
          ),
        { timeout: 30_000 },
      )
      .toBe("0");
  });
  const a = A.page;
  shotPage = a;
  shotPage = a;
  await reload(a);
  await check(ph, "A: бачить F1-ed", () => seeExpense(a, T("F1-ed")));
  await check(ph, "A: R1 зник", async () => {
    await goto(a, "/routine/habits");
    await expect(a.getByText(T("R1"), { exact: true })).toHaveCount(0, {
      timeout: 30_000,
    });
  });
});

test("P6 конфлікт: обидва пристрої офлайн правлять одну звичку", async () => {
  const ph = "P6-lww-conflict";
  const a = A.page;
  shotPage = a;
  const b = B.page;
  shotPage = b;
  await syncIdle(a).catch(() => undefined);
  await syncIdle(b).catch(() => undefined);
  await A.ctx.setOffline(true);
  await B.ctx.setOffline(true);
  await check(ph, "A offline: R2 → R2-A", () =>
    renameHabit(a, T("R2"), T("R2-A")),
  );
  await a.waitForTimeout(1500);
  await check(ph, "B offline (пізніше): R2 → R2-B", () =>
    renameHabit(b, T("R2"), T("R2-B")),
  );
  await A.ctx.setOffline(false);
  await check(ph, "A online: черга спорожніла", () => syncIdle(a, 60_000));
  await B.ctx.setOffline(false);
  await check(ph, "B online: черга спорожніла", () => syncIdle(b, 60_000));
  const serverName = () =>
    sql(
      `SELECT string_agg(name, ',') FROM routine_habits WHERE user_id='${q(userId)}' AND deleted_at IS NULL AND name LIKE '%${q(T("R2"))}%'`,
    );
  await check(ph, "server: переміг пізніший запис (R2-B)", async () => {
    await expect.poll(serverName, { timeout: 30_000 }).toBe(T("R2-B"));
    return serverName();
  });
  shotPage = a;
  await reload(a);
  await reload(b);
  shotPage = a;
  await check(ph, "A сходиться до R2-B", () => seeHabit(a, T("R2-B")));
  shotPage = b;
  await check(ph, "B сходиться до R2-B", () => seeHabit(b, T("R2-B")));
  shotPage = a;
  await check(ph, "A: R2-A більше не видно", async () => {
    await goto(a, "/routine/habits");
    await expect(a.getByText(T("R2-A"), { exact: true })).toHaveCount(0, {
      timeout: 20_000,
    });
  });
});

test("P7 кілька вкладок: запис у другій вкладці не губиться", async () => {
  const ph = "P7-two-tabs";
  const tab2 = await A.ctx.newPage();
  await dismissWhatsNew(tab2);
  shotPage = tab2;
  await check(ph, "tab2: екран «уже відкрито в іншій вкладці»", async () => {
    await goto(tab2, "/finyk/transactions").catch(() => undefined);
    await expect(
      tab2.getByText("Sergeant уже відкрито в іншій вкладці"),
    ).toBeVisible({ timeout: 20_000 });
  });
  await check(ph, "tab2: «Працювати тут» переносить роботу", async () => {
    await tab2.getByRole("button", { name: "Працювати тут" }).click();
    await expect(
      tab2.getByText("Sergeant уже відкрито в іншій вкладці"),
    ).toBeHidden({ timeout: 30_000 });
  });
  await check(ph, "tab1: тепер заблокована", async () => {
    await expect(
      A.page.getByText("Sergeant уже відкрито в іншій вкладці"),
    ).toBeVisible({ timeout: 20_000 });
  });
  await check(ph, "tab2: створити витрату F4", () =>
    addExpense(tab2, T("F4"), "44"),
  );
  await check(ph, "tab2: створити звичку R4", () => addHabit(tab2, T("R4")));
  await tab2.waitForTimeout(3000);
  await tab2.close();
  shotPage = A.page;
  // Людина повертається до першої вкладки: саме це ставить її в чергу за
  // локом (dbOwnership, D4), а лок вільний, бо tab2 закрита. Playwright
  // емулює фокус для кожної сторінки, тож `bringToFront()` жодної події не
  // шле (заміряно 2026-09-28); подію повернення шлемо самі.
  await A.page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await check(ph, "tab1 розблокувалась, коли до неї повернулись", async () => {
    await expect(
      A.page.getByText("Sergeant уже відкрито в іншій вкладці"),
    ).toBeHidden({ timeout: 30_000 });
  });
  shotPage = A.page;
  await reload(A.page);
  await check(ph, "tab1 після reload: F4", () => seeExpense(A.page, T("F4")));
  await check(ph, "tab1 після reload: R4", () => seeHabit(A.page, T("R4")));
  await check(ph, "server: F4", () => expectOnServer("finyk", userId, T("F4")));
  await check(ph, "server: R4", () =>
    expectOnServer("routine", userId, T("R4")),
  );
});

test("P8 вихід із незбереженими записами: попередження і збереження після мережі", async () => {
  const ph = "P8-logout-pending";
  const a = A.page;
  shotPage = a;
  await syncIdle(a).catch(() => undefined);
  await A.ctx.setOffline(true);
  await check(ph, "offline: F3", () => addExpense(a, T("F3"), "33"));
  await goto(a, "/profile");
  await a.getByRole("button", { name: "Вийти" }).first().click();
  await a
    .getByRole("alertdialog")
    .getByRole("button", { name: "Вийти" })
    .click()
    .catch(async () => {
      await a
        .getByRole("dialog", { name: "Вийти з акаунта?" })
        .getByRole("button", { name: "Вийти" })
        .click();
    });
  await check(ph, "показано «Є незбережені записи»", async () => {
    await expect(a.getByText("Є незбережені записи")).toBeVisible({
      timeout: 15_000,
    });
  });
  await check(ph, "«Залишитись» лишає сесію", async () => {
    await a.getByRole("button", { name: "Залишитись" }).click();
    await expect(a).not.toHaveURL(/sign-in/);
  });
  await A.ctx.setOffline(false);
  await check(ph, "online: черга спорожніла", () => syncIdle(a, 60_000));
  await check(ph, "server: F3", () => expectOnServer("finyk", userId, T("F3")));
});

test("P9 вихід і інший користувач на тому ж пристрої: нічого не протікає", async () => {
  const ph = "P9-logout-isolation";
  const a = A.page;
  shotPage = a;
  await syncIdle(a).catch(() => undefined);
  await goto(a, "/profile");
  await a.getByRole("button", { name: "Вийти" }).first().click();
  const confirm = a
    .getByRole("alertdialog")
    .or(a.getByRole("dialog", { name: "Вийти з акаунта?" }));
  await confirm.getByRole("button", { name: "Вийти" }).click();
  await check(ph, "перехід на /sign-in", async () => {
    await expect(a).toHaveURL(/sign-in/, { timeout: 20_000 });
  });
  await check(ph, "анонім після виходу: F2 не видно", async () => {
    await goto(a, "/finyk/transactions");
    await a.waitForTimeout(4000);
    await expect(a.getByText(T("F2"), { exact: true })).toHaveCount(0);
  });
  await check(
    ph,
    "анонім після виходу: F1 (колишній анонімний запис) не видно",
    async () => {
      await expect(a.getByText(T("F1-ed"), { exact: true })).toHaveCount(0);
      await expect(a.getByText(T("F1"), { exact: true })).toHaveCount(0);
    },
  );
  await check(ph, "анонім після виходу: звички не видно", async () => {
    await goto(a, "/routine/habits");
    await a.waitForTimeout(3000);
    await expect(a.getByText(T("R2-B"), { exact: true })).toHaveCount(0);
  });

  const emailC = `verify_${RUN}_c@example.com`;
  await signUpAndWait(a, "Verify C", emailC);
  const userC = await userIdOf(a);
  record(ph, `userC=${userC}`, "pass");
  await a.waitForTimeout(8000);
  await check(ph, "C: сервер не має жодного рядка користувача A", async () => {
    const leaked = sql(
      `SELECT (SELECT count(*) FROM finyk_manual_expenses WHERE user_id='${q(userC)}' AND data_json::text LIKE '%V${RUN}%')` +
        ` + (SELECT count(*) FROM routine_habits WHERE user_id='${q(userC)}' AND name LIKE '%V${RUN}%')` +
        ` + (SELECT count(*) FROM nutrition_pantry_items p WHERE p.user_id='${q(userC)}' AND lower(row_to_json(p)::text) LIKE lower('%V${RUN}%'))` +
        ` + (SELECT count(*) FROM fizruk_daily_log l WHERE l.user_id='${q(userC)}' AND row_to_json(l)::text LIKE '%V${RUN}%')` +
        ` + (SELECT count(*) FROM user_profile WHERE user_id='${q(userC)}' AND payload::text LIKE '%V${RUN}%')`,
    );
    expect(Number(leaked)).toBe(0);
  });
  await check(ph, "C: UI Фініка без чужих записів", async () => {
    await goto(a, "/finyk/transactions");
    await a.waitForTimeout(4000);
    await expect(a.getByText(new RegExp(`V${RUN}`))).toHaveCount(0);
  });
  await check(ph, "C: памʼять профілю порожня", async () => {
    await openMemory(a);
    await expect(a.getByText(new RegExp(`V${RUN}`))).toHaveCount(0);
  });
  // C зареєструвався з порожнім анонімом — рівно той шлях, де перший запис
  // ішов у чергу посеред клієнтських міграцій і не доїжджав на сервер до
  // наступного буту (живий прогін 2026-10-08, `outboxSchema.ts`).
  await check(ph, "C: перший запис після реєстрації доїжджає на сервер", () =>
    addExpense(a, T("C1"), "44").then(() =>
      expectOnServer("finyk", userC, T("C1")),
    ),
  );
  await check(ph, "A: дані на сервері цілі після виходу", async () => {
    expect(Number(sql(SERVER_ROW["finyk"]!(userId, T("F2"))))).toBe(1);
  });
});
