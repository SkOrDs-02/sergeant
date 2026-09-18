import { describe, it, expect, vi, beforeEach } from "vitest";
import { importMonobankRange } from "./monobank";
import type { ImportMonobankRangeAction } from "../types.finyk";

// Loose params on purpose — several tests pass invalid dates (null, "",
// malformed) to exercise the handler's validation, so cast the fixture.
function makeAction(from: unknown, to: unknown) {
  return {
    name: "import_monobank_range",
    input: { from, to },
  } as ImportMonobankRangeAction;
}

describe("importMonobankRange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error for invalid from date format", () => {
    const result = importMonobankRange(makeAction("2026/01/01", "2026-01-31"));
    expect(result).toContain("YYYY-MM-DD");
  });

  it("returns error for invalid to date format", () => {
    const result = importMonobankRange(makeAction("2026-01-01", "31-01-2026"));
    expect(result).toContain("YYYY-MM-DD");
  });

  it("returns error when from > to", () => {
    const result = importMonobankRange(makeAction("2026-03-01", "2026-01-01"));
    expect(result).toContain("Некоректний");
  });

  it("returns error for empty strings", () => {
    const result = importMonobankRange(makeAction("", ""));
    expect(result).toContain("YYYY-MM-DD");
  });

  // Чотири тести тут пінили фразу «N міс.» — лічильник місяців, кеш яких
  // нібито очищено. Вони мокали `safeRemoveLS` і НІКОЛИ не перевіряли, що
  // його викликано, тобто пінили саме твердження, а не роботу. Роботи й не
  // було: ключів `finyk_tx_cache_<рік>_<місяць0>` не пише ніхто, крім тесту
  // в `hubChatActionsExtended.test.ts`, який сам їх засівав. Знахідка PR-T7.
  //
  // Замість лічильника перевіряємо контракт, який справді існує: діапазон
  // прийнято і названо назад людині.
  it("приймає валідний діапазон і називає його у відповіді", () => {
    const result = importMonobankRange(makeAction("2026-01-01", "2026-01-31"));
    expect(result).toContain("2026-01-01");
    expect(result).toContain("2026-01-31");
    expect(result).toContain("Оновиться при відкритті Фініка");
  });

  it("однаковий діапазон через рік теж приймається", () => {
    const result = importMonobankRange(makeAction("2025-11-01", "2026-01-31"));
    expect(result).toContain("2025-11-01");
    expect(result).toContain("2026-01-31");
  });

  it("один день — валідний діапазон", () => {
    const result = importMonobankRange(makeAction("2026-06-15", "2026-06-15"));
    expect(result).toContain("2026-06-15");
  });

  it("відповідь більше не обіцяє чищення кешу", () => {
    // Пряма протилежність знятим пінам: обіцянка була неправдою, і саме її
    // тримали тести. Тепер вона заборонена.
    const result = importMonobankRange(makeAction("2026-01-01", "2026-03-31"));
    expect(result).not.toContain("Очищено кеш");
    expect(result).not.toMatch(/\d+ міс/);
  });

  it("handles null values as empty strings", () => {
    const result = importMonobankRange(makeAction(null, null));
    expect(result).toContain("YYYY-MM-DD");
  });
});
