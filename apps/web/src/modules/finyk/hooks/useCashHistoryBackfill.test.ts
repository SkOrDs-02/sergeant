/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCashHistoryBackfill } from "./useCashHistoryBackfill";

describe("useCashHistoryBackfill", () => {
  it("дотягує банк у дзеркало від дня створення готівки", () => {
    const fetchRange = vi.fn().mockResolvedValue([]);
    const createdAt = Date.UTC(2026, 4, 10, 9);
    renderHook(() => useCashHistoryBackfill(createdAt, fetchRange));
    expect(fetchRange).toHaveBeenCalledTimes(1);
    expect(fetchRange.mock.calls[0]![0]).toBe("2026-05-10T09:00:00.000Z");
  });

  it("без готівки нічого не тягне", () => {
    const fetchRange = vi.fn().mockResolvedValue([]);
    renderHook(() => useCashHistoryBackfill(undefined, fetchRange));
    expect(fetchRange).not.toHaveBeenCalled();
  });
});
