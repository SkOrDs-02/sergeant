import type { Page } from "@playwright/test";

export type SqliteRefreshModule = "finyk" | "fizruk" | "nutrition";

export async function collectPageErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
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
