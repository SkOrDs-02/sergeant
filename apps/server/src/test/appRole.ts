/**
 * Тест-хелпер: запуск інтеграційних тестів під runtime-роллю `sergeant_app`.
 *
 * Прод ходить у Postgres не-суперюзером `sergeant_app` (міграція
 * `154_sergeant_app_role.sql`), тож політики RLS (Стадія 4 спеки
 * `docs/work/specs/rls-ai-tables-and-isolation-gate.md`) на нього діють.
 * Контейнер же піднімає суперюзера `hub`, для якого RLS не існує. Під
 * прапорцем `SERGEANT_TEST_APP_ROLE=1` стенд:
 *   1. лишає міграції і сід (пул `hub`) під суперюзером, як у проді
 *      (`MIGRATE_DATABASE_URL`);
 *   2. вмикає LOGIN для `sergeant_app` з тестовим паролем;
 *   3. підміняє `process.env.DATABASE_URL`, тож `db.ts` (пул застосунку)
 *      ходить уже під `sergeant_app`.
 *
 * Пароль тут не секрет: роль живе лише в одноразовому контейнері.
 */

import type pg from "pg";

export const APP_ROLE_NAME = "sergeant_app";
export const APP_ROLE_TEST_PASSWORD = "sergeant_app_test_only";

/** `true`, коли тести треба ганяти під `sergeant_app`. */
export function isAppRoleMode(): boolean {
  return process.env["SERGEANT_TEST_APP_ROLE"] === "1";
}

/** URL з юзером `sergeant_app` на основі суперюзерського URL контейнера. */
export function buildAppRoleUri(superuserUri: string): string {
  const url = new URL(superuserUri);
  url.username = APP_ROLE_NAME;
  url.password = APP_ROLE_TEST_PASSWORD;
  return url.toString();
}

/**
 * Вмикає LOGIN для `sergeant_app` (роль створює міграція 154) і підміняє
 * `DATABASE_URL`. Виклик ПІСЛЯ міграцій і ДО імпорту модулів застосунку.
 * Повертає URL застосунку, або `undefined`, якщо режим вимкнений.
 */
export async function enableAppRole(
  adminPool: pg.Pool,
  superuserUri: string,
): Promise<string | undefined> {
  if (!isAppRoleMode()) return undefined;
  // ALTER ROLE ... PASSWORD не приймає плейсхолдерів; пароль - константа.
  await adminPool.query(
    `ALTER ROLE ${APP_ROLE_NAME} LOGIN PASSWORD '${APP_ROLE_TEST_PASSWORD}'`,
  );
  const appUri = buildAppRoleUri(superuserUri);
  process.env["DATABASE_URL"] = appUri;
  return appUri;
}
