// Unit-level coverage for feedbackService.ts на мокнутому `pg.Pool` —
// той самий підхід, що у waitlistService.unit.test.ts: Testcontainers-харнес
// soft-skip-иться там, де немає Docker, і лишив би модуль на 0% покриття.
//
// Перевіряємо контракт SQL/параметрів і коерцію bigint→number (Hard Rule #1),
// не піднімаючи реальний Postgres.

import { describe, it, expect, vi } from "vitest";
import type pg from "pg";
import { submitFeedbackEntry } from "./feedbackService.js";

describe("submitFeedbackEntry (mocked pool)", () => {
  it("вставляє рядок і повертає id як number (Hard Rule #1)", async () => {
    // pg віддає BIGSERIAL рядком — саме так, як тут.
    const query = vi
      .fn()
      .mockResolvedValue({ rowCount: 1, rows: [{ id: "42" }] });
    const pool = { query } as unknown as pg.Pool;

    const result = await submitFeedbackEntry(pool, {
      category: "bug",
      message: "Кнопка не працює",
      page: "https://app.example.com/settings",
      viewport: "390x844",
      user_id: "user_123",
      user_agent: "Mozilla/5.0",
      app_env: "production",
    });

    expect(result).toEqual({ id: 42 });
    expect(typeof result.id).toBe("number");

    const [sqlText, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sqlText).toContain("INSERT INTO feedback_entries");
    expect(sqlText).toContain("RETURNING id");
    // Свідомо БЕЗ ON CONFLICT: той самий тестер може надіслати десять різних
    // репортів, і кожен мусить вижити. Дедуплікація тут = втрата даних.
    expect(sqlText).not.toContain("ON CONFLICT");
    expect(params).toEqual([
      "bug",
      "Кнопка не працює",
      "https://app.example.com/settings",
      "390x844",
      "user_123",
      "Mozilla/5.0",
      "production",
    ]);
  });

  it("опційні поля дефолтяться в null (анонімний сабміт без контексту)", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rowCount: 1, rows: [{ id: "7" }] });
    const pool = { query } as unknown as pg.Pool;

    await submitFeedbackEntry(pool, {
      category: "idea",
      message: "ідея",
    });

    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(["idea", "ідея", null, null, null, null, null]);
  });

  it("кидає, якщо INSERT не повернув рядка", async () => {
    // Порожній RETURNING означав би зламаний контракт pg. Краще впасти
    // голосно, ніж віддати клієнту «надіслано» з фейковим id — саме та
    // брехня, заради усунення якої цей endpoint і зроблений.
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const pool = { query } as unknown as pg.Pool;

    await expect(
      submitFeedbackEntry(pool, { category: "other", message: "x" }),
    ).rejects.toThrow(/no row/i);
  });
});
