import { expect, type Page } from "@playwright/test";

export type SqliteRefreshModule = "finyk" | "fizruk" | "nutrition";

export async function collectPageErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

export async function deferAnonymousMigration(page: Page): Promise<void> {
  const apiBase = process.env["VITE_API_BASE_URL"] ?? "http://127.0.0.1:3000";
  const meResponse = await page.request.get(`${apiBase}/api/me`);
  if (!meResponse.ok()) {
    throw new Error(`Unable to load smoke user: HTTP ${meResponse.status()}`);
  }
  const me = (await meResponse.json()) as { user?: { id?: string } };
  const userId = me.user?.id;
  if (!userId) throw new Error("Smoke user response has no user id");

  await page.addInitScript((id: string) => {
    window.localStorage.setItem(`hub_anon_migration_deferred_v1:${id}`, "1");
  }, userId);
}

export async function sqliteRefreshCount(
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

export async function waitForInitialSqliteRefresh(
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

/**
 * Старт тренування з домашньої «Тренувань» після 2026-09-16: одна кнопка
 * «Почати тренування» відкриває аркуш вибору, порожньої сесії більше немає —
 * таймер стартує після першої обраної вправи. Хелпер бере ПЕРШУ вправу
 * каталогу, бо сценаріям вище байдуже, яку саме.
 */
export async function startWorkoutWithFirstExercise(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Почати тренування" }).click();
  const chooser = page.getByRole("dialog", { name: "Почати тренування" });
  await chooser.getByRole("button", { name: /Підібрати вправи/ }).click();
  const picker = page.getByRole("dialog", { name: "Підібрати вправи" });
  // Рядки каталогу — єдині кнопки з `aria-pressed`; `getByRole(..., { pressed:
  // false })` тут не годиться, бо Playwright трактує ВІДСУТНІЙ атрибут як
  // false і першою віддає «Назад».
  await picker.locator('button[aria-pressed="false"]').first().click();
  await picker.getByRole("button", { name: /^Почати/ }).click();

  // Retry-стійкість. Якщо попередня спроба впала посеред сесії, її
  // незавершене тренування приїжджає в свіжий контекст через sync, і
  // оркестратор замість навігації відкриває «Уже є активне тренування»
  // (`requestWorkoutStart` → `conflictingWorkout`). Для smoke-сценаріїв
  // старе тренування цінності не має — викидаємо й стартуємо нове. Без
  // цього retry у CI був приречений: `toHaveURL(/workout\/…/)` чекав
  // навігації, якої під діалогом не буває.
  const conflict = page.getByRole("dialog", {
    name: "Уже є активне тренування",
  });
  const outcome = await Promise.race([
    page
      .waitForURL(/\/fizruk\/workout\/[^/]+$/, { timeout: 10_000 })
      .then(() => "started" as const)
      .catch(() => "timeout" as const),
    conflict
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => "conflict" as const)
      .catch(() => "timeout" as const),
  ]);
  if (outcome === "conflict") {
    await conflict
      .getByRole("button", { name: "Викинути старе й почати нове" })
      .click();
    await expect(conflict).toBeHidden();
  }
  await expect(page).toHaveURL(/\/fizruk\/workout\/[^/]+$/);
}

/**
 * Дочекатись, поки трей тостів спорожніє, — ПЕРЕД кліком по футеру аркуша.
 *
 * Трей стоїть унизу над усім (`z-9999`) і навмисно лишається hit-testable
 * під час діалогу (там може бути Undo), а наведення курсора ставить його
 * авто-закриття на паузу. Тож тост, що зʼявляється ПІД нерухомим курсором
 * (після кліку по нижній кнопці попереднього аркуша курсор стоїть рівно
 * там, де трей), не зникає ніколи — і перехоплює наступний клік у тому ж
 * місці: Playwright бачить «subtree intercepts pointer events» від
 * `<span>` тоста 47 спроб поспіль. У CI це «Додаток готовий до роботи
 * офлайн» від свіжого service worker-а. Спершу відводимо курсор, щоб зняти
 * паузу, потім чекаємо, поки трей спорожніє.
 */
export async function settleToasts(page: Page): Promise<void> {
  await page.mouse.move(1, 1);
  await expect(
    page.getByTestId("toast-tray").locator('[role="status"], [role="alert"]'),
  ).toHaveCount(0, { timeout: 10_000 });
}
