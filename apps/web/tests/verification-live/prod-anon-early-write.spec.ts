import { expect, test, type Page } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import {
  addHabit,
  goto,
  reload,
  visibleText,
} from "../utils/liveJourneyHelpers";

// Запис гостя до реєстрації dual-write контексту (FULL-20261120-DATA-2/3).
//
// На проді гість без активного сервіс-воркера отримує ліниві чанки
// `dualWriteBoot-*` приблизно через секунду після `/me`. Інтерфейс до того
// вже інтерактивний, і запис у цьому вікні раніше зникав без журналу.
// Вікно коротке й залежить від мережі, тож тест розтягує його: тримає
// `dualWriteBoot-*` на BOOT_DELAY_MS (за замовчуванням 25 с) і робить запис
// одразу. SW заблоковано, бо з активним воркером чанки приходять з кешу.
//
// Фінік тут не перевіряється: поки його boot не завершився, `/finyk`
// показує скелетон і кнопки додавання немає (замір 2026-11-20). Фізрук
// реєструє контекст статичним імпортом у `FizrukApp`, тобто в тому ж
// рендері, що й інтерфейс; тест стереже, щоб так і лишалось.
//
// Запуск: PW_BASE_URL=https://app.sergeant.com.ua pnpm exec playwright test \
//   -c playwright.verify.config.ts prod-anon-early-write
test.use({
  storageState: { cookies: [], origins: [] },
  serviceWorkers: "block",
});

const BOOT_DELAY_MS = Number(process.env["BOOT_DELAY_MS"] ?? 25_000);

async function holdDualWriteBoot(page: Page): Promise<() => void> {
  let holding = true;
  await page.route(/\/assets\/dualWriteBoot-[^/]+\.js$/, async (route) => {
    if (holding) await new Promise((r) => setTimeout(r, BOOT_DELAY_MS));
    await route.continue().catch(() => {});
  });
  return () => {
    holding = false;
  };
}

test("prod-anon routine: habit created before dual-write boot survives reload", async ({
  page,
}) => {
  test.setTimeout(BOOT_DELAY_MS + 120_000);
  await seedFTUX(page, "post-ftux");
  const release = await holdDualWriteBoot(page);
  const title = `EARLY H ${Date.now().toString(36).slice(-4)}`;
  await addHabit(page, title);
  // Чекаємо, поки чанк прийде, контекст зареєструється і буфер доїде.
  await page.waitForTimeout(BOOT_DELAY_MS + 4_000);
  release();
  await reload(page);
  await goto(page, "/routine/habits");
  await expect(visibleText(page, title)).toBeVisible({ timeout: 15_000 });
});

test("prod-anon fizruk: body entry created on first render survives reload", async ({
  page,
}) => {
  test.setTimeout(BOOT_DELAY_MS + 120_000);
  await seedFTUX(page, "post-ftux");
  const release = await holdDualWriteBoot(page);
  await goto(page, "/fizruk/body");
  // Унікальна вага: журнал тіла показує в згорнутій картці «NN,N кг · …».
  const kg = 60 + Math.floor(Math.random() * 30);
  const tenth = 1 + Math.floor(Math.random() * 9);
  await page.getByLabel("Вага (кг)").fill(`${kg}.${tenth}`);
  await page.getByRole("button", { name: "Записати" }).click();
  await expect(page.getByText("Записано")).toBeVisible();
  await page.waitForTimeout(BOOT_DELAY_MS + 4_000);
  release();
  await reload(page);
  await goto(page, "/fizruk/body");
  await expect(
    page.getByRole("button", { name: new RegExp(`${kg},${tenth} кг`) }).first(),
  ).toBeVisible({ timeout: 15_000 });
});
