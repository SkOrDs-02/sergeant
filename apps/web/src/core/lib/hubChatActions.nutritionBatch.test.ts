// @vitest-environment jsdom
/**
 * Status: Active
 *
 * data-22 (аудит 2026-10-01). Модель штатно шле кілька однакових tool_calls в
 * одному ході: «додай молоко, хліб і яйця» -> три `add_to_shopping_list`.
 * Їжа читає й пише через SQLite warm-кеш, що оновлюється лише ПІСЛЯ
 * асинхронного apply у черзі dual-write. Коли `executeActions` запускав усі
 * sync-дії в одному тіку, виклик N+1 читав знімок без виклику N і
 * перезаписував цілий blob: у списку лишалась одна позиція, а два `log_water`
 * (250 + 300) давали 300, а не 550.
 *
 * Тест іде реальним writer-ом на справжній (better-sqlite3) базі: мокати кеш
 * чи dual-write означало б сховати саме ту затримку, через яку все ламалось.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Outbox-таблиці в тестовій базі нема; решту dual-write лишаємо справжньою.
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
  getCachedNutritionSqliteState,
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
import type { ShoppingListLike } from "@sergeant/nutrition-domain";
import { executeActions } from "./hubChatActions";
import type { ChatAction } from "./chatActions/types";

const UID = "user-1";
let tick = 0;
/** Кожен запис — новіша мітка, як на живому годиннику: LWW не приймає рівний `clientTs`. */
const nextTs = () =>
  new Date(Date.UTC(2026, 9, 5, 10, 0, 0) + ++tick * 1000).toISOString();

let handle: TestSqliteHandle;
let teardown: () => void;

beforeEach(async () => {
  clearNutritionSqliteCache();
  __resetInitialPullStateForTests();
  handle = await createTestSqlite();
  teardown = registerNutritionDualWriteContext({
    getUserId: () => UID,
    getMigrationClient: async () => handle.client,
    getNow: nextTs,
    logger: () => {},
  });
  // Прогріваємо кеш і закриваємо початковий pull: інакше whole-blob
  // singleton-и (data-03/04) свідомо відхиляють запис, і тест перевіряв би не те.
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

/** Назви всіх позицій списку покупок (він згрупований за категоріями). */
function itemNames(list: ShoppingListLike | null): string[] {
  return (list?.categories ?? []).flatMap((c) =>
    (c.items ?? []).map((i) => String(i.name)),
  );
}

function shop(name: string): ChatAction {
  return { name: "add_to_shopping_list", input: { name } } as ChatAction;
}

function water(amount_ml: number, date: string): ChatAction {
  return { name: "log_water", input: { amount_ml, date } } as ChatAction;
}

describe("executeActions — батч мутацій Їжі (data-22)", () => {
  it("три add_to_shopping_list дають три позиції в кеші й SQLite", async () => {
    const out = await executeActions([
      shop("Молоко"),
      shop("Хліб"),
      shop("Яйця"),
    ]);
    expect(out.map((r) => r.ok)).toEqual([true, true, true]);
    await nutritionDualWriteIdle();

    expect(
      itemNames(getCachedNutritionSqliteState().shoppingList).sort(),
    ).toEqual(["Молоко", "Хліб", "Яйця"]);

    const rows = await handle.client.all<{ data_json: string }>(
      "SELECT data_json FROM nutrition_shopping_list",
    );
    expect(rows).toHaveLength(1);
    expect(itemNames(JSON.parse(rows[0]!.data_json)).sort()).toEqual([
      "Молоко",
      "Хліб",
      "Яйця",
    ]);
  });

  it("два log_water на одну дату сумуються (250 + 300 = 550)", async () => {
    const date = "2026-10-05";
    const out = await executeActions([water(250, date), water(300, date)]);
    expect(out[1]?.result).toContain("550");
    await nutritionDualWriteIdle();

    expect(getCachedNutritionSqliteState().waterLog[date]).toBe(550);
    const rows = await handle.client.all<{ ml: number }>(
      "SELECT volume_ml AS ml FROM nutrition_water_log WHERE date_key = ?",
      [date],
    );
    expect(rows.map((r) => r.ml)).toEqual([550]);
  });

  it("порядок результатів збігається з порядком викликів у змішаному батчі", async () => {
    const out = await executeActions([
      shop("Молоко"),
      water(200, "2026-10-05"),
      shop("Хліб"),
    ]);
    expect(out.map((r) => r.name)).toEqual([
      "add_to_shopping_list",
      "log_water",
      "add_to_shopping_list",
    ]);
  });
});
