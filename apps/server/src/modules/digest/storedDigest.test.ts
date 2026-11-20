import { describe, expect, it } from "vitest";
import { storedDigestFromMemory } from "./storedDigest.js";
import type { CoachMemory } from "../chat/coach.js";

const block = { summary: "s", comment: "c", recommendations: [] };

function memory(entries: unknown[]): CoachMemory {
  return {
    weeklyDigests: entries as CoachMemory["weeklyDigests"],
    lastInsightDate: null,
    lastInsightText: null,
  };
}

describe("storedDigestFromMemory", () => {
  it("віддає звіт тижня у формі відповіді, без службових correlations", () => {
    const got = storedDigestFromMemory(
      memory([
        {
          weekKey: "2026-11-09",
          weekRange: "9 лист. – 15 лист.",
          generatedAt: "2026-11-16T08:00:00.000Z",
          finyk: block,
          fizruk: null,
          nutrition: null,
          routine: null,
          overallRecommendations: ["a"],
          correlations: ["x"],
        },
      ]),
      "2026-11-09",
    );
    expect(got).toEqual({
      report: {
        finyk: block,
        fizruk: null,
        nutrition: null,
        routine: null,
        overallRecommendations: ["a"],
      },
      generatedAt: "2026-11-16T08:00:00.000Z",
    });
  });

  it("немає памʼяті, іншого тижня, generatedAt, зламана форма чи жодного модуля → null", () => {
    expect(storedDigestFromMemory(null, "2026-11-09")).toBeNull();
    expect(
      storedDigestFromMemory(
        memory([{ weekKey: "2026-11-02", generatedAt: "t", finyk: block }]),
        "2026-11-09",
      ),
    ).toBeNull();
    expect(
      storedDigestFromMemory(
        memory([{ weekKey: "2026-11-09", finyk: block }]),
        "2026-11-09",
      ),
    ).toBeNull();
    expect(
      storedDigestFromMemory(
        memory([
          { weekKey: "2026-11-09", generatedAt: "t", finyk: { summary: "s" } },
        ]),
        "2026-11-09",
      ),
    ).toBeNull();
    expect(
      storedDigestFromMemory(
        memory([{ weekKey: "2026-11-09", generatedAt: "t" }]),
        "2026-11-09",
      ),
    ).toBeNull();
  });
});
