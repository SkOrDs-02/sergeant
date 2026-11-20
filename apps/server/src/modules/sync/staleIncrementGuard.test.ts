/**
 * Відмова для `increment`, старших за вікно чистки журналу
 * (`staleIncrementGuard.ts`, ADR-0105 §2).
 */
import { afterEach, describe, expect, it } from "vitest";

import { env } from "../../env/env.js";
import {
  STALE_INCREMENT_MARGIN_MS,
  appliedRetentionDays,
  isIncrementPastReplayWindow,
} from "./staleIncrementGuard.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2027-03-01T12:00:00Z");

describe("isIncrementPastReplayWindow", () => {
  it("чистка вимкнена (0 днів) — не відхиляє навіть дуже старе", () => {
    expect(isIncrementPastReplayWindow(new Date(0), NOW, 0)).toBe(false);
  });

  it("відхиляє все, що старше за вікно мінус запас у добу", () => {
    const edge = NOW - 90 * DAY + STALE_INCREMENT_MARGIN_MS;
    expect(isIncrementPastReplayWindow(new Date(edge - 1), NOW, 90)).toBe(true);
    expect(isIncrementPastReplayWindow(new Date(edge), NOW, 90)).toBe(false);
    expect(isIncrementPastReplayWindow(new Date(NOW - DAY), NOW, 90)).toBe(
      false,
    );
  });

  it("запас не менший за допуск годинника вперед у push (1 год)", () => {
    // Оп, чий рядок чистка могла видалити, мав client_ts < now - D + 1 год.
    expect(STALE_INCREMENT_MARGIN_MS).toBeGreaterThanOrEqual(60 * 60 * 1000);
    const deletedAtEdge = NOW - 90 * DAY + 60 * 60 * 1000 - 1;
    expect(isIncrementPastReplayWindow(new Date(deletedAtEdge), NOW, 90)).toBe(
      true,
    );
  });
});

describe("appliedRetentionDays", () => {
  const original = env.SYNC_OP_LOG_APPLIED_RETENTION_DAYS;
  afterEach(() => {
    env.SYNC_OP_LOG_APPLIED_RETENTION_DAYS = original;
  });

  it("дефолт env — 0 (вимкнено)", () => {
    expect(original).toBe(0);
    expect(appliedRetentionDays()).toBe(0);
  });

  it("додатне значення береться, відʼємне означає вимкнено", () => {
    env.SYNC_OP_LOG_APPLIED_RETENTION_DAYS = 90;
    expect(appliedRetentionDays()).toBe(90);
    env.SYNC_OP_LOG_APPLIED_RETENTION_DAYS = -1;
    expect(appliedRetentionDays()).toBe(0);
  });
});
