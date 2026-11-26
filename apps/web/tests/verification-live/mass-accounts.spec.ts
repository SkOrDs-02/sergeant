/**
 * Масовий прогін тимчасових акаунтів із різними даними (не CI-гейт).
 *
 * Кожна персона — справжній signup через UI, власний чистий контекст, власний
 * набір записів, обхід усіх маршрутів на своєму viewport/темі й повернення на
 * «новому пристрої». Спек здебільшого ЗБИРАЄ (JSONL + скріни), а асертить
 * лише те, без чого решта не має сенсу: signup, доїзд записів на сервер,
 * ізоляцію між акаунтами.
 *
 * Стек піднімається зовні, як для `data-durability`: API :3000 на локальній
 * verification-БД (без `EMAIL_VERIFICATION_REQUIRED_FROM`), `vite preview` :4173.
 *
 *   MASS_OUT=/abs/dir VERIFY_DB=<db> pnpm --filter @sergeant/web exec \
 *     playwright test -c playwright.verify.config.ts mass-accounts
 *
 * Status: Scaffolded (інструмент прогону, не гейт).
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import {
  IGNORED_CONSOLE,
  QA_PASSWORD,
  addExpense,
  addHabit,
  goto,
  seedAnalyticsConsentDecision,
  signIn,
  signUp,
  visibleText,
  waitForServerSync,
} from "../utils/liveJourneyHelpers";

const API = "http://127.0.0.1:3000";
const DB = process.env["VERIFY_DB"] ?? "sergeant_verify";
const OUT = process.env["MASS_OUT"] ?? "mass-out";
const ONLY = (process.env["MASS_ONLY"] ?? "").split(",").filter(Boolean);
const RUN = Date.now().toString(36).slice(-5);

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

const ROUTES = [
  "/",
  "/?tab=reports",
  "/?tab=profile",
  "/?tab=settings",
  "/finyk",
  "/finyk/transactions",
  "/finyk/budgets",
  "/finyk/analytics",
  "/finyk/assets",
  "/nutrition",
  "/nutrition/pantry",
  "/nutrition/pantry/shopping",
  "/nutrition/log",
  "/nutrition/menu",
  "/nutrition/menu/plan",
  "/nutrition/menu/recipes",
  "/routine",
  "/routine/habits",
  "/routine/stats",
  "/fizruk",
  "/fizruk/atlas",
  "/fizruk/workouts",
  "/fizruk/history",
  "/fizruk/catalog",
  "/fizruk/templates",
  "/fizruk/programs",
  "/fizruk/progress",
  "/fizruk/measurements",
  "/fizruk/body",
  "/insights",
  "/settings",
  "/assistant",
  "/capabilities",
  "/pricing",
  "/status",
  "/legal/privacy",
  "/zzz-no-such-route",
  "/finyk/zzz-unknown",
] as const;

interface Persona {
  id: string;
  viewport: { width: number; height: number };
  dark: boolean;
  pro?: boolean;
  /** Наповнення; повертає «голки», які мають доїхати на сервер. */
  seed: (page: Page, tag: string) => Promise<string[]>;
}

function record(row: Record<string, unknown>): void {
  mkdirSync(OUT, { recursive: true });
  appendFileSync(`${OUT}/mass.jsonl`, `${JSON.stringify(row)}\n`);
}

function psql(sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "hub-postgres", "psql", "-U", "hub", "-d", DB, "-Atc", sql],
    { encoding: "utf8" },
  ).trim();
}

async function addPantry(page: Page, title: string): Promise<void> {
  await goto(page, "/nutrition/pantry");
  const input = page.getByPlaceholder("Продукт", { exact: true });
  const openSheet = page.getByRole("button", { name: "Додати продукти" });
  await expect(input.or(openSheet).first()).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    if (!(await input.isVisible())) await openSheet.click();
    await expect(input).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await input.fill(title);
  const add = page.getByRole("button", { name: "Додати", exact: true }).last();
  await expect(add).toBeEnabled();
  await add.click();
  await expect(visibleText(page, title)).toBeVisible();
}

async function addBody(page: Page, kg: string, sleep: string): Promise<void> {
  await goto(page, "/fizruk/body");
  await page.getByLabel("Вага (кг)").fill(kg);
  await page.getByLabel("Сон (год)").fill(sleep);
  await page.getByRole("button", { name: "Записати" }).click();
  await page.waitForTimeout(1500);
}

/** Спроба з довільним вводом: не асертить, а повертає, чим закінчилось. */
async function tryExpense(
  page: Page,
  title: string,
  amount: string,
): Promise<string> {
  await goto(page, "/finyk/transactions");
  await page
    .getByTestId("corner-action")
    .getByRole("button", { name: "Додати" })
    .click();
  await page
    .getByTestId("add-sources")
    .getByRole("button", { name: /^Вручну/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Додати витрату" });
  await expect(dialog).toBeVisible();
  const amountField = dialog.getByLabel("Сума ₴");
  await amountField.fill(amount).catch(() => {});
  const shown = await amountField.inputValue();
  await dialog.getByLabel("Назва").fill(title);
  const submit = dialog.getByRole("button", {
    name: "Додати витрату",
    exact: true,
  });
  if (!(await submit.isEnabled())) return `disabled (поле=«${shown}»)`;
  await submit.click();
  const ok = await visibleText(page, "Витрату додано.")
    .waitFor({ timeout: 4_000 })
    .then(() => true)
    .catch(() => false);
  if (ok) return `saved (поле=«${shown}»)`;
  const alert = await dialog
    .locator('[role="alert"], [aria-invalid="true"]')
    .first()
    .textContent()
    .catch(() => null);
  return `rejected (поле=«${shown}», ${alert ?? "без повідомлення"})`;
}

const PERSONAS: readonly Persona[] = [
  {
    id: "M1-empty",
    viewport: MOBILE,
    dark: false,
    seed: async () => [],
  },
  {
    id: "M2-finyk-heavy",
    viewport: DESKTOP,
    dark: false,
    seed: async (page, tag) => {
      const rows: [string, string][] = [
        ["кава", "65"],
        ["обід", "240.50"],
        ["таксі", "182"],
        ["продукти", "1349.99"],
        ["аптека", "410"],
        ["оренда", "18000"],
        ["інтернет", "250"],
        ["кіно", "360"],
        ["книга", "0.01"],
        ["подарунок", "2500"],
        ["паливо", "1999.9"],
        ["спортзал", "900"],
      ];
      const needles: string[] = [];
      for (const [name, amount] of rows) {
        const title = `${tag} ${name}`;
        await addExpense(page, title, amount);
        needles.push(title);
      }
      return needles;
    },
  },
  {
    id: "M3-routine",
    viewport: MOBILE,
    dark: true,
    seed: async (page, tag) => {
      const names = ["вода", "зарядка", "читання", "сон до 23", "без цукру"];
      const needles: string[] = [];
      for (const n of names) {
        const title = `${tag} ${n}`;
        await addHabit(page, title);
        needles.push(title);
      }
      return needles;
    },
  },
  {
    id: "M4-nutrition",
    viewport: MOBILE,
    dark: false,
    seed: async (page, tag) => {
      const items = ["молоко", "гречка", "яйця", "сир", "яблука", "кава"];
      const needles: string[] = [];
      for (const i of items) {
        const title = `${tag}${i}`;
        await addPantry(page, title);
        needles.push(title);
      }
      return needles;
    },
  },
  {
    id: "M5-fizruk",
    viewport: DESKTOP,
    dark: true,
    seed: async (page) => {
      await addBody(page, "81.2", "7.5");
      return [];
    },
  },
  {
    id: "M6-edge",
    viewport: MOBILE,
    dark: false,
    seed: async (page, tag) => {
      const cases: [string, string][] = [
        [`${tag} ${"дуже-довга-назва-".repeat(12)}`, "100"],
        [`${tag} 🍕🔥 емодзі`, "99.99"],
        [`${tag} <script>alert(1)</script>`, "10"],
        [`${tag} '; DROP TABLE x;--`, "11"],
        [`${tag} مرحبا RTL`, "12"],
        [`${tag} кома`, "12,50"],
        [`${tag} мільярд`, "999999999"],
        [`${tag} більше-ніж-мільярд`, "99999999999999"],
        [`${tag} мінус`, "-5"],
        [`${tag} нуль`, "0"],
        [`${tag} три знаки`, "1.999"],
        [`${tag} літери`, "abc"],
        [`${tag} експонента`, "1e5"],
        ["   ", "50"],
      ];
      const needles: string[] = [];
      for (const [title, amount] of cases) {
        const outcome = await tryExpense(page, title, amount);
        record({ kind: "edge-expense", title, amount, outcome });
        if (outcome.startsWith("saved") && title.trim())
          needles.push(title.slice(0, 40));
        await page.keyboard.press("Escape").catch(() => {});
      }
      await addHabit(page, `${tag} звичка 🧘 «лапки» & <b>`);
      return needles;
    },
  },
  {
    id: "M7-pro-mixed",
    viewport: DESKTOP,
    dark: false,
    pro: true,
    seed: async (page, tag) => {
      await addExpense(page, `${tag} вечеря`, "777");
      await addExpense(page, `${tag} квитки`, "1234.56");
      await addHabit(page, `${tag} медитація`);
      await addPantry(page, `${tag}рис`);
      await addBody(page, "64.4", "8");
      return [
        `${tag} вечеря`,
        `${tag} квитки`,
        `${tag} медитація`,
        `${tag}рис`,
      ];
    },
  },
];

async function newContext(
  browser: Browser,
  p: Persona,
): Promise<BrowserContext> {
  const c = await browser.newContext({
    locale: "uk-UA",
    timezoneId: "Europe/Kyiv",
    viewport: p.viewport,
    colorScheme: p.dark ? "dark" : "light",
    hasTouch: p.viewport.width < 600,
    isMobile: p.viewport.width < 600,
  });
  await seedAnalyticsConsentDecision(c);
  return c;
}

const BAD_TEXT = /\b(undefined|NaN|Invalid Date)\b|\[object Object\]/;

async function walk(page: Page, p: Persona, phase: string): Promise<void> {
  const consoleErrors: string[] = [];
  const badResponses: string[] = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (IGNORED_CONSOLE.some((re) => re.test(t))) return;
    consoleErrors.push(`console: ${t.slice(0, 300)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().includes("/api/"))
      badResponses.push(
        `${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`,
      );
  });
  for (const route of ROUTES) {
    consoleErrors.length = 0;
    badResponses.length = 0;
    let navError: string | null = null;
    try {
      await goto(page, route);
    } catch (err) {
      navError = String(err).slice(0, 300);
    }
    await page.waitForTimeout(1800);
    const m = await page
      .evaluate(() => {
        const de = document.documentElement;
        const clipped: string[] = [];
        for (const el of Array.from(document.querySelectorAll("body *"))) {
          const h = el as HTMLElement;
          if (h.closest(".sr-only")) continue;
          if (h.scrollWidth - h.clientWidth > 8) {
            const ox = getComputedStyle(h).overflowX;
            if (ox === "hidden" || ox === "clip")
              clipped.push(
                `${h.tagName}.${String(h.className).slice(0, 60)} +${h.scrollWidth - h.clientWidth}`,
              );
          }
        }
        const root = document.getElementById("root");
        return {
          overflow: de.scrollWidth - window.innerWidth,
          clipped: clipped.slice(0, 5),
          text: (document.body.innerText || "").slice(0, 20_000),
          rootEmpty: !root || root.childElementCount === 0,
          title: document.title,
          h1: Array.from(document.querySelectorAll("h1")).map((h) =>
            (h.textContent || "").trim(),
          ),
          url: location.pathname + location.search,
        };
      })
      .catch((e) => ({ evalError: String(e) }) as Record<string, unknown>);
    const text = String((m as { text?: string }).text ?? "");
    const bad = BAD_TEXT.exec(text);
    const shot = `${OUT}/${p.id}/${phase}${route.replace(/[^a-z0-9]+/gi, "_") || "_root"}.png`;
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
    record({
      kind: "walk",
      persona: p.id,
      phase,
      route,
      viewport: p.viewport.width,
      dark: p.dark,
      navError,
      ...m,
      text: undefined,
      textLen: text.length,
      badText: bad
        ? text.slice(Math.max(0, bad.index - 60), bad.index + 60)
        : null,
      consoleErrors: [...consoleErrors],
      badResponses: [...new Set(badResponses)],
    });
  }
}

const registry: Record<
  string,
  { email: string; tag: string; needles: string[]; state: string }
> = {};

test.describe.configure({ mode: "serial" });

for (const p of PERSONAS) {
  test(`${p.id}: signup, наповнення, обхід, новий пристрій`, async ({
    browser,
  }) => {
    test.skip(ONLY.length > 0 && !ONLY.includes(p.id), "MASS_ONLY");
    test.setTimeout(900_000);
    const tag = `${p.id.slice(0, 2)}${RUN}`;
    const email = `qa.mass.${p.id.toLowerCase()}.${RUN}@example.com`;
    const ctx = await newContext(browser, p);
    const page = await ctx.newPage();
    await signUp(page, `QA ${p.id}`, email);
    if (p.pro) {
      psql(
        `INSERT INTO subscriptions (user_id, plan, status, provider, current_period_end) SELECT id, 'pro', 'active', 'manual', now() + interval '30 days' FROM "user" WHERE email = '${email}'`,
      );
    }
    const t0 = Date.now();
    const needles = await p.seed(page, tag);
    if (needles.length > 0) await waitForServerSync(page, needles, 60_000);
    record({
      kind: "seed",
      persona: p.id,
      needles: needles.length,
      ms: Date.now() - t0,
    });
    await walk(page, p, "a");
    const state = `${OUT}/${p.id}/state.json`;
    await ctx.storageState({ path: state });
    registry[p.id] = { email, tag, needles, state };
    await ctx.close();

    // «Новий пристрій»: чистий контекст, свіжий логін, дані мають приїхати.
    const ctx2 = await newContext(browser, p);
    const page2 = await ctx2.newPage();
    await signIn(page2, email, QA_PASSWORD);
    const missing: string[] = [];
    const where = p.id.includes("routine")
      ? "/routine/habits"
      : p.id.includes("nutrition")
        ? "/nutrition/pantry"
        : "/finyk/transactions";
    // Змішана персона пише в кілька модулів, а «новий пристрій» перевіряється
    // на одній сторінці: звичку й продукт на екрані операцій шукати марно.
    const expected = p.id.includes("mixed")
      ? needles.filter((n) => n.includes(" ") && !n.includes("медитація"))
      : needles;
    if (expected.length > 0) {
      await goto(page2, where);
      for (const n of expected) {
        const seen = await visibleText(page2, n)
          .first()
          .waitFor({ timeout: 20_000 })
          .then(() => true)
          .catch(() => false);
        if (!seen) missing.push(n);
      }
      await page2.screenshot({
        path: `${OUT}/${p.id}/device2.png`,
        fullPage: true,
      });
    }
    record({
      kind: "device2",
      persona: p.id,
      where,
      expected: expected.length,
      missing,
    });
    await ctx2.close();
    expect(missing, "записи не доїхали на новий пристрій").toEqual([]);
  });
}

test("ізоляція: pull одного акаунта не містить записів інших", async ({
  browser,
}) => {
  const ids = Object.keys(registry);
  test.skip(ids.length < 2, "потрібно щонайменше дві персони");
  const leaks: string[] = [];
  for (const id of ids) {
    const me = registry[id]!;
    const ctx = await browser.newContext({ storageState: me.state });
    const res = await ctx.request.get(
      `${API}/api/v2/sync/pull?since=0&limit=500`,
    );
    const body = await res.text();
    for (const other of ids) {
      if (other === id) continue;
      if (body.includes(registry[other]!.tag))
        leaks.push(`${id} бачить дані ${other}`);
    }
    record({
      kind: "isolation",
      persona: id,
      status: res.status(),
      bytes: body.length,
      ownTagSeen: body.includes(me.tag),
    });
    await ctx.close();
  }
  expect(leaks).toEqual([]);
});
