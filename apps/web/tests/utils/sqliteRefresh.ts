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

/** Скільки тиші після останнього refresh-у вважати кінцем каскаду. */
const QUIESCENCE_MS = 1_000;

/**
 * Виконує `action` і чекає, поки записи модуля ВЩУХНУТЬ: лічильник
 * refresh-ів спершу зросте, а потім простоїть незмінним `QUIESCENCE_MS`.
 *
 * Підписка ставиться ДО дії навмисно: якщо спершу зробити дію, а потім
 * почати чекати, швидкий запис встигне завершитись у проміжку, і
 * `waitForFunction` висітиме до таймауту на вже виконаній умові.
 *
 * AI-DANGER: перший інкремент — НЕ кінець роботи. Один клік породжує
 * КАСКАД записів: кожен LS-запис будить ефект, що пише наступний, і
 * кожна ланка ставиться в чергу лише після того, як попередня
 * завершилась. Тобто `pendingMutationWindows` між ланками падає до нуля,
 * `notifyCacheRefresh` проходить, лічильник росте — а найважливіший
 * запис ще навіть не діагностований. Так «Зберегти» в аркуші позиції
 * дає три ланки поспіль, і переїзд між місцями їде ТРЕТЬОЮ: замір
 * 2026-09-15 показав `ops ["pantry-upsert","pantry-upsert"]`, за яким
 * одразу йде рестарт сторінки — свого `applied` та ланка не дочекалась
 * жодного разу.
 *
 * Чому це вилізло лише на базі в OPFS: там кожна ланка їде через
 * раунд-тріп у воркер, тож проміжки між ними ширші за один тік. На
 * `kvvfs` увесь каскад устигав до першої перевірки лічильника, і бар'єр
 * «дочекався першого інкременту» роками виглядав достатнім, не будучи
 * ним. Гонка була тут завжди — змінилась лише швидкість запису.
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

  // Каскад: чекаємо, поки лічильник простоїть незмінним. Дедлайн той
  // самий `timeout`, щоб зависла черга падала тут, а не на рестарті.
  const deadline = Date.now() + timeout;
  let last = await readCount(moduleId)(page);
  for (;;) {
    await page.waitForTimeout(QUIESCENCE_MS);
    const now = await readCount(moduleId)(page);
    if (now === last) return;
    last = now;
    if (Date.now() > deadline) return;
  }
}
