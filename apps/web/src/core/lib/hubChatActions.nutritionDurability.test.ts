// @vitest-environment jsdom
/**
 * Status: Active
 *
 * rel-16 (аудит 2026-10-01). Дія Їжі рапортувала «записано», коли запуск черги
 * dual-write завершувався «sqlite недоступна»: персист-обгортка віддає `true`
 * на факті «передав у чергу», а `settle()` нічого не чекав. Тепер
 * `executeActions` після `nutritionDualWriteIdle()` порівнює лічильник
 * невдалих запусків і підміняє результат на `WRITE_NOT_PERSISTED`.
 *
 * Реальний writer на справжній (better-sqlite3) базі, як у
 * `hubChatActions.nutritionBatch.test.ts`: мокати чергу означало б сховати
 * саме ту межу, яку тест пінить.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));

import {
  __clearNutritionDualWriteContextForTests,
  nutritionDualWriteIdle,
  registerNutritionDualWriteContext,
} from "../../modules/nutrition/lib/sqliteWriter/index";
import {
  clearNutritionSqliteCache,
  refreshNutritionSqliteState,
} from "../../modules/nutrition/lib/sqliteReader";
import {
  createTestSqlite,
  type TestSqliteHandle,
} from "../../modules/nutrition/lib/sqliteWriter/__tests__/testSqlite";
import {
  __resetInitialPullStateForTests,
  markInitialPullComplete,
} from "../syncEngine/initialPullState";
import { executeActions } from "./hubChatActions";
import type { ChatAction } from "./chatActions/types";

const UID = "user-1";
let tick = 0;
const nextTs = () =>
  new Date(Date.UTC(2026, 9, 5, 10, 0, 0) + ++tick * 1000).toISOString();

let handle: TestSqliteHandle;
let teardown: () => void;
let sqliteAvailable = true;

beforeEach(async () => {
  sqliteAvailable = true;
  clearNutritionSqliteCache();
  __resetInitialPullStateForTests();
  handle = await createTestSqlite();
  teardown = registerNutritionDualWriteContext({
    getUserId: () => UID,
    getMigrationClient: async () => (sqliteAvailable ? handle.client : null),
    getNow: nextTs,
    logger: () => {},
  });
  await refreshNutritionSqliteState(handle.client, UID);
  markInitialPullComplete(UID, {});
});

afterEach(async () => {
  await nutritionDualWriteIdle();
  teardown();
  __clearNutritionDualWriteContextForTests();
  clearNutritionSqliteCache();
  __resetInitialPullStateForTests();
  handle.close();
});

const water = (amount_ml: number, date: string): ChatAction =>
  ({ name: "log_water", input: { amount_ml, date } }) as ChatAction;

describe("executeActions — довговічність дій Їжі (rel-16)", () => {
  it("рапортує успіх, коли запуск черги записав у SQLite", async () => {
    const [out] = await executeActions([water(250, "2026-10-05")]);
    expect(out?.ok).toBe(true);
    expect(out?.result).toContain("250");
  });

  it("НЕ рапортує успіх, коли SQLite недоступна", async () => {
    sqliteAvailable = false;
    const [out] = await executeActions([water(250, "2026-10-05")]);
    expect(out?.ok).toBe(false);
    expect(out?.result).toContain("Не вдалося зберегти");
    expect(out?.undo).toBeUndefined();
  });

  it("відмова одного запису не отруює наступну вдалу дію", async () => {
    sqliteAvailable = false;
    const [bad] = await executeActions([water(250, "2026-10-05")]);
    expect(bad?.ok).toBe(false);
    sqliteAvailable = true;
    const [good] = await executeActions([water(100, "2026-10-06")]);
    expect(good?.ok).toBe(true);
  });

  it("НЕ рапортує успіх, коли dual-write контекст не зареєстровано (запис осів у буфері)", async () => {
    // Кеш прогрітий (beforeEach), але контекст знято: вихід, зміна користувача
    // або вікно до auth-резолву. `triggerNutritionDualWrite` лише буферизує
    // запис, черга не стартує, `nutritionDualWriteIdle()` завершується одразу.
    teardown();
    const [out] = await executeActions([water(250, "2026-10-05")]);
    expect(out?.ok).toBe(false);
    expect(out?.result).toContain("Не вдалося зберегти");
    expect(out?.undo).toBeUndefined();
  });

  it("буфер, що лишився від попередньої дії, не отруює наступну дію із зареєстрованим контекстом", async () => {
    teardown();
    const [bad] = await executeActions([water(250, "2026-10-05")]);
    expect(bad?.ok).toBe(false);
    teardown = registerNutritionDualWriteContext({
      getUserId: () => UID,
      getMigrationClient: async () => handle.client,
      getNow: nextTs,
      logger: () => {},
    });
    await nutritionDualWriteIdle();
    const [good] = await executeActions([water(100, "2026-10-06")]);
    expect(good?.ok).toBe(true);
  });
});
