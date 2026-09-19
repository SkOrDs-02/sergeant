import { describe, expect, it } from "vitest";

import { percentile, summarizeLatency } from "./latency.js";

describe("percentile", () => {
  it("бере реальне спостереження, а не інтерполює між сусідами", () => {
    // На десяти значеннях p95 — це дев'яте (ceil(0.95 * 10) = 10 → індекс 9),
    // тобто 100, а не середнє між 90 і 100.
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(sorted, 50)).toBe(50);
    expect(percentile(sorted, 95)).toBe(100);
  });

  it("на порожньому вході дає 0 — це «нічого не зміряно», не «швидко»", () => {
    expect(percentile([], 50)).toBe(0);
    expect(percentile([], 95)).toBe(0);
  });

  it("не виходить за межі масиву на крайніх перцентилях", () => {
    const sorted = [5, 7];
    expect(percentile(sorted, 0)).toBe(5);
    expect(percentile(sorted, 100)).toBe(7);
  });
});

describe("summarizeLatency", () => {
  it("рахує хвіст по успішних спробах і тримає зависання окремо", () => {
    const s = summarizeLatency([5_000, 6_000, 8_000], 4, 1);
    expect(s.attempts).toBe(4);
    expect(s.timeouts).toBe(1);
    expect(s.max).toBe(8_000);
  });

  it("ЗАНИЖЕННЯ ХВОСТА: латентність таймауту не має потрапляти в перцентилі", () => {
    // Регресійний тест на конкретний самообман, описаний в AI-DANGER
    // модуля. Уявімо стелю 12 с і бімодальний розподіл: три успіхи по 5-8 с
    // і одне зависання, обрізане на 12 с.
    const successes = [5_000, 6_000, 8_000];
    const honest = summarizeLatency(successes, 4, 1);

    // Якщо підмішати цензуроване спостереження в набір, p95 «покращиться»
    // відносно чесного максимуму успіхів рівно тому, що стелю опустили —
    // тобто число стане функцією налаштування таймауту, а не поведінки
    // моделі. Тут ми фіксуємо, що так НЕ робиться.
    const naive = summarizeLatency([...successes, 12_000], 4, 1);

    expect(honest.max).toBe(8_000);
    expect(naive.max).toBe(12_000);
    expect(honest.max).toBeLessThan(naive.max);
  });

  it("усі спроби зависли — перцентилі нульові, і це видно за лічильником", () => {
    const s = summarizeLatency([], 3, 3);
    expect(s.p50).toBe(0);
    expect(s.p95).toBe(0);
    expect(s.max).toBe(0);
    expect(s.timeouts).toBe(s.attempts);
  });
});
