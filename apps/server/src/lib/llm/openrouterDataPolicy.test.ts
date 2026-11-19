/**
 * Юніт хелпера `provider`-преференцій OpenRouter і змінних відкату
 * `OPENROUTER_DATA_COLLECTION` та `OPENROUTER_QUANTIZATION_FLOOR` (рішення
 * власника 2026-11-19: кожен запит до шлюзу вимагає провайдерів, які не
 * зберігають дані користувача, і з квантизацією не нижче 8 біт).
 */
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

const loggerMock = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("../../obs/logger.js", () => ({ logger: loggerMock }));

import { aiRoutingEnvShape } from "../../env/aiRoutingEnv.js";
import {
  isOpenRouterDataPolicyRejection,
  noteOpenRouterDataPolicyRejection,
  OPENROUTER_MIN_8BIT_QUANTIZATIONS,
  openRouterNoEndpointsReason,
  openRouterProviderPrefs,
  openRouterZdrProviderPrefs,
  withOpenRouterProviderPrefs,
} from "./openrouterDataPolicy.js";

const Q8 = ["fp8", "mxfp8", "fp16", "bf16", "fp32", "unknown"];

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

const parseFloor = (raw: string | undefined) =>
  z
    .object({
      OPENROUTER_QUANTIZATION_FLOOR:
        aiRoutingEnvShape.OPENROUTER_QUANTIZATION_FLOOR,
    })
    .parse(raw === undefined ? {} : { OPENROUTER_QUANTIZATION_FLOOR: raw })
    .OPENROUTER_QUANTIZATION_FLOOR;

describe("OPENROUTER_QUANTIZATION_FLOOR (env)", () => {
  it("незадана або порожня → fp8", () => {
    expect(parseFloor(undefined)).toBe("fp8");
    expect(parseFloor("")).toBe("fp8");
    expect(parseFloor("  ")).toBe("fp8");
  });

  it("регістр і пробіли не важливі", () => {
    expect(parseFloor(" OFF ")).toBe("off");
    expect(parseFloor("FP8")).toBe("fp8");
  });

  it("будь-що поза переліком валить старт", () => {
    expect(() => parseFloor("fp4")).toThrow();
    expect(() => parseFloor("false")).toThrow();
  });
});

describe("OPENROUTER_MIN_8BIT_QUANTIZATIONS", () => {
  it("рівно рівні від 8 біт і `unknown` (без нього пропрієтарні моделі дають 404)", () => {
    expect([...OPENROUTER_MIN_8BIT_QUANTIZATIONS]).toEqual(Q8);
  });

  it("жодного 4- чи 6-бітного рівня", () => {
    for (const low of ["int4", "fp4", "mxfp4", "nvfp4", "fp6"]) {
      expect(OPENROUTER_MIN_8BIT_QUANTIZATIONS).not.toContain(low);
    }
  });
});

describe("openRouterProviderPrefs", () => {
  it("дефолт (deny, fp8) → data_collection: deny + quantizations, без zdr", () => {
    expect(openRouterProviderPrefs("deny", "fp8")).toEqual({
      data_collection: "deny",
      quantizations: Q8,
    });
  });

  it("відкат квантизації off → лише data_collection", () => {
    expect(openRouterProviderPrefs("deny", "off")).toEqual({
      data_collection: "deny",
    });
  });

  it("перемикачі незалежні: allow + fp8 → лише quantizations", () => {
    expect(openRouterProviderPrefs("allow", "fp8")).toEqual({
      quantizations: Q8,
    });
  });

  it("обидва відкати → поля provider немає взагалі (поведінка до 2026-11-19)", () => {
    expect(openRouterProviderPrefs("allow", "off")).toBeUndefined();
  });

  it("без аргументів читає env; незадані змінні → deny + fp8", () => {
    expect(openRouterProviderPrefs()).toEqual({
      data_collection: "deny",
      quantizations: Q8,
    });
  });

  it("невідомі значення трактуються як deny і fp8 (fail-closed)", () => {
    expect(
      openRouterProviderPrefs(
        "whatever" as unknown as Parameters<typeof openRouterProviderPrefs>[0],
        "nope" as unknown as Parameters<typeof openRouterProviderPrefs>[1],
      ),
    ).toEqual({ data_collection: "deny", quantizations: Q8 });
  });

  it("кожен виклик повертає свіжий обʼєкт і свіжий масив (мутація не протікає)", () => {
    const a = openRouterProviderPrefs("deny", "fp8");
    const b = openRouterProviderPrefs("deny", "fp8");
    expect(a).not.toBe(b);
    expect(a?.quantizations).not.toBe(b?.quantizations);
    expect(a?.quantizations).not.toBe(OPENROUTER_MIN_8BIT_QUANTIZATIONS);
  });
});

describe("openRouterZdrProviderPrefs", () => {
  it("zdr + deny незалежно від відкату даних, плюс квантизація за дефолтом", () => {
    expect(openRouterZdrProviderPrefs("fp8")).toEqual({
      zdr: true,
      data_collection: "deny",
      quantizations: Q8,
    });
  });

  it("відкат квантизації прибирає лише quantizations", () => {
    expect(openRouterZdrProviderPrefs("off")).toEqual({
      zdr: true,
      data_collection: "deny",
    });
  });
});

describe("withOpenRouterProviderPrefs", () => {
  it("deny + fp8 → додає provider, решту тіла не чіпає", () => {
    const body = { model: "m", max_tokens: 10 };
    expect(withOpenRouterProviderPrefs(body, "deny", "fp8")).toEqual({
      model: "m",
      max_tokens: 10,
      provider: { data_collection: "deny", quantizations: Q8 },
    });
    expect(body).toEqual({ model: "m", max_tokens: 10 });
  });

  it("allow + off → тіло без змін (той самий обʼєкт)", () => {
    const body = { model: "m" };
    expect(withOpenRouterProviderPrefs(body, "allow", "off")).toBe(body);
  });

  it("наявні поля provider зберігаються, але data_collection перекрито", () => {
    const body = {
      model: "m",
      provider: { sort: "price", data_collection: "allow" },
    };
    expect(withOpenRouterProviderPrefs(body, "deny", "fp8")).toEqual({
      model: "m",
      provider: { sort: "price", data_collection: "deny", quantizations: Q8 },
    });
  });

  it("явні quantizations стенду перемагають дефолтний список", () => {
    const body = { model: "m", provider: { quantizations: ["fp4"] } };
    expect(withOpenRouterProviderPrefs(body, "deny", "fp8")).toEqual({
      model: "m",
      provider: { quantizations: ["fp4"], data_collection: "deny" },
    });
  });

  it("явний ignore стенду теж знімає дефолтний список квантизацій", () => {
    const body = { model: "m", provider: { ignore: ["relace"] } };
    expect(withOpenRouterProviderPrefs(body, "deny", "fp8")).toEqual({
      model: "m",
      provider: { ignore: ["relace"], data_collection: "deny" },
    });
  });

  it("allow + fp8 при явних quantizations: provider лишається як у стенду", () => {
    const body = { model: "m", provider: { quantizations: ["fp4"] } };
    expect(withOpenRouterProviderPrefs(body, "allow", "fp8")).toEqual(body);
  });
});

const NO_ENDPOINTS =
  "No endpoints found matching your data policy (Paid model training)";
const NO_QUANT =
  "No endpoints found for the request with quantization: fp32. To learn more about provider routing, visit: https://openrouter.ai/docs/guides/routing/provider-selection";

describe("openRouterNoEndpointsReason", () => {
  it("політика даних → data_policy", () => {
    expect(
      openRouterNoEndpointsReason(404, { error: { message: NO_ENDPOINTS } }),
    ).toBe("data_policy");
  });

  it("квантизація, обидві форми транспортів → quantization", () => {
    expect(
      openRouterNoEndpointsReason(404, { error: { message: NO_QUANT } }),
    ).toBe("quantization");
    expect(
      openRouterNoEndpointsReason(404, {
        type: "error",
        error: { type: "not_found_error", message: NO_QUANT },
      }),
    ).toBe("quantization");
  });

  it("інший 404 або не-404 → undefined", () => {
    expect(
      openRouterNoEndpointsReason(404, {
        error: { message: "No endpoints found for foo/bar." },
      }),
    ).toBeUndefined();
    expect(
      openRouterNoEndpointsReason(400, { error: { message: NO_QUANT } }),
    ).toBeUndefined();
  });
});

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
      reason: "data_policy",
      model: "google/gemini-2.5-flash-lite",
      endpoint: "nutrition-analyze-photo",
      transport: "chat_completions",
      status: 404,
      dataCollection: "deny",
      quantizationFloor: "fp8",
    });
    expect(JSON.stringify(entry)).not.toContain("No endpoints");
  });

  it("відмова через квантизацію: той самий рядок із reason=quantization", () => {
    loggerMock.warn.mockClear();
    const hit = noteOpenRouterDataPolicyRejection({
      status: 404,
      data: {
        type: "error",
        error: { type: "not_found_error", message: NO_QUANT },
      },
      model: "z-ai/glm-5.2",
      endpoint: "chat",
      transport: "messages",
    });
    expect(hit).toBe(true);
    const entry = loggerMock.warn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entry).toMatchObject({
      msg: "openrouter_data_policy_no_endpoints",
      reason: "quantization",
      quantizationFloor: "fp8",
    });
    expect(JSON.stringify(entry)).not.toContain("No endpoints");
    expect(JSON.stringify(entry)).not.toContain("openrouter.ai/docs");
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
