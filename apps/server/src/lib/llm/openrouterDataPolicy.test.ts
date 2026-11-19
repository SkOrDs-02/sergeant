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
  initOpenRouterNoEndpointsSeries,
  openRouterNoEndpointsTotal,
} from "../../obs/metrics.js";
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
/** Дефолтний список постачальників, яких обходимо (рішення власника 2026-11-19). */
const IGN = ["baidu"];

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

const parseIgnore = (raw: string | undefined) =>
  z
    .object({
      OPENROUTER_IGNORE_PROVIDERS:
        aiRoutingEnvShape.OPENROUTER_IGNORE_PROVIDERS,
    })
    .parse(raw === undefined ? {} : { OPENROUTER_IGNORE_PROVIDERS: raw })
    .OPENROUTER_IGNORE_PROVIDERS;

describe("OPENROUTER_IGNORE_PROVIDERS (env)", () => {
  it("незадана → [baidu] (замір 2026-11-19: Baidu віддає порожні відповіді)", () => {
    expect(parseIgnore(undefined)).toEqual(["baidu"]);
  });

  it("порожнє значення вимикає список (відкат без релізу)", () => {
    expect(parseIgnore("")).toEqual([]);
    expect(parseIgnore("   ")).toEqual([]);
    expect(parseIgnore(" , ")).toEqual([]);
  });

  it("слаги через кому; регістр і пробіли нормалізуються, дублікати зникають", () => {
    expect(parseIgnore(" Baidu , relace,BAIDU ")).toEqual(["baidu", "relace"]);
    expect(parseIgnore("deepinfra/turbo,google-vertex/us-east5")).toEqual([
      "deepinfra/turbo",
      "google-vertex/us-east5",
    ]);
  });

  it("сміття валить старт", () => {
    expect(() => parseIgnore("baidu;relace")).toThrow();
    expect(() => parseIgnore("bai du")).toThrow();
    expect(() => parseIgnore("/baidu")).toThrow();
    expect(() => parseIgnore("baidu/")).toThrow();
    expect(() => parseIgnore('["baidu"]')).toThrow();
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
  it("дефолт (deny, fp8, [baidu]) → data_collection + quantizations + ignore, без zdr", () => {
    expect(openRouterProviderPrefs("deny", "fp8", IGN)).toEqual({
      data_collection: "deny",
      quantizations: Q8,
      ignore: IGN,
    });
  });

  it("відкат квантизації off → data_collection і ignore", () => {
    expect(openRouterProviderPrefs("deny", "off", IGN)).toEqual({
      data_collection: "deny",
      ignore: IGN,
    });
  });

  it("перемикачі незалежні: allow + fp8 → quantizations і ignore", () => {
    expect(openRouterProviderPrefs("allow", "fp8", IGN)).toEqual({
      quantizations: Q8,
      ignore: IGN,
    });
  });

  it("порожній список обходу → поля ignore немає", () => {
    expect(openRouterProviderPrefs("deny", "fp8", [])).toEqual({
      data_collection: "deny",
      quantizations: Q8,
    });
  });

  it("усі три відкати → поля provider немає взагалі (поведінка до 2026-11-19)", () => {
    expect(openRouterProviderPrefs("allow", "off", [])).toBeUndefined();
  });

  it("лише ignore лишився → provider несе тільки його", () => {
    expect(openRouterProviderPrefs("allow", "off", ["relace"])).toEqual({
      ignore: ["relace"],
    });
  });

  it("без аргументів читає env; незадані змінні → deny + fp8 + [baidu]", () => {
    expect(openRouterProviderPrefs()).toEqual({
      data_collection: "deny",
      quantizations: Q8,
      ignore: IGN,
    });
  });

  it("невідомі значення трактуються як deny і fp8, відсутній список як дефолт (fail-closed)", () => {
    expect(
      openRouterProviderPrefs(
        "whatever" as unknown as Parameters<typeof openRouterProviderPrefs>[0],
        "nope" as unknown as Parameters<typeof openRouterProviderPrefs>[1],
        undefined,
      ),
    ).toEqual({ data_collection: "deny", quantizations: Q8, ignore: IGN });
  });

  it("кожен виклик повертає свіжий обʼєкт і свіжі масиви (мутація не протікає)", () => {
    const list = ["baidu"];
    const a = openRouterProviderPrefs("deny", "fp8", list);
    const b = openRouterProviderPrefs("deny", "fp8", list);
    expect(a).not.toBe(b);
    expect(a?.quantizations).not.toBe(b?.quantizations);
    expect(a?.quantizations).not.toBe(OPENROUTER_MIN_8BIT_QUANTIZATIONS);
    expect(a?.ignore).not.toBe(list);
    expect(a?.ignore).not.toBe(b?.ignore);
  });
});

describe("openRouterZdrProviderPrefs", () => {
  it("zdr + deny незалежно від відкату даних, плюс квантизація й обхід за дефолтом", () => {
    expect(openRouterZdrProviderPrefs("fp8", IGN)).toEqual({
      zdr: true,
      data_collection: "deny",
      quantizations: Q8,
      ignore: IGN,
    });
  });

  it("відкат квантизації прибирає лише quantizations; порожній список — лише ignore", () => {
    expect(openRouterZdrProviderPrefs("off", IGN)).toEqual({
      zdr: true,
      data_collection: "deny",
      ignore: IGN,
    });
    expect(openRouterZdrProviderPrefs("fp8", [])).toEqual({
      zdr: true,
      data_collection: "deny",
      quantizations: Q8,
    });
  });
});

describe("withOpenRouterProviderPrefs", () => {
  it("deny + fp8 + [baidu] → додає provider, решту тіла не чіпає", () => {
    const body = { model: "m", max_tokens: 10 };
    expect(withOpenRouterProviderPrefs(body, "deny", "fp8", IGN)).toEqual({
      model: "m",
      max_tokens: 10,
      provider: { data_collection: "deny", quantizations: Q8, ignore: IGN },
    });
    expect(body).toEqual({ model: "m", max_tokens: 10 });
  });

  it("без аргументів режимів бере env (дефолт несе ignore: [baidu])", () => {
    expect(withOpenRouterProviderPrefs({ model: "m" })).toEqual({
      model: "m",
      provider: { data_collection: "deny", quantizations: Q8, ignore: IGN },
    });
  });

  it("allow + off + [] → тіло без змін (той самий обʼєкт)", () => {
    const body = { model: "m" };
    expect(withOpenRouterProviderPrefs(body, "allow", "off", [])).toBe(body);
  });

  it("наявні поля provider зберігаються, але data_collection перекрито", () => {
    const body = {
      model: "m",
      provider: { sort: "price", data_collection: "allow" },
    };
    expect(withOpenRouterProviderPrefs(body, "deny", "fp8", IGN)).toEqual({
      model: "m",
      provider: {
        sort: "price",
        data_collection: "deny",
        quantizations: Q8,
        ignore: IGN,
      },
    });
  });

  it("явні quantizations стенду перемагають обидва дефолтні списки", () => {
    const body = { model: "m", provider: { quantizations: ["fp4"] } };
    expect(withOpenRouterProviderPrefs(body, "deny", "fp8", IGN)).toEqual({
      model: "m",
      provider: { quantizations: ["fp4"], data_collection: "deny" },
    });
  });

  it("явний ignore стенду перемагає дефолтний ignore і знімає квантизації", () => {
    const body = { model: "m", provider: { ignore: ["relace"] } };
    expect(withOpenRouterProviderPrefs(body, "deny", "fp8", IGN)).toEqual({
      model: "m",
      provider: { ignore: ["relace"], data_collection: "deny" },
    });
  });

  it("порожній ignore стенду теж його вибір: Baidu не повертається", () => {
    const body = { model: "m", provider: { ignore: [] } };
    expect(withOpenRouterProviderPrefs(body, "deny", "fp8", IGN)).toEqual({
      model: "m",
      provider: { ignore: [], data_collection: "deny" },
    });
  });

  it("allow + fp8 при явних quantizations: provider лишається як у стенду", () => {
    const body = { model: "m", provider: { quantizations: ["fp4"] } };
    expect(withOpenRouterProviderPrefs(body, "allow", "fp8", IGN)).toEqual(
      body,
    );
  });
});

const NO_ENDPOINTS =
  "No endpoints found matching your data policy (Paid model training)";
/** Живий текст шлюзу 2026-11-19, коли `ignore` прибрав усіх постачальників. */
const NO_IGNORED =
  "All providers have been ignored. To change your default ignored providers, visit: https://openrouter.ai/settings/privacy";
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

  it("ignore прибрав усіх постачальників, обидві форми → ignored", () => {
    expect(
      openRouterNoEndpointsReason(404, { error: { message: NO_IGNORED } }),
    ).toBe("ignored");
    expect(
      openRouterNoEndpointsReason(404, {
        type: "error",
        error: { type: "not_found_error", message: NO_IGNORED },
      }),
    ).toBe("ignored");
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
      ignoredProviders: ["baidu"],
    });
    expect(JSON.stringify(entry)).not.toContain("No endpoints");
  });

  it("відмова через обхід постачальників: reason=ignored і список у лозі", () => {
    loggerMock.warn.mockClear();
    const hit = noteOpenRouterDataPolicyRejection({
      status: 404,
      data: { error: { message: NO_IGNORED } },
      model: "deepseek/deepseek-v4-flash",
      endpoint: "chat",
      transport: "chat_completions",
    });
    expect(hit).toBe(true);
    const entry = loggerMock.warn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entry).toMatchObject({
      reason: "ignored",
      ignoredProviders: ["baidu"],
    });
    expect(JSON.stringify(entry)).not.toContain("settings/privacy");
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

/**
 * Сигнал для алерту `OpenRouterNoEndpoints`: лог `openrouter_data_policy_no_endpoints`
 * до дашборда не доїжджає, а відмова означає, що пайплайн моделі не працює
 * зовсім. Лічильник із лейблами `reason` і `transport` (без моделі: модель
 * лишається в лозі, а серії з нею не можна завести нулем наперед).
 */
describe("openrouter_no_endpoints_total", () => {
  async function value(reason: string, transport: string): Promise<number> {
    const { values } = await openRouterNoEndpointsTotal.get();
    return (
      values.find(
        (v) => v.labels.reason === reason && v.labels.transport === transport,
      )?.value ?? Number.NaN
    );
  }

  it("усі шість серій існують нулем від старту процесу", async () => {
    // Без цього `increase(...[10m])` не бачить переходу «немає серії → 1»
    // і пропускає першу відмову (той самий урок, що й `reminder_sweep_runs_total`).
    openRouterNoEndpointsTotal.reset();
    initOpenRouterNoEndpointsSeries();
    for (const reason of ["data_policy", "quantization", "ignored"]) {
      for (const transport of ["messages", "chat_completions"]) {
        expect(await value(reason, transport)).toBe(0);
      }
    }
  });

  it("відмова шлюзу інкрементує серію своєї причини й транспорту", async () => {
    openRouterNoEndpointsTotal.reset();
    initOpenRouterNoEndpointsSeries();
    noteOpenRouterDataPolicyRejection({
      status: 404,
      data: { type: "error", error: { type: "x", message: NO_QUANT } },
      model: "z-ai/glm-5.2",
      endpoint: "chat",
      transport: "messages",
    });
    expect(await value("quantization", "messages")).toBe(1);
    expect(await value("quantization", "chat_completions")).toBe(0);
    expect(await value("data_policy", "messages")).toBe(0);
  });

  it("інша помилка лічильник не чіпає", async () => {
    openRouterNoEndpointsTotal.reset();
    initOpenRouterNoEndpointsSeries();
    noteOpenRouterDataPolicyRejection({
      status: 500,
      data: { error: { message: "boom" } },
      model: "m",
      endpoint: "e",
      transport: "chat_completions",
    });
    const { values } = await openRouterNoEndpointsTotal.get();
    expect(values.every((v) => v.value === 0)).toBe(true);
  });
});
