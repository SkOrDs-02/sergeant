import { expect, test, type Page } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";

async function collectPageErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

async function seedCrudState(page: Page) {
  await seedFTUX(page, "post-ftux", {
    extra: {
      finyk_manual_only_v1: "1",
    },
  });
}

type SqliteRefreshModule = "finyk" | "fizruk" | "nutrition";

async function sqliteRefreshCount(
  page: Page,
  moduleId: SqliteRefreshModule,
): Promise<number> {
  return page.evaluate((expectedModuleId) => {
    const target = globalThis as typeof globalThis & {
      __sergeantSqliteRefreshCounts?: Record<string, number>;
    };
    return target.__sergeantSqliteRefreshCounts?.[expectedModuleId] ?? 0;
  }, moduleId);
}

async function waitForInitialSqliteRefresh(
  page: Page,
  moduleId: SqliteRefreshModule,
) {
  await page.waitForFunction(
    (expectedModuleId) => {
      const target = globalThis as typeof globalThis & {
        __sergeantSqliteRefreshCounts?: Record<string, number>;
      };
      return (
        (target.__sergeantSqliteRefreshCounts?.[expectedModuleId] ?? 0) > 0
      );
    },
    moduleId,
    { timeout: 10_000 },
  );
}

async function waitForSqliteRefreshAfter(
  page: Page,
  moduleId: SqliteRefreshModule,
  action: () => Promise<void>,
) {
  const before = await sqliteRefreshCount(page, moduleId);
  const refresh = page.waitForFunction(
    ([expectedModuleId, previousCount]) => {
      const target = globalThis as typeof globalThis & {
        __sergeantSqliteRefreshCounts?: Record<string, number>;
      };
      return (
        (target.__sergeantSqliteRefreshCounts?.[expectedModuleId] ?? 0) >
        previousCount
      );
    },
    [moduleId, before] as const,
    { timeout: 10_000 },
  );
  await action();
  await refresh;
}

function routineDetailButton(page: Page, name: string) {
  return page.getByRole("button", {
    name: new RegExp(
      `Деталі: .*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    ),
  });
}

test.describe("@critical deep module CRUD browser loop", () => {
  test("finyk: creates, edits, deletes, and restores a manual expense", async ({
    page,
  }) => {
    await seedCrudState(page);
    const errors = await collectPageErrors(page);

    await page.goto("/finyk/transactions", { waitUntil: "domcontentloaded" });
    await waitForInitialSqliteRefresh(page, "finyk");

    await page.getByRole("button", { name: "Додати витрату" }).click();
    await expect(
      page.getByRole("dialog", { name: "Додати витрату" }),
    ).toBeVisible();
    await page.getByLabel("Сума ₴").fill("123");
    await page.getByLabel("Назва").fill("DCRUD кава");
    await waitForSqliteRefreshAfter(page, "finyk", async () => {
      await page.getByRole("button", { name: "Додати" }).click();
    });

    await page.getByRole("button", { name: /Розгорнути Сьогодні/ }).click();
    await expect(page.getByText("DCRUD кава")).toBeVisible();

    await page.getByText("DCRUD кава").click();
    await expect(
      page.getByRole("dialog", { name: "Редагувати витрату" }),
    ).toBeVisible();
    await page.getByLabel("Назва").fill("DCRUD кава оновлено");
    await waitForSqliteRefreshAfter(page, "finyk", async () => {
      await page.getByRole("button", { name: "Зберегти" }).click();
    });
    await expect(page.getByText("DCRUD кава оновлено")).toBeVisible();

    await page.goto("/finyk/transactions", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Розгорнути Сьогодні/ }).click();
    await expect(page.getByText("DCRUD кава оновлено")).toBeVisible();

    await page.getByText("DCRUD кава оновлено").click();
    await page.getByRole("button", { name: "Видалити" }).click();
    await expect(page.getByText("DCRUD кава оновлено")).toHaveCount(0);

    await page.getByRole("button", { name: "Повернути" }).click();
    await expect(page.getByText("DCRUD кава оновлено")).toBeVisible();

    expect(errors, "Uncaught page errors during Finyk CRUD").toEqual([]);
  });

  test("nutrition: creates, edits, deletes, and restores a pantry item", async ({
    page,
  }) => {
    await seedCrudState(page);
    const errors = await collectPageErrors(page);

    await page.goto("/nutrition/pantry", { waitUntil: "domcontentloaded" });
    await waitForInitialSqliteRefresh(page, "nutrition");

    const pantryInput = page.getByPlaceholder("напр. лосось 300г");
    await pantryInput.fill("DCRUD йогурт");
    await waitForSqliteRefreshAfter(page, "nutrition", async () => {
      await page.getByRole("button", { name: "Додати" }).click();
    });
    await expect(page.getByText("dcrud йогурт")).toBeVisible();

    await page.getByRole("button", { name: "Редагувати dcrud йогурт" }).click();
    await expect(
      page.getByRole("dialog", { name: "dcrud йогурт" }),
    ).toBeVisible();
    await page.getByLabel("Кількість").fill("2");
    await page.getByLabel("Одиниця").fill("шт");
    await waitForSqliteRefreshAfter(page, "nutrition", async () => {
      await page.getByRole("button", { name: "Зберегти" }).click();
    });
    await expect(page.getByText("2 шт")).toBeVisible();

    await page.goto("/nutrition/pantry", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("dcrud йогурт")).toBeVisible();
    await expect(page.getByText("2 шт")).toBeVisible();

    await page.getByRole("button", { name: "Прибрати dcrud йогурт" }).click();
    await expect(
      page.getByRole("button", { name: "Редагувати dcrud йогурт" }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Повернути" }).click();
    await expect(page.getByText("dcrud йогурт")).toBeVisible();

    expect(errors, "Uncaught page errors during Nutrition pantry CRUD").toEqual(
      [],
    );
  });

  test("routine: creates, edits, deletes, and restores a habit", async ({
    page,
  }) => {
    await seedCrudState(page);
    const errors = await collectPageErrors(page);

    await page.goto("/routine", { waitUntil: "domcontentloaded" });

    await page
      .getByRole("button", { name: "Додати звичку", exact: true })
      .click();
    const createDialog = page.getByRole("dialog", { name: "Нова звичка" });
    await expect(createDialog).toBeVisible();
    await createDialog.getByPlaceholder("Назва").fill("DCRUD вода");
    await createDialog
      .getByRole("button", { name: "Додати звичку", exact: true })
      .click();

    await expect(routineDetailButton(page, "DCRUD вода")).toBeVisible();

    await routineDetailButton(page, "DCRUD вода").click();
    await expect(
      page.getByRole("dialog", { name: /DCRUD вода/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Редагувати" }).click();
    const editDialog = page.getByRole("dialog", {
      name: "Редагувати звичку",
    });
    await expect(editDialog).toBeVisible();
    await editDialog.getByPlaceholder("Назва").fill("DCRUD вода оновлено");
    await editDialog
      .getByRole("button", { name: "Зберегти зміни" })
      .press("Enter");
    await expect(
      routineDetailButton(page, "DCRUD вода оновлено"),
    ).toBeVisible();

    await page.goto("/routine", { waitUntil: "domcontentloaded" });
    await expect(
      routineDetailButton(page, "DCRUD вода оновлено"),
    ).toBeVisible();

    await routineDetailButton(page, "DCRUD вода оновлено").click();
    await page.getByRole("button", { name: "Видалити" }).click();
    await expect(
      page.getByRole("alertdialog", {
        name: "Видалити звичку «DCRUD вода оновлено»?",
      }),
    ).toBeVisible();
    await page
      .getByRole("alertdialog", {
        name: "Видалити звичку «DCRUD вода оновлено»?",
      })
      .getByRole("button", { name: "Видалити" })
      .click();
    await expect(routineDetailButton(page, "DCRUD вода оновлено")).toHaveCount(
      0,
    );

    await page.getByRole("button", { name: "Повернути" }).click();
    await expect(
      routineDetailButton(page, "DCRUD вода оновлено"),
    ).toBeVisible();

    expect(errors, "Uncaught page errors during Routine habit CRUD").toEqual(
      [],
    );
  });

  test("fizruk: creates, deletes, and restores a body journal entry", async ({
    page,
  }) => {
    await seedCrudState(page);
    const errors = await collectPageErrors(page);

    await page.goto("/fizruk/body", { waitUntil: "domcontentloaded" });
    await waitForInitialSqliteRefresh(page, "fizruk");

    await page.getByLabel("Вага (кг)").fill("81.2");
    await page.getByLabel("Сон (год)").fill("7.5");
    await page
      .getByPlaceholder("Як почуваєшся сьогодні…")
      .fill("DCRUD body note");
    await waitForSqliteRefreshAfter(page, "fizruk", async () => {
      await page.getByRole("button", { name: "Записати" }).click();
    });

    await expect(page.getByText("Записано ✓")).toBeVisible();

    await page.goto("/fizruk/body", { waitUntil: "domcontentloaded" });
    const journalEntry = page.getByRole("button", {
      name: /81\.2 кг.*7\.5 год/,
    });
    await expect(journalEntry).toBeVisible();
    await journalEntry.click();
    await expect(page.getByText("DCRUD body note")).toBeVisible();

    await page.getByRole("button", { name: "Видалити запис" }).click();
    await expect(page.getByText("DCRUD body note")).toHaveCount(0);

    await page.getByRole("button", { name: "Повернути" }).click();
    await expect(page.getByText("DCRUD body note")).toBeVisible();

    expect(errors, "Uncaught page errors during Fizruk body CRUD").toEqual([]);
  });
});
