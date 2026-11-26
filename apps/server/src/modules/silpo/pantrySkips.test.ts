/**
 * `pantrySkips.ts` - лічильник «зазвичай не додаєш» (спека
 * `docs/work/specs/silpo-pantry-confirm.md` § Рішення дизайну, «Навчання»).
 *
 * Фейковий `queryFn` тримає таблицю `silpo_pantry_skip_counts` у памʼяті,
 * ключем `user_id + product_key`, і застосовує семантику трьох стейтментів
 * модуля (upsert-інкремент, DELETE-скидання, SELECT за порогом). Фільтр
 * `user_id` фейк бере з параметра `$1`, тож запит без `WHERE user_id`
 * віддав би чужі рядки й тест ізоляції впав би.
 */
import { describe, it, expect } from "vitest";
import {
  PANTRY_SKIP_THRESHOLD,
  listSkippedProductKeys,
  recordPantrySkips,
} from "./pantrySkips.js";
import type { QueryFn } from "./tokenStore.js";

function makeFakeDb() {
  const counts = new Map<string, number>();
  const id = (userId: string, key: string) => `${userId}\u0000${key}`;
  let calls = 0;

  const queryFn = (async (sql: string, params?: unknown[]) => {
    calls += 1;
    const p = params ?? [];
    const userId = p[0] as string;
    if (sql.includes("INSERT INTO silpo_pantry_skip_counts")) {
      for (const key of p[1] as string[]) {
        counts.set(id(userId, key), (counts.get(id(userId, key)) ?? 0) + 1);
      }
      return { rows: [], rowCount: (p[1] as string[]).length };
    }
    if (sql.includes("DELETE FROM silpo_pantry_skip_counts")) {
      for (const key of p[1] as string[]) counts.delete(id(userId, key));
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes("FROM silpo_pantry_skip_counts")) {
      if (!sql.includes("WHERE user_id = $1")) {
        throw new Error("SELECT без фільтра user_id");
      }
      const threshold = p[1] as number;
      const rows = [...counts.entries()]
        .filter(
          ([k, n]) => k.startsWith(`${userId}\u0000`) && n >= threshold,
        )
        .map(([k]) => ({ product_key: k.split("\u0000")[1] }))
        .sort((a, b) => a.product_key!.localeCompare(b.product_key!));
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  }) as unknown as QueryFn;

  return {
    queryFn,
    count: (userId: string, key: string) => counts.get(id(userId, key)) ?? 0,
    calls: () => calls,
  };
}

describe("recordPantrySkips", () => {
  it("skipped інкрементує, added скидає в 0 - одним викликом", async () => {
    const db = makeFakeDb();
    await recordPantrySkips("u1", ["молоко"], [], db.queryFn);
    await recordPantrySkips("u1", ["хліб"], ["молоко"], db.queryFn);
    expect(db.count("u1", "хліб")).toBe(1);
    expect(db.count("u1", "молоко")).toBe(0);
  });

  it("третє зняття поспіль дає 3, і продукт стає «зазвичай не додаєш»", async () => {
    const db = makeFakeDb();
    for (let i = 0; i < 3; i++) {
      await recordPantrySkips("u1", ["молоко"], [], db.queryFn);
    }
    expect(PANTRY_SKIP_THRESHOLD).toBe(3);
    expect(db.count("u1", "молоко")).toBe(3);
    expect(await listSkippedProductKeys("u1", db.queryFn)).toEqual(["молоко"]);
  });

  it("додавання після двох знять дає 0", async () => {
    const db = makeFakeDb();
    await recordPantrySkips("u1", ["молоко"], [], db.queryFn);
    await recordPantrySkips("u1", ["молоко"], [], db.queryFn);
    await recordPantrySkips("u1", [], ["молоко"], db.queryFn);
    expect(db.count("u1", "молоко")).toBe(0);
    await recordPantrySkips("u1", ["молоко"], [], db.queryFn);
    expect(db.count("u1", "молоко")).toBe(1);
  });

  it("ключ і в skipped, і в added рахується як додавання", async () => {
    const db = makeFakeDb();
    await recordPantrySkips("u1", ["молоко"], [], db.queryFn);
    await recordPantrySkips("u1", ["молоко", "молоко"], ["молоко"], db.queryFn);
    expect(db.count("u1", "молоко")).toBe(0);
  });

  it("порожній результат не ходить у базу", async () => {
    const db = makeFakeDb();
    await recordPantrySkips("u1", [], [], db.queryFn);
    expect(db.calls()).toBe(0);
  });
});

describe("listSkippedProductKeys", () => {
  it("віддає лише ключі від порогу і лише свого користувача", async () => {
    const db = makeFakeDb();
    for (let i = 0; i < 3; i++) {
      await recordPantrySkips("u1", ["молоко"], [], db.queryFn);
      await recordPantrySkips("u2", ["хліб"], [], db.queryFn);
    }
    await recordPantrySkips("u1", ["сир кисломолочний"], [], db.queryFn);
    expect(await listSkippedProductKeys("u1", db.queryFn)).toEqual(["молоко"]);
    expect(await listSkippedProductKeys("u2", db.queryFn)).toEqual(["хліб"]);
  });
});
