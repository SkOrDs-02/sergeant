import { describe, expect, it } from "vitest";
import {
  AUTH_ACCOUNT_RATE_LIMIT,
  AUTH_SENSITIVE_RATE_LIMIT,
} from "./rateLimit.js";

/**
 * Юніт-тести auth rate-limit option-обʼєктів. Bucket-логіка лежить у
 * `apps/server/src/http/rateLimit.test.ts`.
 */

describe("AUTH_SENSITIVE_RATE_LIMIT", () => {
  it("вшиває стабільний key-лейбл для rate_limit_hits_total", () => {
    expect(AUTH_SENSITIVE_RATE_LIMIT.key).toBe("api:auth:sensitive");
  });

  it("має валідні limit/windowMs — PR-48 round-2 (OWASP ASVS V11.1.3)", () => {
    expect(AUTH_SENSITIVE_RATE_LIMIT.limit).toBe(5);
    expect(AUTH_SENSITIVE_RATE_LIMIT.windowMs).toBe(60_000);
  });

  it("стоїть у fail-closed (security-sensitive credential flow)", () => {
    expect(AUTH_SENSITIVE_RATE_LIMIT.failMode).toBe("closed");
  });
});

describe("AUTH_ACCOUNT_RATE_LIMIT", () => {
  it("вшиває стабільний key-лейбл для rate_limit_hits_total", () => {
    expect(AUTH_ACCOUNT_RATE_LIMIT.key).toBe("api:auth:account");
  });

  it("має валідні limit/windowMs — softer than the IP bucket (10/15min)", () => {
    expect(AUTH_ACCOUNT_RATE_LIMIT.limit).toBe(10);
    expect(AUTH_ACCOUNT_RATE_LIMIT.windowMs).toBe(900_000);
  });

  it("стоїть у fail-closed", () => {
    expect(AUTH_ACCOUNT_RATE_LIMIT.failMode).toBe("closed");
  });
});
