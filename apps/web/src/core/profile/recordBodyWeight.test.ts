// @vitest-environment jsdom
/**
 * W1-WEIGHT-SOT стадія 2 — тести спільного write-funnel-а ваги.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  BIOMETRICS_DEFAULT,
  readBiometrics,
  writeBiometrics,
} from "./biometrics";
import { recordBodyWeight } from "./recordBodyWeight";

beforeEach(() => {
  localStorage.clear();
  writeBiometrics({ ...BIOMETRICS_DEFAULT });
});

describe("recordBodyWeight", () => {
  it("оновлює знімок ваги + LWW-марковер", () => {
    recordBodyWeight({ weightKg: 81.4, at: "2026-06-22T08:00:00.000Z" });
    const b = readBiometrics();
    expect(b.weightKg).toBe(81.4);
    expect(b.weightUpdatedAt).toBe("2026-06-22T08:00:00.000Z");
    expect(b.updatedAt).toBe("2026-06-22T08:00:00.000Z");
  });

  it("новіший запис перебиває старіший (LWW)", () => {
    recordBodyWeight({ weightKg: 84, at: "2026-06-20T08:00:00.000Z" });
    recordBodyWeight({ weightKg: 82, at: "2026-06-22T08:00:00.000Z" });
    expect(readBiometrics().weightKg).toBe(82);
  });

  it("проставляє `at` сам, коли викликач його не дав", () => {
    recordBodyWeight({ weightKg: 77 });
    const b = readBiometrics();
    expect(b.weightKg).toBe(77);
    expect(b.weightUpdatedAt).not.toBeNull();
  });

  it("no-op на сміттєвому вводі — профіль не псується", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      recordBodyWeight({ weightKg: bad });
    }
    recordBodyWeight({ weightKg: "80" as unknown as number });
    expect(readBiometrics().weightKg).toBeNull();
  });

  it("не чіпає інші поля біометрії", () => {
    writeBiometrics({
      ...BIOMETRICS_DEFAULT,
      heightCm: 180,
      sex: "male",
      activityLevel: "moderate",
      birthDate: "1995-01-15",
    });
    recordBodyWeight({ weightKg: 80, at: "2026-06-22T08:00:00.000Z" });
    const b = readBiometrics();
    expect(b.heightCm).toBe(180);
    expect(b.sex).toBe("male");
    expect(b.activityLevel).toBe("moderate");
    expect(b.birthDate).toBe("1995-01-15");
  });
});
