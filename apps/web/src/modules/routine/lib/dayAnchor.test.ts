import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ROUTINE_DAY_ANCHOR,
  anchoredTodayDate,
  anchoredTodayKey,
} from "./dayAnchor";
import { todayDate } from "../RoutineApp.helpers";

/**
 * Регресія на «day_anchor бреше»: `routine_completion_events.day_anchor`
 * був захардкоджений літералом `"device-local"`, тоді як `date_key`
 * приходив із київського «сьогодні». Тепер мітка й генератор ключа живуть
 * в одному модулі — ці тести пінять і саму мітку, і те, що всі точки
 * входу routine рахують «сьогодні» через неї.
 *
 * Vitest пінить `TZ=UTC` (`apps/web/vitest.config.js`), тож пристрій тут
 * навмисно НЕ київський — саме на такому пристрої розбіжність і видно.
 */
afterEach(() => {
  vi.useRealTimers();
});

describe("ROUTINE_DAY_ANCHOR", () => {
  it("описує анкер, яким РЕАЛЬНО порахований ключ (наразі Kyiv)", () => {
    expect(ROUTINE_DAY_ANCHOR).toBe("kyiv");
  });

  it("належить словнику колонки day_anchor", () => {
    expect(["device-local", "kyiv", "unknown"]).toContain(ROUTINE_DAY_ANCHOR);
  });
});

describe("anchoredTodayKey", () => {
  it("пізній вечір UTC = наступна доба за Києвом → київський ключ", () => {
    vi.useFakeTimers();
    // 23:53 UTC 23-го числа; у Києві (+03:00) вже 02:53 24-го.
    vi.setSystemTime(new Date("2026-08-23T23:53:00.000Z"));

    expect(anchoredTodayKey()).toBe("2026-08-24");
    // Саме ця розбіжність із девайсовим днем (23-тє) і робила літерал
    // `device-local` у журналі неправдою.
    expect(ROUTINE_DAY_ANCHOR).toBe("kyiv");
  });

  it("anchoredTodayDate тримає локальний полудень, щоб зріз дня не плив", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T23:53:00.000Z"));

    const d = anchoredTodayDate();
    expect(d.getHours()).toBe(12);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(24);
  });

  it("RoutineApp.helpers.todayDate ходить через той самий анкер", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T23:53:00.000Z"));

    expect(todayDate().getTime()).toBe(anchoredTodayDate().getTime());
  });
});
