import { describe, expect, it } from "vitest";

import { formatMeasureSets } from "./measureFormat";

describe("formatMeasureSets — підсумок вправи за типом виміру", () => {
  it("три однакові утримання — «3 × 30 с»", () => {
    expect(
      formatMeasureSets({
        type: "time",
        measure: "time",
        sets: [
          { weightKg: 0, reps: 0, durationSec: 30 },
          { weightKg: 0, reps: 0, durationSec: 30 },
          { weightKg: 0, reps: 0, durationSec: 30 },
        ],
      }),
    ).toBe("3 × 30 с");
  });

  it("незараховані рядки не друкуються, різні значення — через кому", () => {
    expect(
      formatMeasureSets({
        type: "time",
        measure: "time",
        sets: [
          { weightKg: 0, reps: 0, durationSec: 30 },
          { weightKg: 0, reps: 0, durationSec: 45 },
          { weightKg: 0, reps: 0 },
        ],
      }),
    ).toBe("30 с, 45 с");
  });

  it("дистанція — «3 × 400 м»", () => {
    expect(
      formatMeasureSets({
        type: "distance",
        measure: "distance_time",
        sets: [1, 2, 3].map(() => ({
          weightKg: 0,
          reps: 0,
          distanceM: 400,
          durationSec: 0,
        })),
      }),
    ).toBe("3 × 400 м");
  });

  it("вага × дистанція — вага однією приміткою", () => {
    expect(
      formatMeasureSets({
        type: "distance",
        measure: "weight_distance",
        sets: [
          { weightKg: 24, reps: 0, distanceM: 40 },
          { weightKg: 24, reps: 0, distanceM: 40 },
        ],
      }),
    ).toBe("2 × 40 м · 24 кг");
  });

  it("один забіг із часом — «5000 м за 25 хв 0 с»", () => {
    expect(
      formatMeasureSets({
        type: "distance",
        measure: "distance_time",
        sets: [{ weightKg: 0, reps: 0, distanceM: 5000, durationSec: 1500 }],
      }),
    ).toBe("5000 м за 25 хв 0 с");
  });

  it("лише повтори — без «0×»", () => {
    expect(
      formatMeasureSets({
        type: "strength",
        measure: "reps",
        sets: [
          { weightKg: 0, reps: 12 },
          { weightKg: 0, reps: 10 },
        ],
      }),
    ).toBe("12, 10");
  });

  it("порожньо — «—»; вага × повтори і старі записи — null (свій формат)", () => {
    expect(formatMeasureSets({ type: "time", measure: "time", sets: [] })).toBe(
      "—",
    );
    expect(
      formatMeasureSets({ type: "strength", sets: [{ weightKg: 1, reps: 1 }] }),
    ).toBeNull();
    expect(formatMeasureSets({ type: "time", durationSec: 90 })).toBeNull();
  });
});
