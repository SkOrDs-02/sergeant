// Межа місяця за Києвом на пристрої в іншому поясі (ADR-0078).
// TZ переставляється до першого `new Date(...)`: Node перечитує `process.env.TZ`
// на льоту, а модуль `overview.ts` дат при імпорті не створює.
process.env["TZ"] = "America/Los_Angeles";

import { isMainThread } from "node:worker_threads";

import { describe, expect, it } from "vitest";

import {
  aggregateMonthFlows,
  buildSubscriptionFlows,
  getNextBillingDate,
  type PlannedFlow,
} from "./overview.js";

// 30.09 15:30 у Лос-Анджелесі = 01.10 01:30 у Києві: host-local ще вересень,
// фінансовий період — уже жовтень.
const NOW = new Date("2026-09-30T22:30:00Z");

describe("overview × межа місяця за Києвом", () => {
  it("хост ще у вересні, а пристрій бачить київський день", () => {
    // Sanity: TZ справді не київський. Стандартний `vitest run` (forks) має
    // main thread, де запис `process.env.TZ` чинний. Stryker vitest-runner
    // примусово ганяє тести у worker-потоці (`pool: "threads"`), де зміна TZ
    // ігнорується і лишається `TZ=Europe/Kyiv` з `mutation:core`; там
    // перевіряємо фактичний стан, а решта тестів файлу лишаються як є
    // (UTC-30.09 vs Київ-01.10 усе одно відрізняє київську добу від UTC).
    expect(NOW.getMonth()).toBe(isMainThread ? 8 : 9);
  });

  it("getNextBillingDate: 30-те вже минуло за Києвом → наступний місяць", () => {
    const d = getNextBillingDate(30, NOW);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 30]);
  });

  it("buildSubscriptionFlows: billingDay=1 — «сьогодні», а не «завтра»", () => {
    const [flow] = buildSubscriptionFlows(
      [{ id: "s1", name: "Хмара", billingDay: 1 }],
      [],
      NOW,
    );
    expect(flow?.daysLeft).toBe(0);
  });

  it("aggregateMonthFlows: потік 15 жовтня входить у поточний (київський) місяць", () => {
    const flow: PlannedFlow = {
      id: "f",
      title: "Оренда",
      amount: 1000,
      sign: "-",
      color: "#ef4444",
      daysLeft: 14,
      hint: "через 14 дн",
      currency: "UAH",
      dueDate: new Date(2026, 9, 15),
    };
    const { monthFlows, recurringOutThisMonth } = aggregateMonthFlows(
      [flow],
      NOW,
    );
    expect(monthFlows).toHaveLength(1);
    expect(recurringOutThisMonth).toBe(1000);
  });
});
