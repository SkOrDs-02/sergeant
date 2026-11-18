import { describe, expect, it } from "vitest";
import { CORRELATION_MIN_N } from "@sergeant/shared";
import {
  buildNewcomerTimeline,
  isNewcomerTimelineVisible,
} from "./newcomerTimeline";

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

describe("buildNewcomerTimeline: підключений банк і справжній прогрес", () => {
  it("банк уже підключено: рядка «одразу після підключення» немає", () => {
    const rows = buildNewcomerTimeline({
      activeModules: ALL,
      signedIn: true,
      bankConnected: true,
      sharedDays: 4,
    });
    expect(rows.map((r) => r.id)).toEqual(["weekReport", "links"]);
    expect(rows.find((r) => r.id === "links")?.progress).toEqual({
      value: 4,
      max: CORRELATION_MIN_N,
    });
  });
});

describe("isNewcomerTimelineVisible (В-1 → (Б))", () => {
  it("до першого запису видно завжди, як смугу, яку картка замінила", () => {
    expect(
      isNewcomerTimelineVisible({
        hasRealEntry: false,
        inFirstWeek: false,
        linkFound: null,
      }),
    ).toBe(true);
  });

  it("після першого запису: перший тиждень і жодного звʼязку", () => {
    expect(
      isNewcomerTimelineVisible({
        hasRealEntry: true,
        inFirstWeek: true,
        linkFound: false,
      }),
    ).toBe(true);
  });

  it("знайдено звʼязок, минув тиждень або ще рахується: не видно", () => {
    for (const [inFirstWeek, linkFound] of [
      [true, true],
      [false, false],
      [true, null],
    ] as const) {
      expect(
        isNewcomerTimelineVisible({
          hasRealEntry: true,
          inFirstWeek,
          linkFound,
        }),
      ).toBe(false);
    }
  });
});
