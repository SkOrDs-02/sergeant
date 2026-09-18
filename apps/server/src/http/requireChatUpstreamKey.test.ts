/**
 * B48 — чат вимагав креденшел, якого не використовує.
 *
 * `requireAnthropicKey()` віддавав 503 `ANTHROPIC_KEY_MISSING`, коли
 * `ANTHROPIC_API_KEY` порожній — навіть у дефолтній конфігурації
 * (`CHAT_VIA_OPENROUTER=true` + ключ шлюзу), де `pickTransport()` іде на
 * `OPENROUTER_URL` з `Bearer ${OPENROUTER_API_KEY}` і переданий Anthropic-ключ
 * ігнорує повністю. Фолбеку в сирому транспорті немає — `FallbackProvider`
 * живе в іншому шарі, яким чат не користується.
 *
 * Тобто ротація Anthropic-ключа гасила чат, який на Anthropic не ходить.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

async function loadGuard() {
  vi.resetModules();
  return (await import("./requireAnthropicKey.js")).requireChatUpstreamKey;
}

beforeEach(() => {
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("requireChatUpstreamKey", () => {
  it("пропускає під шлюзом навіть без Anthropic-ключа", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    vi.stubEnv("CHAT_VIA_OPENROUTER", "true");

    const guard = (await loadGuard())();
    const next = vi.fn();
    const res = makeRes();
    guard({} as Request, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
  });

  it("вимагає Anthropic-ключ, коли шлюз вимкнено явно", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    vi.stubEnv("CHAT_VIA_OPENROUTER", "false");

    const guard = (await loadGuard())();
    const next = vi.fn();
    const res = makeRes();
    guard({} as Request, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ code: "ANTHROPIC_KEY_MISSING" });
  });

  it("вимагає Anthropic-ключ, коли ключа шлюзу немає (шлюз сам вимикається)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("CHAT_VIA_OPENROUTER", "true");

    const guard = (await loadGuard())();
    const next = vi.fn();
    const res = makeRes();
    guard({} as Request, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
  });

  it("не світить назву env-змінної клієнту", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("CHAT_VIA_OPENROUTER", "false");

    const guard = (await loadGuard())();
    const res = makeRes();
    guard({} as Request, res, vi.fn());

    expect(JSON.stringify(res.body)).not.toContain("ANTHROPIC_API_KEY");
  });
});
