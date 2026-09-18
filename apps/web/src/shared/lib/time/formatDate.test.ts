import { describe, it, expect } from "vitest";

import {
  KYIV_TIME_ZONE,
  formatDateFull,
  formatDateNumeric,
  formatDateShort,
  formatDateTimeShort,
  formatDayMonth,
  formatMonthYear,
  formatTimeHm,
} from "./formatDate";

// Фіксована дата: 13 вересня 2026, 11:30 UTC. Узята саме така, щоб у Києві
// (UTC+3 влітку) це був той самий день, але ІНША година — тож тест на
// часову зону справді щось перевіряє, а не збігається випадково.
const D = new Date("2026-09-13T11:30:00Z");

describe("formatDate — сім іменованих форматів", () => {
  it("formatDateShort дає «13 вер.», з роком — «13 вер. 2026»", () => {
    expect(formatDateShort(D, { timeZone: "UTC" })).toBe("13 вер.");
    // Локаль `uk-UA` сама дописує « р.» до року — так само, як у наявному
    // `formatKyivLongDate` («1 червня 2026 р.»). Не зрізаємо: це норма мови,
    // і зрізання розвело б цей модуль із рештою продукту.
    expect(formatDateShort(D, { timeZone: "UTC", withYear: true })).toBe(
      "13 вер. 2026 р.",
    );
  });

  it("formatDateFull дає повну словесну дату", () => {
    expect(formatDateFull(D, { timeZone: "UTC" })).toBe("13 вересня 2026 р.");
  });

  it("formatTimeHm дає час без секунд", () => {
    expect(formatTimeHm(D, { timeZone: "UTC" })).toBe("11:30");
  });

  it("formatMonthYear дає «вересень 2026», capitalize підіймає літеру", () => {
    expect(formatMonthYear(D, { timeZone: "UTC" })).toBe("вересень 2026 р.");
    expect(formatMonthYear(D, { timeZone: "UTC", capitalize: true })).toBe(
      "Вересень 2026 р.",
    );
  });

  it("formatDateNumeric дає цифрову дату з двоцифровими днем і місяцем", () => {
    expect(formatDateNumeric(D, { timeZone: "UTC" })).toBe("13.09.2026");
  });
});

describe("часова зона", () => {
  it("timeZone справді впливає — Київ і UTC дають різну годину", () => {
    const utc = formatTimeHm(D, { timeZone: "UTC" });
    const kyiv = formatTimeHm(D, { timeZone: KYIV_TIME_ZONE });
    expect(utc).toBe("11:30");
    expect(kyiv).toBe("14:30");
    expect(kyiv).not.toBe(utc);
  });

  it("без timeZone формат не падає (зона пристрою, ADR-0078)", () => {
    // Значення залежить від зони прогону, тому перевіряємо ФОРМУ, не текст:
    // дві цифри, крапка, дві цифри — тобто функція відпрацювала.
    expect(formatTimeHm(D)).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("граничні дати", () => {
  it("кінець місяця не з'їжджає на наступний", () => {
    const last = new Date("2026-01-31T12:00:00Z");
    expect(formatDateShort(last, { timeZone: "UTC" })).toBe("31 січ.");
  });

  it("1 січня дає правильний рік", () => {
    const ny = new Date("2027-01-01T00:00:00Z");
    expect(formatDateShort(ny, { timeZone: "UTC", withYear: true })).toBe(
      "1 січ. 2027 р.",
    );
    expect(formatMonthYear(ny, { timeZone: "UTC" })).toBe("січень 2027 р.");
  });

  it("29 лютого високосного року існує і форматується", () => {
    const leap = new Date("2028-02-29T12:00:00Z");
    expect(formatDateNumeric(leap, { timeZone: "UTC" })).toBe("29.02.2028");
  });
});

describe("невалідна дата", () => {
  it("усі пʼять форматів віддають порожній рядок, а не «Invalid Date»", () => {
    const bad = new Date("не дата");
    for (const fn of [
      formatDateShort,
      formatDateFull,
      formatTimeHm,
      formatMonthYear,
      formatDateNumeric,
    ]) {
      expect(fn(bad)).toBe("");
    }
  });
});

describe("formatDayMonth — словесна дата без року", () => {
  it("дає родовий відмінок місяця", () => {
    expect(formatDayMonth(D, { timeZone: KYIV_TIME_ZONE })).toBe("13 вересня");
  });

  it("родовий відмінок дає САМЕ число дня поруч", () => {
    // Без дня `month:"long"` віддає називний («вересень»), і саме тому
    // `MonthStrip` історично форматував фіктивне перше число й зрізав день
    // регуляркою. Тест фіксує властивість, заради якої функція існує.
    expect(formatDayMonth(D, { timeZone: KYIV_TIME_ZONE })).toContain(
      "вересня",
    );
  });

  it("порожній рядок на невалідній даті", () => {
    expect(formatDayMonth(new Date("нісенітниця"))).toBe("");
  });
});

describe("formatDateTimeShort — дата разом із часом", () => {
  it("ставить кому між датою й часом", () => {
    expect(formatDateTimeShort(D, { timeZone: KYIV_TIME_ZONE })).toBe(
      "13 вер., 14:30",
    );
  });

  it("НЕ дорівнює склейці двох форматів — заради цього й існує", () => {
    // Уся підстава додавати сьоме ім'я: `Intl` ставить розділювач, якого
    // конкатенація не дає. Якщо цей тест колись почне проходити для склейки,
    // функція втрачає сенс і її треба прибрати, а не лишати дублем.
    const glued =
      formatDateShort(D, { timeZone: KYIV_TIME_ZONE }) +
      " " +
      formatTimeHm(D, { timeZone: KYIV_TIME_ZONE });
    expect(glued).toBe("13 вер. 14:30");
    expect(formatDateTimeShort(D, { timeZone: KYIV_TIME_ZONE })).not.toBe(
      glued,
    );
  });

  it("withYear збігається з dateStyle:medium + timeStyle:short", () => {
    // Рівність, на якій тримається міграція `BankTransactionDetailsSheet`:
    // якщо вона зламається, видимий текст там тихо зміниться.
    const legacy = new Intl.DateTimeFormat("uk-UA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: KYIV_TIME_ZONE,
    }).format(D);
    expect(
      formatDateTimeShort(D, { withYear: true, timeZone: KYIV_TIME_ZONE }),
    ).toBe(legacy);
  });

  it("порожній рядок на невалідній даті", () => {
    expect(formatDateTimeShort(new Date("нісенітниця"))).toBe("");
  });
});
