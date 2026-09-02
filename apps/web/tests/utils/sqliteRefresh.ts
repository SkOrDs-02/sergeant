import type { Page } from "@playwright/test";

/**
 * Очікування завершення dual-write у SQLite для E2E.
 *
 * AI-CONTEXT: запис модульного стану в SQLite асинхронний. `persistPantries`
 * та їхні аналоги лише СТАВЛЯТЬ задачу в чергу (`triggerNutritionDualWrite`
 * → `dualWriteQueue.then(setTimeout(0)).then(dualWrite…)`), а Playwright-івський
 * `click()` повертається одразу після диспатчу події. Тож `page.reload()`
 * поруч із кліком перегонить запис, і тест бачить стан ДО мутації —
 * не як стабільне падіння, а як плаваюче, залежне від швидкості диска.
 *
 * Застосунок публікує лічильник завершених refresh-ів по модулях у
 * `globalThis.__sergeantSqliteRefreshCounts`; його інкремент — єдиний
 * чесний сигнал «запис долетів і кеш перечитано». Патерн уперше зʼявився
 * у `tests/smoke/deep-module-crud.spec.ts` (там лишається власна копія
 * цих хелперів); тут він винесений, щоб не плодити третю.
 */
export type SqliteRefreshModule = "finyk" | "fizruk" | "nutrition";

function readCount(moduleId: SqliteRefreshModule) {
  return (page: Page) =>
    page.evaluate((expectedModuleId) => {
      const target = globalThis as typeof globalThis & {
        __sergeantSqliteRefreshCounts?: Record<string, number>;
      };
      return target.__sergeantSqliteRefreshCounts?.[expectedModuleId] ?? 0;
    }, moduleId);
}

/**
 * Виконує `action` і чекає, поки лічильник refresh-ів модуля зросте.
 *
 * Підписка ставиться ДО дії навмисно: якщо спершу зробити дію, а потім
 * почати чекати, швидкий запис встигне завершитись у проміжку, і
 * `waitForFunction` висітиме до таймауту на вже виконаній умові.
 */
export async function waitForSqliteRefreshAfter(
  page: Page,
  moduleId: SqliteRefreshModule,
  action: () => Promise<void>,
  timeout = 15_000,
): Promise<void> {
  const before = await readCount(moduleId)(page);
  const refreshed = page.waitForFunction(
    ([expectedModuleId, previousCount]) => {
      const target = globalThis as typeof globalThis & {
        __sergeantSqliteRefreshCounts?: Record<string, number>;
      };
      return (
        (target.__sergeantSqliteRefreshCounts?.[expectedModuleId] ?? 0) >
        (previousCount as number)
      );
    },
    [moduleId, before] as const,
    { timeout },
  );
  await action();
  await refreshed;
}
