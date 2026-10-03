import { describe, it, expect } from "vitest";
import {
  diffCustomActivitiesOps,
  type FizrukCustomActivitySnapshot,
} from "./customActivities";

function baseActivity(
  overrides: Partial<FizrukCustomActivitySnapshot> = {},
): FizrukCustomActivitySnapshot {
  return { id: "act1", nameUk: "TRX у моєму залі", met: 6, ...overrides };
}

describe("diffCustomActivitiesOps", () => {
  it("апсертить заняття, якого не було", () => {
    expect(diffCustomActivitiesOps([], [baseActivity()])).toEqual([
      { kind: "custom-activity-upsert", activity: baseActivity() },
    ]);
  });

  it("видаляє заняття, якого не стало", () => {
    expect(diffCustomActivitiesOps([baseActivity()], [])).toEqual([
      { kind: "custom-activity-delete", activityId: "act1" },
    ]);
  });

  it("мовчить, коли посилання те саме", () => {
    const a = baseActivity();
    expect(diffCustomActivitiesOps([a], [a])).toEqual([]);
  });

  it("апсертить на будь-яку зміну посилання - це JSON-блоб", () => {
    expect(diffCustomActivitiesOps([baseActivity()], [baseActivity()])).toEqual(
      [{ kind: "custom-activity-upsert", activity: baseActivity() }],
    );
  });

  it("відсутній список трактує як порожній, а не падає", () => {
    // Стани, зібрані вручну в старих тестах, поля не несуть.
    expect(diffCustomActivitiesOps(undefined, [baseActivity()])).toEqual([
      { kind: "custom-activity-upsert", activity: baseActivity() },
    ]);
    expect(diffCustomActivitiesOps(undefined, undefined)).toEqual([]);
  });
});
