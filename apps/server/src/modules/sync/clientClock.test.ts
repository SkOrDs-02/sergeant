import { describe, expect, it } from "vitest";
import {
  CLOCK_SKEW_FORWARD_MS,
  clockSkewRetry,
  createClientTsClamp,
  exceedsForwardSkew,
} from "./clientClock.js";

const NOW = Date.parse("2026-11-21T12:00:00.000Z");
const MIN = 60 * 1000;

describe("clientClock (data-51)", () => {
  it("допуск наперед — хвилини, а не година", () => {
    expect(CLOCK_SKEW_FORWARD_MS).toBeLessThanOrEqual(5 * MIN);
    expect(CLOCK_SKEW_FORWARD_MS).toBeGreaterThan(0);
  });

  it("exceedsForwardSkew: +50 хв поза допуском, +1 хв і минуле в межах", () => {
    expect(exceedsForwardSkew(new Date(NOW + 50 * MIN), NOW)).toBe(true);
    expect(
      exceedsForwardSkew(new Date(NOW + CLOCK_SKEW_FORWARD_MS + 1), NOW),
    ).toBe(true);
    expect(exceedsForwardSkew(new Date(NOW + CLOCK_SKEW_FORWARD_MS), NOW)).toBe(
      false,
    );
    expect(exceedsForwardSkew(new Date(NOW + MIN), NOW)).toBe(false);
    expect(exceedsForwardSkew(new Date(NOW - 50 * MIN), NOW)).toBe(false);
  });

  it("мітка в минулому лишається як є", () => {
    const clamp = createClientTsClamp();
    const past = new Date(NOW - 5_000);
    expect(clamp(past, NOW)).toBe(past);
    expect(clamp(new Date(NOW), NOW).getTime()).toBe(NOW);
  });

  it("мітка в майбутньому обрізається до server_now", () => {
    const clamp = createClientTsClamp();
    expect(clamp(new Date(NOW + 90_000), NOW).getTime()).toBe(NOW);
  });

  it("обрізані мітки одного пуша строго зростають (друга правка не програє першій)", () => {
    const clamp = createClientTsClamp();
    const a = clamp(new Date(NOW + 60_000), NOW).getTime();
    const b = clamp(new Date(NOW + 61_000), NOW).getTime();
    const c = clamp(new Date(NOW + 62_000), NOW).getTime();
    expect(a).toBe(NOW);
    expect(b).toBe(NOW + 1);
    expect(c).toBe(NOW + 2);
  });

  it("необрізана мітка теж рахується: insert (now) і update (now + 1 с) в одному пуші не зрівнюються", () => {
    const clamp = createClientTsClamp();
    expect(clamp(new Date(NOW), NOW).getTime()).toBe(NOW);
    expect(clamp(new Date(NOW + 1_000), NOW).getTime()).toBe(NOW + 1);
  });

  it("обрізана мітка ніколи не більша за власний client_ts", () => {
    const clamp = createClientTsClamp();
    clamp(new Date(NOW + 60_000), NOW);
    // Попередня обрізана = NOW; ця правка лише на 1 мс попереду сервера.
    expect(clamp(new Date(NOW + 1), NOW).getTime()).toBe(NOW + 1);
    // Ще одна з тією самою міткою вже не може піти вище за свій client_ts.
    expect(clamp(new Date(NOW + 1), NOW).getTime()).toBe(NOW + 1);
  });

  it("clockSkewRetry віддає retry / clock_skew", () => {
    expect(
      clockSkewRetry({ table: "routine_entries", idempotency_key: "k" }),
    ).toEqual({ idempotency_key: "k", status: "retry", reason: "clock_skew" });
  });
});
