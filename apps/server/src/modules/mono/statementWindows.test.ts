import { describe, expect, it } from "vitest";
import {
  MONO_STATEMENT_PAGE_SIZE,
  nextStatementPageTo,
  MONO_HISTORY_WINDOWS,
  MONO_STATEMENT_WINDOW_SEC,
  monoHistoryWindows,
} from "./statementWindows.js";

const NOW = 1_763_460_000; // 2025-11-18, довільна фіксована мить

describe("monoHistoryWindows", () => {
  it("дає три вікна по 31 дню, найновіше першим (OD-26 Ф-3 (а))", () => {
    expect(MONO_HISTORY_WINDOWS).toBe(3);
    expect(MONO_STATEMENT_WINDOW_SEC).toBe(31 * 24 * 60 * 60);

    const windows = monoHistoryWindows(NOW);

    expect(windows).toHaveLength(3);
    expect(windows[0]).toEqual({
      from: NOW - MONO_STATEMENT_WINDOW_SEC,
      to: NOW,
    });
    for (let i = 1; i < windows.length; i++) {
      // Суцільне покриття без перекриття: кожне старше вікно закінчується
      // за секунду до початку новішого.
      expect(windows[i]!.to).toBe(windows[i - 1]!.from - 1);
      expect(windows[i]!.from).toBeLessThan(windows[i]!.to);
    }
  });

  it("жодне вікно не довше за ліміт одного запиту Monobank (31 доба + 1 год)", () => {
    for (const w of monoHistoryWindows(NOW)) {
      expect(w.to - w.from).toBeLessThanOrEqual(31 * 86_400 + 3_600);
    }
  });

  it("покриває щонайменше три календарні місяці", () => {
    const windows = monoHistoryWindows(NOW);
    const oldest = windows[windows.length - 1]!.from;
    expect(NOW - oldest).toBeGreaterThanOrEqual(92 * 86_400);
  });

  it("порожньо при нулі вікон", () => {
    expect(monoHistoryWindows(NOW, 0)).toEqual([]);
  });
});

describe("nextStatementPageTo", () => {
  const full = (oldest: number) =>
    Array.from({ length: MONO_STATEMENT_PAGE_SIZE }, (_, i) => oldest + i);

  it("неповна сторінка: гортати нема куди", () => {
    expect(nextStatementPageTo([NOW - 5, NOW - 9], NOW, NOW - 100)).toBeNull();
  });

  it("повна сторінка: межа включна, на найстарішій миті (data-65)", () => {
    expect(nextStatementPageTo(full(NOW - 1_000), NOW, NOW - 10_000)).toBe(
      NOW - 1_000,
    );
  });

  it("сторінка не просунулась (усе в секунду pageTo): стоп, а не вічний цикл", () => {
    expect(
      nextStatementPageTo(
        Array(MONO_STATEMENT_PAGE_SIZE).fill(NOW),
        NOW,
        NOW - 100,
      ),
    ).toBeNull();
  });

  it("найстаріша операція поза вікном: стоп", () => {
    expect(nextStatementPageTo(full(NOW - 1_000), NOW, NOW - 500)).toBeNull();
  });
});
