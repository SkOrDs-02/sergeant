/**
 * Юніт хелпера `provider`-преференцій OpenRouter і змінної відкату
 * `OPENROUTER_DATA_COLLECTION` (рішення власника 2026-11-19: кожен запит до
 * шлюзу вимагає провайдерів, які не зберігають дані користувача).
 */
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

const loggerMock = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("../../obs/logger.js", () => ({ logger: loggerMock }));

import { aiRoutingEnvShape } from "../../env/aiRoutingEnv.js";
import {
  isOpenRouterDataPolicyRejection,
  noteOpenRouterDataPolicyRejection,
  openRouterProviderPrefs,
  openRouterZdrProviderPrefs,
  withOpenRouterProviderPrefs,
} from "./openrouterDataPolicy.js";

const parseMode = (raw: string | undefined) =>
  z
    .object({
      OPENROUTER_DATA_COLLECTION: aiRoutingEnvShape.OPENROUTER_DATA_COLLECTION,
    })
    .parse(raw === undefined ? {} : { OPENROUTER_DATA_COLLECTION: raw })
    .OPENROUTER_DATA_COLLECTION;

describe("OPENROUTER_DATA_COLLECTION (env)", () => {
  it("незадана або порожня → deny", () => {
    expect(parseMode(undefined)).toBe("deny");
    expect(parseMode("")).toBe("deny");
    expect(parseMode("   ")).toBe("deny");
  });

  it("регістр і пробіли не важливі", () => {
    expect(parseMode(" ALLOW ")).toBe("allow");
    expect(parseMode("Deny")).toBe("deny");
  });

  it("будь-що поза переліком валить старт", () => {
    expect(() => parseMode("off")).toThrow();
    expect(() => parseMode("zdr")).toThrow();
  });
});

describe("openRouterProviderPrefs", () => {
  it("дефолт (deny) → data_collection: deny, без zdr", () => {
    expect(openRouterProviderPrefs("deny")).toEqual({
      data_collection: "deny",
    });
  });

  it("відкат allow → поля provider немає взагалі (поведінка до 2026-11-19)", () => {
    expect(openRouterProviderPrefs("allow")).toBeUndefined();
  });

  it("без аргументу читає env; незадана змінна → deny", () => {
    expect(openRouterProviderPrefs()).toEqual({ data_collection: "deny" });
  });

  it("невідоме значення трактується як deny (fail-closed)", () => {
    expect(
      openRouterProviderPrefs(
        "whatever" as unknown as Parameters<typeof openRouterProviderPrefs>[0],
      ),
    ).toEqual({ data_collection: "deny" });
  });

  it("кожен виклик повертає свіжий обʼєкт (мутація не протікає)", () => {
    const a = openRouterProviderPrefs("deny");
    const b = openRouterProviderPrefs("deny");
    expect(a).not.toBe(b);
  });
});

describe("openRouterZdrProviderPrefs", () => {
  it("завжди zdr + deny, незалежно від відкату", () => {
    expect(openRouterZdrProviderPrefs()).toEqual({
      zdr: true,
      data_collection: "deny",
    });
  });
});

describe("withOpenRouterProviderPrefs", () => {
  it("deny → додає provider, решту тіла не чіпає", () => {
    const body = { model: "m", max_tokens: 10 };
    expect(withOpenRouterProviderPrefs(body, "deny")).toEqual({
      model: "m",
      max_tokens: 10,
      provider: { data_collection: "deny" },
    });
    expect(body).toEqual({ model: "m", max_tokens: 10 });
  });

  it("allow → тіло без змін (той самий обʼєкт)", () => {
    const body = { model: "m" };
    expect(withOpenRouterProviderPrefs(body, "allow")).toBe(body);
  });

  it("наявні поля provider зберігаються, але data_collection перекрито", () => {
    const body = {
      model: "m",
      provider: { sort: "price", data_collection: "allow" },
    };
    expect(withOpenRouterProviderPrefs(body, "deny")).toEqual({
      model: "m",
      provider: { sort: "price", data_collection: "deny" },
    });
  });
});

const NO_ENDPOINTS =
  "No endpoints found matching your data policy (Paid model training)";

describe("isOpenRouterDataPolicyRejection", () => {
  it("форма /chat/completions: { error: { message } }", () => {
    expect(
      isOpenRouterDataPolicyRejection(404, {
        error: { message: NO_ENDPOINTS, code: 404 },
      }),
    ).toBe(true);
  });

  it("форма /messages: { type: error, error: { type: not_found_error, message } }", () => {
    expect(
      isOpenRouterDataPolicyRejection(404, {
        type: "error",
        error: { type: "not_found_error", message: NO_ENDPOINTS },
      }),
    ).toBe(true);
  });

  it("інший 404 (невідома модель) — не ця причина", () => {
    expect(
      isOpenRouterDataPolicyRejection(404, {
        error: { message: "No endpoints found for foo/bar." },
      }),
    ).toBe(false);
  });

  it("не-404 або порожнє тіло — false", () => {
    expect(
      isOpenRouterDataPolicyRejection(400, {
        error: { message: NO_ENDPOINTS },
      }),
    ).toBe(false);
    expect(isOpenRouterDataPolicyRejection(404, null)).toBe(false);
    expect(isOpenRouterDataPolicyRejection(404, "text")).toBe(false);
  });
});

describe("noteOpenRouterDataPolicyRejection", () => {
  it("пише warn із моделлю й ендпоінтом, без тексту відповіді й запиту", () => {
    loggerMock.warn.mockClear();
    const hit = noteOpenRouterDataPolicyRejection({
      status: 404,
      data: { error: { message: NO_ENDPOINTS } },
      model: "google/gemini-2.5-flash-lite",
      endpoint: "nutrition-analyze-photo",
      transport: "chat_completions",
    });
    expect(hit).toBe(true);
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    const entry = loggerMock.warn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entry).toEqual({
      msg: "openrouter_data_policy_no_endpoints",
      model: "google/gemini-2.5-flash-lite",
      endpoint: "nutrition-analyze-photo",
      transport: "chat_completions",
      status: 404,
      dataCollection: "deny",
    });
    expect(JSON.stringify(entry)).not.toContain("No endpoints");
  });

  it("інша помилка — нічого не логує", () => {
    loggerMock.warn.mockClear();
    expect(
      noteOpenRouterDataPolicyRejection({
        status: 500,
        data: { error: { message: "boom" } },
        model: "m",
        endpoint: "e",
        transport: "messages",
      }),
    ).toBe(false);
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });
});
