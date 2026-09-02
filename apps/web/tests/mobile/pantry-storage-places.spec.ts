import { expect, test, type Page } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { waitForServiceWorkerActivated } from "../utils/serviceWorker";
import { waitForSqliteRefreshAfter } from "../utils/sqliteRefresh";
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
    // Єдиний тест смуги, що робить повний рестарт застосунку: два холодні
    // бути плюс очікування прекешу (400 записів, 6.6 МБ). Дефолтних 30 с
    // на це не розраховано — решта тестів смуги вкладається у ~3 с і цього
    // бюджету не потребує.
    test.setTimeout(90_000);
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
    //
    // AI-DANGER: обидва кроки — і цей барʼєр, і перевірка нижче — потрібні.
    // Прибирання будь-якого з них уже ламало гейт, щоразу по-різному, тож
    // не спрощуй «бо локально зелено».
    //
    // Запис у SQLite асинхронний (`triggerNutritionDualWrite` ставить задачу
    // в чергу через `setTimeout(0)`), а `click()` повертається одразу після
    // диспатчу події. Лічильник `__sergeantSqliteRefreshCounts` росте лише
    // коли черга модуля спорожніла (`notifyCacheRefresh` мовчить, поки
    // `pendingMutationWindows > 0`), тож барʼєр дає сторінці досидіти
    // незавершену роботу перед рестартом.
    //
    // Що показали заміри, і чому вони суперечливі:
    //   • локально (повільний контейнер) барʼєр САМ ПО СОБІ давав 1 прохід
    //     із 5, а перевірка нижче сама по собі — 12 із 12;
    //   • у CI версія БЕЗ барʼєра впала інакше: `page.reload:
    //     net::ERR_ABORTED; maybe frame was detached?` — тобто рестарт
    //     стартував посеред незавершеної роботи сторінки.
    //
    // ВИПРАВЛЕННЯ 2026-09-02: тут стояло «зелений у CI дала саме ця пара
    // кроків». Це виявилось неправдою — на #1037 гейт знову впав, цього
    // разу зависанням `page.reload`. Обидва кроки нижче лишаються (вони
    // справді потрібні й справді про запис у SQLite), але зеленого вони не
    // гарантували: справжня причина була не тут, а в гонці з сервіс-
    // воркером, і її знімає окремий барʼєр перед самим рестартом.
    await waitForSqliteRefreshAfter(page, "nutrition", async () => {
      await page.getByRole("button", { name: "Зберегти" }).click();
    });

    // Діагностичний рубіж: переїзд має бути видимий ЩЕ ДО рестарту.
    // Без нього падіння нижче не розрізняє «не застосувалось» і «не
    // збереглось» — а це два різні дефекти в різних місцях.
    const filterBeforeReload = page.getByLabel("Місце зберігання");
    await filterBeforeReload.selectOption({ label: "Комора" });
    await expect(
      page.getByRole("button", { name: "Редагувати молоко" }),
    ).toBeVisible();
    await filterBeforeReload.selectOption({ label: "Усі місця" });

    // Другий барʼєр — і він про інше, ніж перший. Той чекає на запис у
    // SQLite, цей — на сервіс-воркера: без нього рестарт стріляє рівно на
    // межі install → activate прекешу, і три попередні правки цього тесту
    // лише зсували ту межу на сотні мілісекунд. Розбір і заміри — у
    // `tests/utils/serviceWorker.ts`.
    await waitForServiceWorkerActivated(page);

    // Явний timeout, а не бюджет тесту: без нього `reload` тихо зʼїдав усі
    // 30 с і звіт казав «Test timeout», не називаючи кроку. Тепер падіння
    // тут читається як падіння саме рестарту.
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
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
