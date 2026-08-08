/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import { describe, it, expect } from "vitest";

import { isSameDeviceDay, planWellbeingHandoff } from "./wellbeingBridge";

const NOW = new Date(2026, 7, 8, 20, 30);

describe("isSameDeviceDay", () => {
  it("той самий календарний день пристрою — так", () => {
    expect(isSameDeviceDay(new Date(2026, 7, 8, 6, 0).toISOString(), NOW)).toBe(
      true,
    );
  });

  it("вчора — ні", () => {
    expect(
      isSameDeviceDay(new Date(2026, 7, 7, 23, 59).toISOString(), NOW),
    ).toBe(false);
  });

  it("порожнє й побите значення — ні, без винятку", () => {
    expect(isSameDeviceDay(null, NOW)).toBe(false);
    expect(isSameDeviceDay("не дата", NOW)).toBe(false);
  });
});

describe("planWellbeingHandoff", () => {
  it("нічого не оцінено — дописувати нічого", () => {
    expect(planWellbeingHandoff({}, [], NOW)).toBeNull();
    expect(
      planWellbeingHandoff({ energy: null, mood: null }, [], NOW),
    ).toBeNull();
  });

  it("порожній журнал — переносить обидві оцінки", () => {
    expect(planWellbeingHandoff({ energy: 4, mood: 5 }, [], NOW)).toEqual({
      energyLevel: 4,
      moodScore: 5,
    });
  });

  it("переносить лише те, що справді оцінили", () => {
    expect(planWellbeingHandoff({ energy: 3 }, [], NOW)).toEqual({
      energyLevel: 3,
    });
  });

  // Головний інваріант містка. Автоматичний дозапис вартий рівно
  // нічого, якщо ціною є затертий ручний ввід: людина, яка вранці
  // записала «енергія 2», увечері після тренування не має побачити,
  // що система переставила це на 4.
  it("НЕ переписує сьогоднішню оцінку, зроблену вручну", () => {
    const entries = [
      { at: new Date(2026, 7, 8, 8, 0).toISOString(), energyLevel: 2 },
    ];
    expect(
      planWellbeingHandoff({ energy: 4, mood: 5 }, entries, NOW),
    ).toBeNull();
  });

  it("вчорашня оцінка не блокує сьогоднішній перенос", () => {
    const entries = [
      { at: new Date(2026, 7, 7, 21, 0).toISOString(), energyLevel: 2 },
    ];
    expect(planWellbeingHandoff({ energy: 4 }, entries, NOW)).toEqual({
      energyLevel: 4,
    });
  });

  it("сьогоднішній запис БЕЗ оцінки (лише вага) переносу не блокує", () => {
    const entries = [
      { at: new Date(2026, 7, 8, 8, 0).toISOString(), weightKg: 78 },
    ];
    expect(planWellbeingHandoff({ mood: 5 }, entries, NOW)).toEqual({
      moodScore: 5,
    });
  });
});
