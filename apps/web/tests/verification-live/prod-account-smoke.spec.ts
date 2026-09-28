import { randomBytes } from "node:crypto";
import { appendFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import {
  addExpense,
  goto,
  reload,
  visibleText,
} from "../utils/liveJourneyHelpers";

// Смок проду з одноразовим акаунтом (процедура — accounts.md § 2).
// Запускає ЛЮДИНА, не агент:
//   PW_BASE_URL=https://app.sergeant.com.ua PW_API_URL=https://api.sergeant.com.ua \
//   pnpm exec playwright test -c playwright.verify.config.ts prod-account-smoke
// Облікові дані пишуться у файл поза репо (шлях друкується), результати — у
// prod-account-results.jsonl поруч. Акаунт після прогону видалити власним
// флоу: Профіль → Видалення акаунта.

const API = process.env["PW_API_URL"] ?? "https://api.sergeant.com.ua";
const OUT_DIR = process.env["PROD_SMOKE_OUT"] ?? tmpdir();
const RESULTS = join(OUT_DIR, "prod-account-results.jsonl");
const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const tag = randomBytes(3).toString("hex");
const email = `qa.durability.${day}.${tag}@example.com`;
const password = `Qa-${randomBytes(9).toString("base64url")}`;
const T = (k: string) => `QA${tag} ${k}`;

function rec(check: string, ok: boolean, detail = "") {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    check,
    verdict: ok ? "pass" : "fail",
    detail,
  });
  appendFileSync(RESULTS, line + "\n");
  console.log(
    `[${ok ? "PASS" : "FAIL"}] ${check}${detail ? ` :: ${detail}` : ""}`,
  );
}
async function step(check: string, fn: () => Promise<unknown>) {
  try {
    const d = await fn();
    rec(check, true, typeof d === "string" ? d : "");
  } catch (e) {
    rec(check, false, String(e).split("\n")[0]!.slice(0, 300));
  }
}

async function device(browser: Browser) {
  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await ctx.newPage();
  await seedFTUX(page, "post-ftux", { extra: { finyk_manual_only_v1: "1" } });
  await page.addLocatorHandler(
    page.getByRole("button", { name: "Зрозуміло", exact: true }),
    (b) => b.click(),
  );
  return { ctx, page };
}
async function openMemory(page: Page) {
  await goto(page, "/profile");
  const t = page.getByRole("button", { name: /Памʼять/ }).first();
  if ((await t.getAttribute("aria-expanded")) === "false") await t.click();
}
async function addMemory(page: Page, fact: string) {
  await openMemory(page);
  const empty = page.getByRole("button", { name: "Заповнити вручну" });
  if (await empty.isVisible().catch(() => false)) await empty.click();
  else {
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
  await page.waitForTimeout(4000);
}
async function seeMemory(page: Page, fact: string) {
  await openMemory(page);
  await expect(visibleText(page, fact)).toBeVisible({ timeout: 15_000 });
}
async function serverProfile(page: Page) {
  const r = await page.request.get(`${API}/api/me/profile`);
  return JSON.stringify(await r.json().catch(() => ({})));
}
async function seeExpense(page: Page, title: string) {
  await goto(page, "/finyk/transactions");
  await expect(async () => {
    const c = page
      .locator('button[aria-expanded="false"]')
      .filter({ hasText: /^Сьогодні/ });
    if ((await c.count()) > 0) await c.first().dispatchEvent("click");
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible({
      timeout: 1500,
    });
  }).toPass({ timeout: 30_000 });
}
async function syncIdle(page: Page) {
  await expect(page.getByRole("button", { name: /в черзі/ })).toBeHidden({
    timeout: 60_000,
  });
}

test.setTimeout(600_000);

test("prod account smoke", async ({ browser }) => {
  const creds = join(OUT_DIR, `prod-smoke-account-${tag}.txt`);
  writeFileSync(creds, `${email}\n${password}\n`);
  console.log(
    `Акаунт: ${email} (пароль у ${creds}; видали акаунт після прогону)`,
  );

  const A = await device(browser);
  await goto(A.page, "/sign-in");
  await A.page
    .getByRole("button", { name: /Немає акаунту\? Зареєструватися/ })
    .click();
  await A.page.getByPlaceholder("Твоє імʼя").fill("QA durability");
  await A.page.getByPlaceholder("email@example.com").fill(email);
  await A.page.getByPlaceholder(/Мінімум 10 символів/).fill(password);
  await A.page
    .getByRole("button", { name: "Зареєструватися", exact: true })
    .click();
  await expect(A.page).not.toHaveURL(/\/sign-in/, { timeout: 120_000 });

  // D2: памʼять профілю після reload і перезапис серверної копії.
  await step("memory: M1 додано", () => addMemory(A.page, T("M1")));
  await step("memory: сервер має M1", async () =>
    expect((await serverProfile(A.page)).includes(T("M1"))).toBe(true),
  );
  await reload(A.page);
  await step("memory: M1 видно після reload (D2)", () =>
    seeMemory(A.page, T("M1")),
  );
  await step("memory: M2 додано після reload", () =>
    addMemory(A.page, T("M2")),
  );
  await step(
    "memory: сервер досі має M1 після додавання M2 (D2-перезапис)",
    async () =>
      expect((await serverProfile(A.page)).includes(T("M1"))).toBe(true),
  );

  // Звичайний sync на другий пристрій.
  await step("finyk: F1 створено", async () => {
    await addExpense(A.page, T("F1"), "7");
    await A.page.waitForTimeout(2000);
  });
  await step("A: черга спорожніла", () => syncIdle(A.page));
  const B = await device(browser);
  await goto(B.page, "/sign-in");
  await B.page.getByPlaceholder("email@example.com").fill(email);
  await B.page.getByPlaceholder("Пароль").fill(password);
  await B.page.getByRole("button", { name: "Увійти", exact: true }).click();
  await expect(B.page).not.toHaveURL(/\/sign-in/, { timeout: 60_000 });
  await step("B: бачить F1", () => seeExpense(B.page, T("F1")));

  // Офлайн на A → мережа → B.
  await A.ctx.setOffline(true);
  await step("offline A: F2 створено", async () => {
    await addExpense(A.page, T("F2"), "8");
    await A.page.waitForTimeout(2000);
  });
  await step("offline A: F2 після reload без мережі", async () => {
    await reload(A.page);
    await seeExpense(A.page, T("F2"));
  });
  await A.ctx.setOffline(false);
  await step("A online: черга спорожніла", () => syncIdle(A.page));
  await reload(B.page);
  await step("B: бачить F2", () => seeExpense(B.page, T("F2")));

  console.log(
    `Результати: ${RESULTS}. Акаунт ${email} видали: Профіль → Видалення акаунта.`,
  );
});
