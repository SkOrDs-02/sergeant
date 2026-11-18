import { describe, expect, it } from "vitest";
import { CORRELATION_MIN_N } from "@sergeant/shared";
import { buildNewcomerTimeline } from "./newcomerTimeline";

const ALL = ["finyk", "fizruk", "routine", "nutrition"] as const;

describe("buildNewcomerTimeline", () => {
  it("для того, хто увійшов, з усіма модулями: банк, звіт тижня, звʼязки — у цьому порядку", () => {
    const rows = buildNewcomerTimeline({
      activeModules: ALL,
      signedIn: true,
      sharedDays: 0,
    });
    expect(rows.map((r) => r.id)).toEqual(["bankFacts", "weekReport", "links"]);
    const links = rows.find((r) => r.id === "links");
    expect(links?.progress).toEqual({ value: 0, max: CORRELATION_MIN_N });
  });

  it("гостю не показує рядків, що потребують акаунта", () => {
    const rows = buildNewcomerTimeline({
      activeModules: ALL,
      signedIn: false,
      sharedDays: 0,
    });
    expect(rows.map((r) => r.id)).toEqual(["links"]);
  });

  it("без Фініка немає рядка про банк", () => {
    const rows = buildNewcomerTimeline({
      activeModules: ["fizruk", "routine"],
      signedIn: true,
      sharedDays: 0,
    });
    expect(rows.map((r) => r.id)).toEqual(["weekReport", "links"]);
  });

  it("з одним модулем звʼязків немає: гість без Фініка не отримує жодного рядка", () => {
    expect(
      buildNewcomerTimeline({
        activeModules: ["fizruk"],
        signedIn: false,
        sharedDays: 0,
      }),
    ).toEqual([]);
  });

  it("прогрес звʼязків не виходить за поріг і не буває відʼємним", () => {
    const over = buildNewcomerTimeline({
      activeModules: ALL,
      signedIn: false,
      sharedDays: CORRELATION_MIN_N + 5,
    });
    expect(over[0]?.progress?.value).toBe(CORRELATION_MIN_N);
    const under = buildNewcomerTimeline({
      activeModules: ALL,
      signedIn: false,
      sharedDays: -3,
    });
    expect(under[0]?.progress?.value).toBe(0);
  });
});
