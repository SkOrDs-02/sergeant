// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEYS } from "@sergeant/shared";
import {
  BIOMETRICS_DEFAULT,
  mirrorWeightToBiometrics,
  type Biometrics,
} from "./biometrics";
import { useBiometrics } from "./useBiometrics";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("useBiometrics", () => {
  it("returns the default record when none is persisted", () => {
    const { result } = renderHook(() => useBiometrics());
    expect(result.current.biometrics).toEqual(BIOMETRICS_DEFAULT);
  });

  it("hydrates from localStorage on mount", () => {
    const stored: Biometrics = {
      heightCm: 175,
      birthDate: "1992-04-10",
      sex: "female",
      activityLevel: "light",
      weightKg: 62,
      weightUpdatedAt: "2026-03-01T08:00:00.000Z",
      updatedAt: "2026-03-01T08:00:00.000Z",
    };
    localStorage.setItem(STORAGE_KEYS.HUB_BIOMETRICS, JSON.stringify(stored));

    const { result } = renderHook(() => useBiometrics());

    expect(result.current.biometrics).toEqual(stored);
  });

  it("saveBiometrics persists the patch and updates state", () => {
    const { result } = renderHook(() => useBiometrics());

    act(() => {
      result.current.saveBiometrics({
        heightCm: 180,
        sex: "male",
        activityLevel: "moderate",
      });
    });

    expect(result.current.biometrics.heightCm).toBe(180);
    expect(result.current.biometrics.sex).toBe("male");
    expect(result.current.biometrics.activityLevel).toBe("moderate");

    const persisted = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.HUB_BIOMETRICS) ?? "null",
    ) as Biometrics;
    expect(persisted.heightCm).toBe(180);
    expect(persisted.sex).toBe("male");
  });

  it("saveBiometrics with weight bumps weightUpdatedAt", () => {
    // The cross-module mirror to fizruk_daily_log_v1 lives in
    // BiometricsSection (which composes useDailyLog) — covered by
    // BiometricsSection.test.tsx. The hook itself only owns
    // hub_biometrics_v1, so we just assert the LWW marker bumps.
    const { result } = renderHook(() => useBiometrics());

    act(() => {
      result.current.saveBiometrics({ weightKg: 70 });
    });

    expect(result.current.biometrics.weightKg).toBe(70);
    expect(result.current.biometrics.weightUpdatedAt).not.toBeNull();
  });

  it("re-renders when biometrics change in another tab / via mirror", () => {
    const { result } = renderHook(() => useBiometrics());

    act(() => {
      mirrorWeightToBiometrics(78, "2026-04-01T12:00:00.000Z");
    });

    expect(result.current.biometrics.weightKg).toBe(78);
    expect(result.current.biometrics.weightUpdatedAt).toBe(
      "2026-04-01T12:00:00.000Z",
    );
  });
});
