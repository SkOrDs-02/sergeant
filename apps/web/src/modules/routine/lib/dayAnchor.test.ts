import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ROUTINE_DAY_ANCHOR,
  anchoredTodayDate,
  anchoredTodayKey,
} from "./dayAnchor";
import { todayDate } from "../RoutineApp.helpers";

/**
 * Cutover 2026-09-01 (LOG-3, продуктовий аудит): `day_anchor` перемкнуто
 * `kyiv` → `device-local` за ADR-0078. Ці тести пінять і саму мітку, і те,
 * що всі точки входу routine рахують «сьогодні» через неї, і додатково
 * доводять, що ключ ТЕПЕР рахується за годинником ПРИСТРОЮ, а не Києва —
 * регресія на це саме і була LOG-3 (браузер `America/Los_Angeles`,
 * 2026-09-01 23:30 місцевого показував «середу, 2 вересня» замість
 * місцевого «вівторка, 1 вересня»).
 *
 * Vitest пінить `TZ=UTC` (`apps/web/vitest.config.js`), тож «пристрій» тут
 * за замовчуванням UTC. Тест не-київського пристрою нижче тимчасово підмінює
 * `process.env.TZ` на `America/Los_Angeles` — Node перечитує `TZ` при
 * кожному виклику геттерів локального часу, тож зміна діє одразу без
 * перезапуску процесу.
 */
afterEach(() => {
  vi.useRealTimers();
});

describe("ROUTINE_DAY_ANCHOR", () => {
  it("описує анкер, яким РЕАЛЬНО порахований ключ (з 2026-09-01 — device-local)", () => {
    expect(ROUTINE_DAY_ANCHOR).toBe("device-local");
  });

  it("належить словнику колонки day_anchor", () => {
    expect(["device-local", "kyiv", "unknown"]).toContain(ROUTINE_DAY_ANCHOR);
  });
});

describe("anchoredTodayKey — device-local (ADR-0078)", () => {
  it("на пристрої з TZ=UTC пізній вечір лишається ТИМ САМИМ днем ПРИСТРОЮ, навіть якщо в Києві вже наступна доба", () => {
    vi.useFakeTimers();
    // 23:53 UTC 23-го числа = 02:53 24-го за Києвом (+03:00). Старий
    // Kyiv-анкер тут повертав би "2026-08-24" (саме та поведінка, яку
    // пінив цей тест до cutover-у); device-local коректно лишається на
    // "2026-08-23" — пристрій (TZ=UTC) ще не перейшов північ.
    vi.setSystemTime(new Date("2026-08-23T23:53:00.000Z"));

    expect(anchoredTodayKey()).toBe("2026-08-23");
    expect(ROUTINE_DAY_ANCHOR).toBe("device-local");
  });

  it("anchoredTodayDate тримає локальний полудень, щоб зріз дня не плив", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T23:53:00.000Z"));

    const d = anchoredTodayDate();
    expect(d.getHours()).toBe(12);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(23);
  });

  it("RoutineApp.helpers.todayDate ходить через той самий анкер", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T23:53:00.000Z"));

    expect(todayDate().getTime()).toBe(anchoredTodayDate().getTime());
  });

  describe("пристрій поза Kyiv (America/Los_Angeles) — регресія LOG-3", () => {
    const originalTz = process.env["TZ"];

    afterEach(() => {
      process.env["TZ"] = originalTz;
    });

    it("23:30 місцевого (= 09:30 наступного дня в Києві) лишається СЬОГОДНІШНІМ ключем пристрою, не завтрашнім київським", () => {
      process.env["TZ"] = "America/Los_Angeles";
      vi.useFakeTimers();
      // 2026-09-01T23:30:00 America/Los_Angeles (PDT, UTC-7) =
      // 2026-09-02T06:30:00Z = 2026-09-02T09:30:00 Europe/Kyiv (+03:00).
      // Точнісінько репро LOG-3: Київ уже 2-го числа, пристрій ще 1-го.
      vi.setSystemTime(new Date("2026-09-02T06:30:00.000Z"));

      expect(anchoredTodayKey()).toBe("2026-09-01");
    });

    it("північ пристрою (не Kyiv) рухає ключ на наступний день", () => {
      process.env["TZ"] = "America/Los_Angeles";
      vi.useFakeTimers();
      // 2026-09-01T23:59:30 America/Los_Angeles → ще 1-ше число пристрою.
      vi.setSystemTime(new Date("2026-09-02T06:59:30.000Z"));
      expect(anchoredTodayKey()).toBe("2026-09-01");

      // +1 хвилина → 2026-09-02T00:00:30 America/Los_Angeles → пристрій
      // перекотився на 2-ге, хоча в Києві вже давно ранок 2-го й був ще ДО
      // цього моменту — тобто межа ключа належить пристрою, не Києву.
      vi.setSystemTime(new Date("2026-09-02T07:00:30.000Z"));
      expect(anchoredTodayKey()).toBe("2026-09-02");
    });
  });
});
