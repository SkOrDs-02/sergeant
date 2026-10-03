import { addDeviceDays, todayISODate } from "@sergeant/nutrition-domain";
import { toKyivISODate } from "@sergeant/shared";

import {
  EAST_OF_KYIV,
  installFakeDeviceZone,
  WEST_OF_KYIV,
} from "./fakeDeviceZone";

// Страхує саму передумову регресійних тестів ADR-0078: у фейковій зоні
// «день пристрою» і «день Києва» справді різні, а `Date` після відновлення
// повертається до справжнього.

describe.each([
  ["на захід від Києва (UTC-5)", WEST_OF_KYIV],
  ["на схід від Києва (UTC+10)", EAST_OF_KYIV],
] as const)("fakeDeviceZone — %s", (_name, zone) => {
  let restore: () => void;

  beforeEach(() => {
    restore = installFakeDeviceZone(zone);
  });
  afterEach(() => {
    restore();
  });

  it("день пристрою і день Києва розходяться", () => {
    expect(todayISODate()).toBe(zone.deviceDay);
    expect(toKyivISODate(new Date())).toBe(zone.kyivDay);
    expect(todayISODate()).not.toBe(toKyivISODate(new Date()));
  });

  it("конструктор з полів і арифметика днів працюють у зоні пристрою", () => {
    const prev = new Date(2026, 9, 1, 12, 0);
    expect([prev.getFullYear(), prev.getMonth(), prev.getDate()]).toEqual([
      2026, 9, 1,
    ]);
    expect(prev.getHours()).toBe(12);
    // Далекий день від Києва лишається в календарі пристрою, а не зсувається.
    expect(addDeviceDays("2026-10-01", 1)).toBe("2026-10-02");
    expect(addDeviceDays("2026-10-01", -1)).toBe("2026-09-30");
  });

  it("відновлює справжній Date", () => {
    restore();
    expect(new Date(0).getTime()).toBe(0);
    expect(Date.now()).not.toBe(Date.parse(zone.nowIso));
    restore = installFakeDeviceZone(zone); // щоб afterEach не впав
  });
});
