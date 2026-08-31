import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addDeviceDays,
  deviceDayKey,
  deviceTimeOfDay,
  deviceWallClockToInstant,
  previousDeviceDayKey,
} from "./deviceDayKey.js";

/**
 * Тести ПРО таймзони, тож vitest пінить `TZ=UTC` (див. vitest.config.ts).
 * Зсув «чужого» пристрою підміняємо точково — `getTimezoneOffset` — бо це
 * єдине, що `deviceWallClockToInstant` читає з середовища: настінну
 * частину вона проносить дослівно.
 */
function withDeviceOffsetMinutes(offsetMinutes: number): void {
  vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-offsetMinutes);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("deviceDayKey / previousDeviceDayKey", () => {
  it("бере день з годинника пристрою", () => {
    expect(deviceDayKey(new Date("2026-08-23T23:53:00.000Z"))).toBe(
      "2026-08-23",
    );
  });

  it("previousDeviceDayKey відкочує на добу", () => {
    expect(previousDeviceDayKey("2026-03-01")).toBe("2026-02-28");
  });
});

describe("addDeviceDays", () => {
  it("зсуває вперед і назад через межу місяця", () => {
    expect(addDeviceDays("2026-05-31", 1)).toBe("2026-06-01");
    expect(addDeviceDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDeviceDays("2026-05-10", 0)).toBe("2026-05-10");
  });

  it("previousDeviceDayKey делегує в addDeviceDays(-1)", () => {
    expect(previousDeviceDayKey("2026-08-30")).toBe(
      addDeviceDays("2026-08-30", -1),
    );
  });
});

describe("deviceTimeOfDay", () => {
  it("повертає HH:MM з нулями попереду", () => {
    expect(deviceTimeOfDay(new Date("2026-08-23T04:05:00.000Z"))).toBe("04:05");
  });

  it("на пристрої в UTC пізній вечір лишається пізнім вечором", () => {
    expect(deviceTimeOfDay(new Date("2026-08-23T23:53:00.000Z"))).toBe("23:53");
  });
});

describe("deviceWallClockToInstant", () => {
  /**
   * Регресія на дефект «момент, якого не існувало»: запис о 23:53 UTC 23-го
   * (= 02:53 за Києвом 24-го) лягав як `2026-08-23T02:53:00.000Z` —
   * девайсовий ДЕНЬ склеєний із київським НАСТІННИМ часом і штампований
   * як UTC. День-ключ був правильний, момент — на 21 годину раніше за
   * фактичний, тож будь-яка аналітика «о котрій людина їсть» брехала.
   */
  it("пристрій у UTC: пізній вечір → день-ключ і момент збігаються з фактом", () => {
    const realInstant = new Date("2026-08-23T23:53:00.000Z");

    const dateKey = deviceDayKey(realInstant);
    const time = deviceTimeOfDay(realInstant);
    expect(dateKey).toBe("2026-08-23");
    expect(time).toBe("23:53");

    const eatenAt = deviceWallClockToInstant(dateKey, time);
    expect(eatenAt).toBe("2026-08-23T23:53:00.000Z");
    // Головне: складений рядок вказує на ТОЙ САМИЙ момент, що й факт.
    expect(new Date(eatenAt).getTime()).toBe(realInstant.getTime());
    // І день-ключ усе ще відновлюється зрізом (так його читає sqliteReader).
    expect(eatenAt.slice(0, 10)).toBe("2026-08-23");
    expect(eatenAt.slice(11, 16)).toBe("23:53");
  });

  it("пристрій у Києві (+03:00): той самий момент, свій день-ключ", () => {
    withDeviceOffsetMinutes(180);
    const realInstant = new Date("2026-08-23T23:53:00.000Z");

    // Настінний годинник киянина в цю мить — 24-те, 02:53.
    const eatenAt = deviceWallClockToInstant("2026-08-24", "02:53");
    expect(eatenAt).toBe("2026-08-24T02:53:00.000+03:00");
    expect(new Date(eatenAt).getTime()).toBe(realInstant.getTime());
    expect(eatenAt.slice(0, 10)).toBe("2026-08-24");
    expect(eatenAt.slice(11, 16)).toBe("02:53");
  });

  it("відʼємний зсув пристрою пишеться зі знаком мінус", () => {
    withDeviceOffsetMinutes(-330);
    expect(deviceWallClockToInstant("2026-08-23", "18:53")).toBe(
      "2026-08-23T18:53:00.000-05:30",
    );
  });

  it("сміттєвий вхід не ламає формат", () => {
    expect(deviceWallClockToInstant("не дата", "не час")).toBe(
      "1970-01-01T00:00:00.000Z",
    );
  });
});
