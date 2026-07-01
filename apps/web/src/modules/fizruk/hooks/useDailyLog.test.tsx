// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEYS } from "@sergeant/shared";
import { readBiometrics } from "../../../core/profile/biometrics";
import { useDailyLog } from "./useDailyLog";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("useDailyLog.addEntry", () => {
  it("тримає новий запис у стані і НЕ пише legacy LS-ключ (DCRUD-007 cutover)", () => {
    const { result } = renderHook(() => useDailyLog());

    act(() => {
      result.current.addEntry({ sleepHours: 7, moodScore: 4 });
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]?.sleepHours).toBe(7);
    expect(result.current.entries[0]?.moodScore).toBe(4);
    // Журнал персиститься виключно через dual-write пайплайн у
    // структурну таблицю fizruk_daily_log; legacy-ключ дренується на
    // boot і більше не пишеться.
    expect(localStorage.getItem(STORAGE_KEYS.FIZRUK_DAILY_LOG)).toBeNull();
  });

  it("mirrors a weight write into hub_biometrics_v1", () => {
    const { result } = renderHook(() => useDailyLog());

    act(() => {
      result.current.addEntry({ weightKg: 78.2 });
    });

    const bio = readBiometrics();
    expect(bio.weightKg).toBe(78.2);
    expect(bio.weightUpdatedAt).not.toBeNull();
  });

  it("does not touch biometrics when weight is absent", () => {
    const { result } = renderHook(() => useDailyLog());

    act(() => {
      result.current.addEntry({ sleepHours: 8 });
    });

    expect(localStorage.getItem(STORAGE_KEYS.HUB_BIOMETRICS)).toBeNull();
  });
});
