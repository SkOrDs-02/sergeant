import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEYS } from "@sergeant/shared";
import {
  BIOMETRICS_DEFAULT,
  BiometricsSchema,
  computeAgeYears,
  isBiometricsCompleteForTdee,
  mirrorWeightToBiometrics,
  readBiometrics,
  writeBiometrics,
  writeBiometricsPatch,
  type Biometrics,
} from "./biometrics";

const memoryStore = new Map<string, string>();

const localStorageMock: Storage = {
  getItem: (key) => memoryStore.get(key) ?? null,
  setItem: (key, value) => {
    memoryStore.set(key, value);
  },
  removeItem: (key) => {
    memoryStore.delete(key);
  },
  clear: () => {
    memoryStore.clear();
  },
  key: (idx) => Array.from(memoryStore.keys())[idx] ?? null,
  get length() {
    return memoryStore.size;
  },
};

beforeEach(() => {
  memoryStore.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorageMock,
  });
});

afterEach(() => {
  memoryStore.clear();
});

describe("BiometricsSchema", () => {
  it("accepts the empty default", () => {
    expect(BiometricsSchema.safeParse(BIOMETRICS_DEFAULT).success).toBe(true);
  });

  it("accepts a fully populated record", () => {
    const valid: Biometrics = {
      heightCm: 178,
      birthDate: "1990-05-12",
      sex: "male",
      activityLevel: "moderate",
      weightKg: 75.5,
      weightUpdatedAt: "2026-01-01T08:00:00.000Z",
      updatedAt: "2026-01-01T08:00:00.000Z",
    };
    expect(BiometricsSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects out-of-range weight", () => {
    const invalid = { ...BIOMETRICS_DEFAULT, weightKg: 1000 };
    expect(BiometricsSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects invalid sex enum", () => {
    const invalid = { ...BIOMETRICS_DEFAULT, sex: "other" };
    expect(BiometricsSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects malformed birthDate", () => {
    const invalid = { ...BIOMETRICS_DEFAULT, birthDate: "12/05/1990" };
    expect(BiometricsSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("readBiometrics / writeBiometrics", () => {
  it("returns the default when no record exists", () => {
    expect(readBiometrics()).toEqual(BIOMETRICS_DEFAULT);
  });

  it("round-trips a written record", () => {
    const record: Biometrics = {
      ...BIOMETRICS_DEFAULT,
      heightCm: 165,
      sex: "female",
      updatedAt: "2026-02-02T00:00:00.000Z",
    };
    writeBiometrics(record);
    expect(readBiometrics()).toEqual(record);
  });

  it("falls back to default when stored blob is malformed", () => {
    memoryStore.set(STORAGE_KEYS.HUB_BIOMETRICS, "{not json");
    expect(readBiometrics()).toEqual(BIOMETRICS_DEFAULT);
  });
});

describe("computeAgeYears", () => {
  it("returns null for a missing birth date", () => {
    expect(computeAgeYears(null)).toBeNull();
  });

  it("returns null for unparsable input", () => {
    expect(computeAgeYears("not-a-date")).toBeNull();
  });

  it("returns the user's age in whole years", () => {
    expect(
      computeAgeYears("1990-05-12", new Date("2026-05-13T00:00:00Z")),
    ).toBe(36);
  });

  it("rounds down before the birthday in the current year", () => {
    expect(
      computeAgeYears("1990-05-12", new Date("2026-05-11T00:00:00Z")),
    ).toBe(35);
  });

  it("rounds down for a previous-month evaluation date", () => {
    expect(
      computeAgeYears("1990-05-12", new Date("2026-04-30T00:00:00Z")),
    ).toBe(35);
  });
});

describe("mirrorWeightToBiometrics", () => {
  it("writes the weight + bumps weightUpdatedAt", () => {
    mirrorWeightToBiometrics(72.4, "2026-03-01T10:00:00.000Z");
    const out = readBiometrics();
    expect(out.weightKg).toBe(72.4);
    expect(out.weightUpdatedAt).toBe("2026-03-01T10:00:00.000Z");
    expect(out.updatedAt).toBe("2026-03-01T10:00:00.000Z");
  });

  it("preserves other biometric fields", () => {
    writeBiometrics({
      ...BIOMETRICS_DEFAULT,
      heightCm: 180,
      sex: "male",
      activityLevel: "active",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    mirrorWeightToBiometrics(80, "2026-04-01T00:00:00.000Z");
    const out = readBiometrics();
    expect(out.heightCm).toBe(180);
    expect(out.sex).toBe("male");
    expect(out.activityLevel).toBe("active");
    expect(out.weightKg).toBe(80);
  });

  it("is idempotent for identical weight + at", () => {
    mirrorWeightToBiometrics(70, "2026-05-01T00:00:00.000Z");
    const after = readBiometrics();
    mirrorWeightToBiometrics(70, "2026-05-01T00:00:00.000Z");
    expect(readBiometrics()).toEqual(after);
  });
});

describe("writeBiometricsPatch", () => {
  it("merges the patch onto the current record + bumps updatedAt", () => {
    writeBiometricsPatch(
      { heightCm: 180, sex: "male" },
      "2026-06-01T09:00:00.000Z",
    );
    const out = readBiometrics();
    expect(out.heightCm).toBe(180);
    expect(out.sex).toBe("male");
    expect(out.updatedAt).toBe("2026-06-01T09:00:00.000Z");
    // weightKg untouched, weightUpdatedAt left null because the patch
    // didn't include weightKg.
    expect(out.weightKg).toBeNull();
    expect(out.weightUpdatedAt).toBeNull();
  });

  it("bumps weightUpdatedAt when weightKg is part of the patch", () => {
    writeBiometricsPatch({ weightKg: 71 }, "2026-06-01T18:00:00.000Z");
    const out = readBiometrics();
    expect(out.weightKg).toBe(71);
    expect(out.weightUpdatedAt).toBe("2026-06-01T18:00:00.000Z");
  });

  it("preserves weightUpdatedAt when weightKg is NOT in the patch", () => {
    writeBiometrics({
      ...BIOMETRICS_DEFAULT,
      weightKg: 70,
      weightUpdatedAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    });
    writeBiometricsPatch(
      { activityLevel: "active" },
      "2026-06-01T00:00:00.000Z",
    );
    const out = readBiometrics();
    expect(out.activityLevel).toBe("active");
    expect(out.weightUpdatedAt).toBe("2026-05-01T00:00:00.000Z");
    expect(out.updatedAt).toBe("2026-06-01T00:00:00.000Z");
  });

  it("bumps weightUpdatedAt for an explicit weight clear (weightKg=null)", () => {
    writeBiometrics({
      ...BIOMETRICS_DEFAULT,
      weightKg: 70,
      weightUpdatedAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    });
    writeBiometricsPatch({ weightKg: null }, "2026-06-01T00:00:00.000Z");
    const out = readBiometrics();
    expect(out.weightKg).toBeNull();
    expect(out.weightUpdatedAt).toBe("2026-06-01T00:00:00.000Z");
  });

  it("does NOT mirror the write into fizruk_daily_log_v1", () => {
    // The Fizruk daily-log mirror lives in BiometricsSection (which
    // calls useDailyLog.addEntry). biometrics.ts itself is module-pure.
    writeBiometricsPatch({ weightKg: 80 }, "2026-09-01T00:00:00.000Z");
    expect(memoryStore.get(STORAGE_KEYS.FIZRUK_DAILY_LOG)).toBeUndefined();
  });
});

describe("isBiometricsCompleteForTdee", () => {
  const ready: Biometrics = {
    heightCm: 178,
    birthDate: "1990-01-01",
    sex: "male",
    activityLevel: "moderate",
    weightKg: 80,
    weightUpdatedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("returns true when every required field is present", () => {
    expect(isBiometricsCompleteForTdee(ready)).toBe(true);
  });

  it("returns false when any required field is missing", () => {
    expect(isBiometricsCompleteForTdee({ ...ready, heightCm: null })).toBe(
      false,
    );
    expect(isBiometricsCompleteForTdee({ ...ready, weightKg: null })).toBe(
      false,
    );
    expect(isBiometricsCompleteForTdee({ ...ready, sex: null })).toBe(false);
    expect(isBiometricsCompleteForTdee({ ...ready, activityLevel: null })).toBe(
      false,
    );
    expect(isBiometricsCompleteForTdee({ ...ready, birthDate: null })).toBe(
      false,
    );
  });
});
