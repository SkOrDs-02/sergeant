import { expect, test, type Page } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { auditPage, mockApi } from "./audit";

/**
 * Клік-скрипт спеки `pantry-storage-places.md` на реальному коарс-поінтер
 * вʼюпорті. Два гейти, які юніти довести не можуть, бо вони про екран:
 *
 *  - гейт 3 «видно все»: позиції трьох місць показані РАЗОМ, фільтр звужує
 *    і знімається;
 *  - гейт 2 «ручне сильніше»: зміна місця в аркуші позиції переживає
 *    перезавантаження (стан лежить у SQLite, не в памʼяті компонента).
 *
 * Обидва стани проганяються через `auditPage` — той самий 44px-флор і ту
 * саму подвійну перевірку горизонтального переповнення, що спіймала 155px
 * у #925. Фільтр місця це новий контрол на тому ж треку, тож міряти його
 * треба саме тут.
 *
 * Бекенд не потрібен: застосунок рендериться клієнтом щойно `/me` віддає
 * користувача.
 */

/** По одній позиції на кожне з трьох відомих місць. */
const ITEMS = [
  { name: "пельмені 1 кг", label: "пельмені", place: "Морозилка" },
  { name: "молоко 1 л", label: "молоко", place: "Холодильник" },
  { name: "гречка 1 кг", label: "гречка", place: "Комора" },
];

async function fillPantry(page: Page) {
  const nameInput = page.getByPlaceholder("напр. лосось 300г");
  await nameInput.waitFor({ state: "visible", timeout: 15_000 });
  for (const item of ITEMS) {
    await nameInput.fill(item.name);
    await page.getByRole("button", { name: "Додати", exact: true }).click();
  }
  await expect(page.getByRole("button", { name: /^Редагувати / })).toHaveCount(
    ITEMS.length,
  );
}

test.describe("комора: місця зберігання", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await seedFTUX(page, "post-ftux");
    await page.goto("/nutrition/pantry", { waitUntil: "domcontentloaded" });
  });

  // Гейт 3 спеки.
  test("показує всі місця разом і звужує фільтром", async ({ page }) => {
    await fillPantry(page);

    // Видно все без перемикання.
    for (const item of ITEMS) {
      await expect(
        page.getByRole("button", { name: `Редагувати ${item.label}` }),
      ).toBeVisible();
    }

    // Автовизначення розклало позиції по місцях: у кожного своя одиниця.
    const filter = page.getByLabel("Місце зберігання");
    for (const item of ITEMS) {
      await expect(
        filter.getByRole("option", { name: item.place }),
      ).toHaveCount(1);
    }

    await auditPage(page, "PANTRY_PLACES");

    // Фільтр «Морозилка» лишає тільки заморожене.
    await filter.selectOption({ label: "Морозилка" });
    await expect(
      page.getByRole("button", { name: "Редагувати пельмені" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Редагувати молоко" }),
    ).toHaveCount(0);
    await expect(page.getByText("1 з 3")).toBeVisible();
    await auditPage(page, "PANTRY_PLACES");

    // І знімається.
    await filter.selectOption({ label: "Усі місця" });
    await expect(
      page.getByRole("button", { name: /^Редагувати / }),
    ).toHaveCount(ITEMS.length);
  });

  // Гейт 2 спеки: ручний вибір переживає перезавантаження.
  test("зміна місця переживає перезавантаження", async ({ page }) => {
    await fillPantry(page);

    // Місце живе в аркуші позиції, не в рядку списку: список відповідає на
    // «що є», а «де лежить» — розмова про одну конкретну позицію.
    await page.getByRole("button", { name: "Редагувати молоко" }).click();
    const placeSelect = page.getByLabel("Місце зберігання позиції");
    await expect(placeSelect).toHaveValue("fridge");
    await placeSelect.selectOption("home");
    // Переїзд застосовується разом зі «Зберегти» — поруч стоїть
    // «Скасувати», і зміна, яка сталася б до нього, зробила б ту кнопку
    // брехнею.
    await page.getByRole("button", { name: "Зберегти" }).click();

    // Чекаємо, поки аркуш зникне і запис осяде: перезавантаження просто в
    // мить збереження ловило то таймаут навігації, то `ERR_ABORTED` — це
    // крихкість тесту, не продукту. Свіжий `goto` замість `reload` з тієї
    // ж причини: він не конкурує з навігацією, яку сторінка могла почати.
    await expect(page.getByLabel("Місце зберігання позиції")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Редагувати молоко" })
      .waitFor({ state: "visible", timeout: 15_000 });

    await page.goto("/nutrition/pantry", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Редагувати молоко" })
      .waitFor({ state: "visible", timeout: 15_000 });

    // Фільтр «Комора» тепер показує молоко — тобто переїзд пережив рестарт.
    await page.getByLabel("Місце зберігання").selectOption({ label: "Комора" });
    await expect(
      page.getByRole("button", { name: "Редагувати молоко" }),
    ).toBeVisible();
    await expect(page.getByText("2 з 3")).toBeVisible();
    await auditPage(page, "PANTRY_PLACES");
  });
});
