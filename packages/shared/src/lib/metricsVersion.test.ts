import { describe, it, expect } from "vitest";

import {
  METRICS_VERSION,
  LEGACY_METRICS_VERSION,
  resolveMetricsVersion,
  comparableAsTrend,
} from "./metricsVersion";

describe("METRICS_VERSION", () => {
  // Verbatim-пін. Константа входить у збережені дайджести й `coach_memory`,
  // тож її зміна — це подія, а не рефакторинг: підіймати можна ЛИШЕ в тому ж
  // патчі, що змінює методику підрахунку. Тест існує, щоб таке підняття не
  // проїхало непоміченим у дифі.
  it("поточна версія — 11 (once поза стріком, heatmap і rate)", () => {
    expect(METRICS_VERSION).toBe(11);
  });

  it("легасі-версія — 0 і НЕ дорівнює поточній", () => {
    expect(LEGACY_METRICS_VERSION).toBe(0);
    expect(LEGACY_METRICS_VERSION).not.toBe(METRICS_VERSION);
  });
});

describe("resolveMetricsVersion", () => {
  it("відсутнє поле трактує як легасі, а не як поточну версію", () => {
    // Це і є суть провенансу: у старого запису методика НЕВІДОМА, тож
    // приписати йому поточну версію означало б збрехати про його походження.
    expect(resolveMetricsVersion(undefined)).toBe(LEGACY_METRICS_VERSION);
    expect(resolveMetricsVersion(null)).toBe(LEGACY_METRICS_VERSION);
  });

  it("повертає ціле значення як є", () => {
    expect(resolveMetricsVersion(0)).toBe(0);
    expect(resolveMetricsVersion(1)).toBe(1);
    expect(resolveMetricsVersion(7)).toBe(7);
  });

  it("сміття й дробові значення падають у легасі", () => {
    expect(resolveMetricsVersion("1")).toBe(LEGACY_METRICS_VERSION);
    expect(resolveMetricsVersion(1.5)).toBe(LEGACY_METRICS_VERSION);
    expect(resolveMetricsVersion(-1)).toBe(LEGACY_METRICS_VERSION);
    expect(resolveMetricsVersion(Number.NaN)).toBe(LEGACY_METRICS_VERSION);
    expect(resolveMetricsVersion({})).toBe(LEGACY_METRICS_VERSION);
  });
});

describe("comparableAsTrend", () => {
  it("однакові версії можна порівнювати", () => {
    expect(comparableAsTrend(1, 1)).toBe(true);
    expect(comparableAsTrend(undefined, undefined)).toBe(true);
  });

  it("різні версії — НЕ тренд", () => {
    // Головний інваріант: стрибок методики не має читатись як зміна
    // поведінки користувача (ADR-0079 §3).
    expect(comparableAsTrend(1, 2)).toBe(false);
    expect(comparableAsTrend(undefined, 1)).toBe(false);
  });

  it("легасі-запис не еквівалентний явному нулю за походженням, але за версією — так", () => {
    // `undefined` нормалізується у 0, тож із явним 0 він порівнюваний.
    // Це свідомо: обидва означають «методика до провенансу».
    expect(comparableAsTrend(undefined, 0)).toBe(true);
  });
});
