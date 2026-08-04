import type { Page } from "@playwright/test";

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
