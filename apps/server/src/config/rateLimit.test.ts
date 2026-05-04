import { describe, expect, it } from "vitest";
import {
  RATE_LIMIT_POLICIES,
  getRateLimitPolicy,
  policyOptions,
} from "./rateLimit.js";

/**
 * Юніт-тести реєстру policy. Перевіряємо тільки інваріанти реєстру
 * (типи, стабільність ключів, override-семантика). Bucket-логіка
 * лежить у `apps/server/src/http/rateLimit.test.ts`.
 */

describe("RATE_LIMIT_POLICIES — registry invariants", () => {
  it("кожна policy має description (не пуста рядок)", () => {
    for (const [name, policy] of Object.entries(RATE_LIMIT_POLICIES)) {
      expect(policy.description, `policy ${name} description`).toBeTruthy();
      expect(policy.description.trim().length).toBeGreaterThan(10);
    }
  });

  it("кожна policy має валідні limit/windowMs", () => {
    for (const [name, policy] of Object.entries(RATE_LIMIT_POLICIES)) {
      expect(policy.limit, `policy ${name} limit`).toBeGreaterThan(0);
      expect(policy.windowMs, `policy ${name} windowMs`).toBeGreaterThan(0);
      expect(Number.isInteger(policy.limit)).toBe(true);
      expect(Number.isInteger(policy.windowMs)).toBe(true);
    }
  });

  it("auth-related policy явно стоїть у fail-closed (security-sensitive)", () => {
    // Якщо хтось випадково перемикне `auth:sensitive` на open-mode,
    // тест ловить це до merge-у. Ціль — гарантія, що credential-flow
    // не амплифікується N×limit при degraded limiter.
    const p = RATE_LIMIT_POLICIES["api:auth:sensitive"];
    expect(p.failMode).toBe("closed");
  });
});

describe("getRateLimitPolicy", () => {
  it("повертає policy за валідним іменем", () => {
    const p = getRateLimitPolicy("api:auth:sensitive");
    expect(p.limit).toBe(20);
    expect(p.windowMs).toBe(60_000);
  });
});

describe("policyOptions", () => {
  it("вшиває name у `key` лейбл — детермінована метрика", () => {
    const opts = policyOptions("api:auth:sensitive");
    expect(opts.key).toBe("api:auth:sensitive");
  });

  it("успадковує limit/windowMs/failMode з реєстру", () => {
    const opts = policyOptions("api:auth:sensitive");
    expect(opts.limit).toBe(20);
    expect(opts.windowMs).toBe(60_000);
    expect(opts.failMode).toBe("closed");
  });

  it("override стирає тільки точно вказані поля", () => {
    const opts = policyOptions("api:auth:sensitive", { failMode: "open" });
    expect(opts.failMode).toBe("open");
    // limit/windowMs мають лишитися від реєстру.
    expect(opts.limit).toBe(20);
    expect(opts.windowMs).toBe(60_000);
  });

  it("override з cost-функцією додається до результату", () => {
    const cost = (): number => 5;
    const opts = policyOptions("api:auth:sensitive", { cost });
    expect(opts.cost).toBe(cost);
    expect(opts.failMode).toBe("closed");
  });
});
