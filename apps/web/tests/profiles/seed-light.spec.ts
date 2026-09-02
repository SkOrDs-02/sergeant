import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  QA_PASSWORD,
  addExpense,
  addHabit,
  addPantryItem,
  goto,
  signUp,
} from "../utils/liveJourneyHelpers";

/**
 * Bootstrap тимчасових акаунтів продуктового аудиту 2026-09
 * (`docs/90-work/audits/2026-09-01-product-audit/accounts.md`): Q1 порожній,
 * Q2/Q5/Q8 — «light» (кілька витрат у різних категоріях, три звички з
 * відмітками, продукти в коморі), Q4 — порожній під edge-кейси руками.
 * Насичений Q3 живе в `seed-rich.spec.ts`. Реєстрація — тільки через UI
 * (реальний signup ловить регресії `RegisterForm`/`AuthContext`).
 *
 * Для кожного акаунта зберігає `storageState` у `PW_STATE_DIR/<id>.json`, щоб
 * браузерний прогін (свіп маршрутів, journeys) заходив без повторного
 * логіну — серія sign-in-ів з одного IP впирається в auth-рейт-ліміт.
 *
 *   PW_SEED_LIGHT=1 PW_STATE_DIR=/tmp/audit-state pnpm --filter @sergeant/web \
 *     exec playwright test --config playwright.profiles.config.ts --grep @seed-light
 *
 * Прийоми їжі, тренування, цілі КБЖВ, надходження, ліміти сідер не створює
 * (немає UI-хелперів) — це частина ручного прогону Ф3.
 */

const ENABLED = process.env["PW_SEED_LIGHT"] === "1";
const STATE_DIR = process.env["PW_STATE_DIR"] ?? "";
const ONLY = (process.env["PW_SEED_ONLY"] ?? "").split(",").filter(Boolean);
const RUN_TAG = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const SUFFIX = String(Date.now() % 100_000);

type Fill = "empty" | "light";

interface AccountSpec {
  id: string;
  name: string;
  fill: Fill;
}

const ACCOUNTS: readonly AccountSpec[] = [
  { id: "Q1", name: "QA Q1 Порожній", fill: "empty" },
  { id: "Q2", name: "QA Q2 Тиждень", fill: "light" },
  { id: "Q4", name: "QA Q4 Межові", fill: "empty" },
  { id: "Q5", name: "QA Q5 Платник", fill: "light" },
  { id: "Q8", name: "QA Q8 Життєвий цикл", fill: "light" },
];

/** Витрати з ключовими словами під різні категорії автокласифікації. */
const LIGHT_EXPENSES: ReadonlyArray<readonly [string, string]> = [
  ["Кава в кафе", "85"],
  ["Продукти АТБ", "642.5"],
  ["Таксі до офісу", "170"],
  ["Аптека вітаміни", "312"],
  ["Обід у кафе", "245"],
  ["Проїзд метро", "8"],
  ["Продукти Сільпо", "1234.99"],
  ["Кіно", "300"],
  ["Комуналка", "2150"],
  ["Спортзал абонемент", "900"],
];

const LIGHT_HABITS = ["Пити воду", "Зарядка вранці", "Читати 20 хвилин"];
const LIGHT_PANTRY = ["молоко", "гречка", "яйця", "яблука", "олія"];

test.describe.serial("@seed-light акаунти Q1/Q2/Q4/Q5/Q8", () => {
  for (const account of ACCOUNTS) {
    test(`${account.id} — ${account.fill}`, async ({ browser }) => {
      test.skip(
        !ENABLED,
        "PW_SEED_LIGHT не заданий — сідер створює акаунти свідомо",
      );
      test.skip(
        ONLY.length > 0 && !ONLY.includes(account.id),
        `PW_SEED_ONLY не містить ${account.id}`,
      );
      test.setTimeout(240_000);

      const email = `qa.${account.id.toLowerCase()}.${RUN_TAG}.${SUFFIX}@example.com`;
      const context = await browser.newContext({
        locale: "uk-UA",
        timezoneId: "Europe/Kyiv",
      });
      const page = await context.newPage();
      await signUp(page, account.name, email, QA_PASSWORD);
      await goto(page, "/");

      if (account.fill === "light") {
        for (const [title, amount] of LIGHT_EXPENSES) {
          await addExpense(page, title, amount);
        }
        for (const title of LIGHT_HABITS) {
          await addHabit(page, title);
        }
        // Відмітити все на сьогодні bulk-кнопкою — видимий доказ, що відмітка
        // застосувалась (кнопка зникає, коли все відмічено).
        await goto(page, "/routine");
        const bulk = page.getByRole("button", {
          name: /Відмітити всі звички на цей день/,
        });
        if (await bulk.isVisible().catch(() => false)) {
          await bulk.click();
          await expect(bulk).toBeHidden({ timeout: 10_000 });
        }
        for (const title of LIGHT_PANTRY) {
          await addPantryItem(page, `${title}`);
        }
        // Дати черзі синку дренуватись перед знімком стану. Не гейт: якщо
        // за 30 с черга не спорожніла — це знахідка прогону (SYNC), а не
        // причина не створювати решту акаунтів.
        const queued = page.getByRole("button", { name: /в черзі/ });
        const drained = await expect(queued)
          .toBeHidden({ timeout: 30_000 })
          .then(() => true)
          .catch(() => false);
        if (!drained) {
          const label = (await queued.textContent().catch(() => "")) ?? "";
          test.info().annotations.push({
            type: "finding",
            description: `${account.id}: черга синку не спорожніла за 30 с (${label.trim()})`,
          });
          console.log(
            `[seed-light] ${account.id} sync queue stuck: ${label.trim()}`,
          );
        }
      }

      if (STATE_DIR) {
        mkdirSync(STATE_DIR, { recursive: true });
        await context.storageState({
          path: join(STATE_DIR, `${account.id}.json`),
        });
      }
      await context.close();
      console.log(
        `[seed-light] ${account.id} ${email} (пароль — QA_PASSWORD лейна)`,
      );
      test.info().annotations.push({
        type: "seed-account",
        description: `${account.id}=${email}`,
      });
    });
  }
});
