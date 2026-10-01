import { describe, expect, it } from "vitest";
import { kyivDayStartMs } from "@sergeant/shared";
import {
  shiftDayKey,
  weekSliceWindows,
  weekWindowByMondayKey,
} from "./weekSlices";

describe("weekSliceWindows", () => {
  it("середа: тиждень від понеділка до кінця середи проти пн–ср минулого", () => {
    // Ср 2026-09-16 15:00 за Києвом (літо, UTC+3).
    const w = weekSliceWindows(new Date("2026-09-16T12:00:00Z"));
    expect(w.todayKey).toBe("2026-09-16");
    expect(w.daysElapsed).toBe(3);
    expect(w.current).toEqual({
      startMs: kyivDayStartMs("2026-09-14"),
      endMs: kyivDayStartMs("2026-09-17"),
    });
    expect(w.previous).toEqual({
      startMs: kyivDayStartMs("2026-09-07"),
      endMs: kyivDayStartMs("2026-09-10"),
    });
  });

  it("понеділок: один день проти одного дня, а не неповний тиждень проти повного", () => {
    const w = weekSliceWindows(new Date("2026-09-14T09:00:00Z"));
    expect(w.daysElapsed).toBe(1);
    expect(w.current.endMs - w.current.startMs).toBe(
      kyivDayStartMs("2026-09-15") - kyivDayStartMs("2026-09-14"),
    );
    expect(w.previous).toEqual({
      startMs: kyivDayStartMs("2026-09-07"),
      endMs: kyivDayStartMs("2026-09-08"),
    });
  });

  it("неділя: повний тиждень проти повного минулого", () => {
    const w = weekSliceWindows(new Date("2026-09-20T09:00:00Z"));
    expect(w.daysElapsed).toBe(7);
    expect(w.current.endMs).toBe(kyivDayStartMs("2026-09-21"));
    expect(w.previous.endMs).toBe(kyivDayStartMs("2026-09-14"));
  });

  it("межа доби київська: 21:30 UTC неділі вже понеділок за Києвом", () => {
    // 2026-09-13T21:30Z = 2026-09-14 00:30 Kyiv → новий тиждень, день 1.
    const w = weekSliceWindows(new Date("2026-09-13T21:30:00Z"));
    expect(w.todayKey).toBe("2026-09-14");
    expect(w.daysElapsed).toBe(1);
    expect(w.current.startMs).toBe(kyivDayStartMs("2026-09-14"));
  });

  it("тиждень із переходом на зимовий час: відрізки лишаються рівними за календарними днями", () => {
    // Київ переходить 2026-10-25 о 04:00 (+3 → +2): неділя 25 жовтня має 25
    // годин. Середа 28 жовтня: пн 26 – ср 28 проти пн 19 – ср 21.
    const w = weekSliceWindows(new Date("2026-10-28T10:00:00Z"));
    expect(w.daysElapsed).toBe(3);
    expect(w.current.startMs).toBe(kyivDayStartMs("2026-10-26"));
    expect(w.current.endMs).toBe(kyivDayStartMs("2026-10-29"));
    expect(w.previous.startMs).toBe(kyivDayStartMs("2026-10-19"));
    expect(w.previous.endMs).toBe(kyivDayStartMs("2026-10-22"));
  });

  it("тиждень, що починається в переходовий понеділок, рахує попередній за днями", () => {
    // Вівторок 2026-10-27 — понеділок 26-го вже зимовий, попередній пн 19-го
    // ще літній: різниця між стартами тижнів 7 діб + 1 година.
    const w = weekSliceWindows(new Date("2026-10-27T10:00:00Z"));
    expect(w.daysElapsed).toBe(2);
    expect(w.current.startMs - w.previous.startMs).toBe(
      7 * 86_400_000 + 3_600_000,
    );
    expect(w.previous.endMs).toBe(kyivDayStartMs("2026-10-21"));
  });

  it("приймає і мілісекунди, і Date", () => {
    const iso = "2026-09-16T12:00:00Z";
    expect(weekSliceWindows(Date.parse(iso))).toEqual(
      weekSliceWindows(new Date(iso)),
    );
  });
});

describe("shiftDayKey", () => {
  it("зсуває ключ на календарні дні, перетинаючи місяць і рік", () => {
    expect(shiftDayKey("2026-09-14", 7)).toBe("2026-09-21");
    expect(shiftDayKey("2026-09-01", -1)).toBe("2026-08-31");
    expect(shiftDayKey("2026-12-28", 7)).toBe("2027-01-04");
  });

  it("не залежить від переходу на зимовий час", () => {
    expect(shiftDayKey("2026-10-25", 1)).toBe("2026-10-26");
    expect(shiftDayKey("2026-03-29", 1)).toBe("2026-03-30");
  });
});

describe("weekWindowByMondayKey", () => {
  it("тиждень — київські доби від понеділка до наступного понеділка (виключно)", () => {
    expect(weekWindowByMondayKey("2026-09-14")).toEqual({
      startMs: kyivDayStartMs("2026-09-14"),
      endMs: kyivDayStartMs("2026-09-21"),
    });
  });

  it("збігається з вікном weekSliceWindows у неділю того самого тижня", () => {
    // Неділя 2026-09-20: «цей тиждень до сьогодні» вже повний тиждень.
    const w = weekSliceWindows(new Date("2026-09-20T09:00:00Z"));
    expect(weekWindowByMondayKey("2026-09-14")).toEqual(w.current);
  });

  it("тиждень із переходом на зимовий час має 169 годин, а не 168", () => {
    const w = weekWindowByMondayKey("2026-10-19");
    expect(w.endMs - w.startMs).toBe(169 * 3_600_000);
    expect(w.endMs).toBe(kyivDayStartMs("2026-10-26"));
  });

  it("межі київські: транзакція 00:30 за Києвом у понеділок — уже в цьому тижні", () => {
    const w = weekWindowByMondayKey("2026-09-14");
    const mondayEarly = Date.parse("2026-09-13T21:30:00Z"); // пн 00:30 Київ
    const sundayLate = Date.parse("2026-09-20T20:59:00Z"); // нд 23:59 Київ
    const nextMonday = Date.parse("2026-09-20T21:00:00Z"); // пн 00:00 Київ
    expect(mondayEarly >= w.startMs && mondayEarly < w.endMs).toBe(true);
    expect(sundayLate >= w.startMs && sundayLate < w.endMs).toBe(true);
    expect(nextMonday >= w.endMs).toBe(true);
  });
});
