import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../../auth.js", () => ({ getSessionUser: vi.fn() }));
vi.mock("../../db.js", () => {
  const pool = { connect: vi.fn(), query: vi.fn() };
  return { default: pool, pool };
});
vi.mock("../billing/getUserPlan.js", () => ({ getUserPlan: vi.fn() }));
vi.mock("../../obs/anthropicBudgetGuard.js", () => ({
  isAnthropicBudgetHardExceeded: vi.fn(() => false),
}));

import { getSessionUser as _getSessionUser } from "../../auth.js";
import _pool from "../../db.js";
import { getUserPlan as _getUserPlan } from "../billing/getUserPlan.js";
import { isAnthropicBudgetHardExceeded as _isHardExceeded } from "../../obs/anthropicBudgetGuard.js";
import { resolveProTier } from "./aiQuota.js";
import { aiQuotaCircuitBreaker } from "./aiQuotaCircuitBreaker.js";

const getSessionUser = _getSessionUser as unknown as ReturnType<typeof vi.fn>;
const getUserPlan = _getUserPlan as unknown as ReturnType<typeof vi.fn>;
const isHardExceeded = _isHardExceeded as unknown as ReturnType<typeof vi.fn>;
const pool = _pool as unknown as { query: ReturnType<typeof vi.fn> };

function makeReq(): Request {
  return {
    headers: {},
    socket: { remoteAddress: "1.2.3.4" },
  } as unknown as Request;
}
function makeRes(): Response & { headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader(n: string, v: string) {
      headers[n] = v;
    },
  } as unknown as Response & { headers: Record<string, string> };
}

/** A consumeQuota UPSERT that succeeded (row returned). */
const ok = (count = 1) => ({ rows: [{ request_count: count }] });
/** A consumeQuota UPSERT that was gated (no row → bucket full). */
const full = () => ({ rows: [] });

const ENV = [
  "AI_TIERED_PRO_ENABLED",
  "AI_QUOTA_DISABLED",
  "AI_QUOTA_FOUNDER_IDS",
  "AI_PRO_PREMIUM_DAILY_LIMIT",
  "AI_PRO_STANDARD_DAILY_LIMIT",
  "DATABASE_URL",
  "CHAT_MODEL_SYNTHESIS",
  "AI_PRO_STANDARD_CHAT_MODEL",
  "AI_PRO_FLOOR_CHAT_MODEL",
  "CHAT_VIA_OPENROUTER",
  "OPENROUTER_API_KEY",
  "OPENROUTER_COACH_MODEL",
  "ANTHROPIC_BUDGET_HARD_DEGRADE_ALL",
  "AI_FREE_ON_PREMIUM",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  vi.clearAllMocks();
  aiQuotaCircuitBreaker.reset();
  process.env["AI_TIERED_PRO_ENABLED"] = "true";
  process.env["DATABASE_URL"] = "postgres://x";
  delete process.env["AI_QUOTA_DISABLED"];
  delete process.env["AI_QUOTA_FOUNDER_IDS"];
  delete process.env["CHAT_MODEL_SYNTHESIS"];
  delete process.env["AI_PRO_STANDARD_CHAT_MODEL"];
  delete process.env["AI_PRO_FLOOR_CHAT_MODEL"];
  delete process.env["CHAT_VIA_OPENROUTER"];
  delete process.env["OPENROUTER_API_KEY"];
  delete process.env["OPENROUTER_COACH_MODEL"];
  delete process.env["ANTHROPIC_BUDGET_HARD_DEGRADE_ALL"];
  delete process.env["AI_FREE_ON_PREMIUM"];
  isHardExceeded.mockReturnValue(false);
  getSessionUser.mockResolvedValue({ id: "u1" });
  getUserPlan.mockResolvedValue({ plan: "pro" });
});
afterEach(() => {
  aiQuotaCircuitBreaker.reset();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("resolveProTier — AI_TIERED_PRO_ENABLED default (unset env)", () => {
  it("unset AI_TIERED_PRO_ENABLED defaults to ON (matches env.ts boolFromEnv(true))", async () => {
    delete process.env["AI_TIERED_PRO_ENABLED"];
    pool.query.mockResolvedValueOnce(full()).mockResolvedValueOnce(full());
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    // Flag defaulting OFF would short-circuit to premium without any DB
    // roundtrip; defaulting ON runs the cascade, which — with both buckets
    // exhausted — degrades to floor.
    expect(r.tier).toBe("floor");
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("empty-string AI_TIERED_PRO_ENABLED also defaults to ON", async () => {
    process.env["AI_TIERED_PRO_ENABLED"] = "";
    pool.query.mockResolvedValueOnce(ok(1));
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("premium");
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('explicit "0" disables tiering (no DB roundtrip)', async () => {
    process.env["AI_TIERED_PRO_ENABLED"] = "0";
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("premium");
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe("resolveProTier — bypass paths return premium without touching DB", () => {
  it("flag off → premium, no DB roundtrip", async () => {
    process.env["AI_TIERED_PRO_ENABLED"] = "false";
    const res = makeRes();
    const r = await resolveProTier(makeReq(), res, "chat");
    expect(r.tier).toBe("premium");
    expect(r.model).toBe("claude-sonnet-4-6");
    expect(pool.query).not.toHaveBeenCalled();
    expect(res.headers["X-AI-Tier"]).toBe("premium");
  });

  it("AI_QUOTA_DISABLED → premium", async () => {
    process.env["AI_QUOTA_DISABLED"] = "1";
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("premium");
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("anonymous (no session) → standard, не premium", async () => {
    getSessionUser.mockResolvedValue(null);
    const res = makeRes();
    const r = await resolveProTier(makeReq(), res, "chat");
    expect(r.tier).toBe("standard");
    expect(r.model).toBe("claude-haiku-4-5-20251001");
    expect(res.headers["X-AI-Tier"]).toBe("standard");
    // Квота анона рахується `assertAiQuota`, не цим каскадом.
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("founder → premium, no plan lookup", async () => {
    process.env["AI_QUOTA_FOUNDER_IDS"] = "u1,u2";
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("premium");
    expect(getUserPlan).not.toHaveBeenCalled();
  });

  it("free plan → standard (кількість капає assertAiQuota, модель — не premium)", async () => {
    getUserPlan.mockResolvedValue({ plan: "free" });
    const res = makeRes();
    const r = await resolveProTier(makeReq(), res, "chat");
    expect(r.tier).toBe("standard");
    expect(r.model).toBe("claude-haiku-4-5-20251001");
    expect(res.headers["X-AI-Tier"]).toBe("standard");
    expect(pool.query).not.toHaveBeenCalled();
  });

  // Інверсія, заради якої зроблено зміну: Pro на 21-му повідомленні доби вже
  // на standard. Якби Free лишався premium, неплатник мав би кращу модель за
  // платника. Тест фіксує рівно це співвідношення, а не конкретний id моделі.
  it("Free не отримує кращої моделі за Pro, що вичерпав premium-відро", async () => {
    getUserPlan.mockResolvedValueOnce({ plan: "free" });
    const freeTier = await resolveProTier(makeReq(), makeRes(), "chat");

    getUserPlan.mockResolvedValue({ plan: "pro" });
    pool.query.mockResolvedValueOnce(full()).mockResolvedValueOnce(ok());
    const drainedPro = await resolveProTier(makeReq(), makeRes(), "chat");

    expect(drainedPro.tier).toBe("standard");
    expect(freeTier.model).toBe(drainedPro.model);
  });

  it("AI_FREE_ON_PREMIUM=true повертає стару поведінку (kill-switch)", async () => {
    process.env["AI_FREE_ON_PREMIUM"] = "true";
    getUserPlan.mockResolvedValue({ plan: "free" });
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("premium");
    expect(r.model).toBe("claude-sonnet-4-6");
  });

  it("kill-switch діє і на анона", async () => {
    process.env["AI_FREE_ON_PREMIUM"] = "1";
    getSessionUser.mockResolvedValue(null);
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("premium");
  });

  it("fail-open (plan lookup впав) лишається premium, не standard", async () => {
    getUserPlan.mockRejectedValue(new Error("db down"));
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("premium");
  });

  // Деградація неоплаченого трафіку стосується ЛИШЕ чату. У коуча розрив
  // premium→standard це Sonnet → gemini-lite: найбільша втрата якості за
  // найменшу економію, а сам ендпоінт не має plan-gate, тож Free бачить
  // його на дашборді щодня.
  it("free на коучі лишається premium (Sonnet), на відміну від чату", async () => {
    getUserPlan.mockResolvedValue({ plan: "free" });
    const res = makeRes();
    const r = await resolveProTier(makeReq(), res, "coach");
    expect(r.tier).toBe("premium");
    expect(r.model).toBe("anthropic/claude-sonnet-4.6");
    expect(res.headers["X-AI-Tier"]).toBe("premium");
  });

  it("анон на коучі теж лишається premium", async () => {
    getSessionUser.mockResolvedValue(null);
    const r = await resolveProTier(makeReq(), makeRes(), "coach");
    expect(r.tier).toBe("premium");
    expect(r.model).toBe("anthropic/claude-sonnet-4.6");
  });

  it("Pro-каскад на коучі не зачеплено: вичерпаний premium → standard", async () => {
    pool.query.mockResolvedValueOnce(full()).mockResolvedValueOnce(ok());
    const r = await resolveProTier(makeReq(), makeRes(), "coach");
    expect(r.tier).toBe("standard");
    // Пін оновлено 2026-08-26 разом зі зміною дефолту (рішення власника,
    // ADR-0087): `2.5-flash-lite` → `3.5-flash-lite`, 8/8 на коуч-стенді
    // проти нуля порушень голосу. Пін лишається жорстким навмисно — це
    // прод-модель, її зміна має вимагати свідомої правки тесту.
    expect(r.model).toBe("google/gemini-3.5-flash-lite");
  });
});

describe("resolveProTier — Pro cascade premium → standard → floor", () => {
  it("premium bucket has room → premium tier (chat = Sonnet)", async () => {
    pool.query.mockResolvedValueOnce(ok(1));
    const res = makeRes();
    const r = await resolveProTier(makeReq(), res, "chat");
    expect(r.tier).toBe("premium");
    expect(r.model).toBe("claude-sonnet-4-6");
    expect(res.headers["X-AI-Tier"]).toBe("premium");
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("premium exhausted, standard has room → standard tier (Haiku 4.5)", async () => {
    pool.query.mockResolvedValueOnce(full()).mockResolvedValueOnce(ok(1));
    const res = makeRes();
    const r = await resolveProTier(makeReq(), res, "chat");
    expect(r.tier).toBe("standard");
    expect(r.model).toBe("claude-haiku-4-5-20251001");
    expect(res.headers["X-AI-Tier"]).toBe("standard");
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("both buckets exhausted → floor tier (Haiku 4.5, deduped with standard), never blocks", async () => {
    pool.query.mockResolvedValueOnce(full()).mockResolvedValueOnce(full());
    const res = makeRes();
    const r = await resolveProTier(makeReq(), res, "chat");
    expect(r.tier).toBe("floor");
    // Floor shares the model with standard (Haiku 4.5) after the retired
    // claude-3-haiku-20240307 default was replaced. The tier label still
    // differs — floor is a distinct bucket with its own daily budget.
    expect(r.model).toBe("claude-haiku-4-5-20251001");
    expect(res.headers["X-AI-Tier"]).toBe("floor");
  });

  it("coach endpoint premium → Sonnet через OpenRouter", async () => {
    pool.query.mockResolvedValueOnce(ok(1));
    const r = await resolveProTier(makeReq(), makeRes(), "coach");
    expect(r.tier).toBe("premium");
    expect(r.model).toBe("anthropic/claude-sonnet-4.6");
  });

  /**
   * Тут стояв `openai/gpt-5.1`, і за замірами проду він майже не працював:
   * із десяти викликів коуча девʼять обслуговував anthropic-фолбек із
   * `claude-sonnet-4-6`, бо reasoning-модель не встигала у 20-секундний
   * таймаут `coach.ts`. Ставимо ту саму модель, що й так відповідала,
   * тільки через шлюз — щоб шлях був один і вартість була видна в одному
   * місці. Id саме `anthropic/`-префіксований: голий `claude-sonnet-4-6`
   * валідний для прямого Anthropic і НЕ валідний для OpenRouter.
   */
  it("id коуча — з OpenRouter-простору імен, не з Anthropic-івського", async () => {
    pool.query.mockResolvedValueOnce(ok(1));
    const r = await resolveProTier(makeReq(), makeRes(), "coach");
    expect(r.model.startsWith("anthropic/")).toBe(true);
    expect(r.model).not.toBe("claude-sonnet-4-6");
  });

  it("OPENROUTER_COACH_MODEL перекриває дефолт", async () => {
    process.env["OPENROUTER_COACH_MODEL"] = "anthropic/claude-sonnet-5";
    pool.query.mockResolvedValueOnce(ok(1));
    const r = await resolveProTier(makeReq(), makeRes(), "coach");
    expect(r.model).toBe("anthropic/claude-sonnet-5");
  });

  it("coach floor → reliable cheap OpenRouter model (gemini-flash-lite)", async () => {
    pool.query.mockResolvedValueOnce(full()).mockResolvedValueOnce(full());
    const r = await resolveProTier(makeReq(), makeRes(), "coach");
    expect(r.tier).toBe("floor");
    // Див. коментар до standard-піна вище — обидва тири коуча переведено
    // однією зміною 2026-08-26.
    expect(r.model).toBe("google/gemini-3.5-flash-lite");
  });
});

describe("resolveProTier — chat-тиринг під CHAT_VIA_OPENROUTER", () => {
  // Прапорець перемикає і транспорт, і сімейство model-id: з ним чат мусить
  // отримати OpenRouter-id, бо api.anthropic.com на них відповідає 404 (і
  // навпаки — без прапорця Claude-id, бо шлюз вимкнений).
  beforeEach(() => {
    process.env["CHAT_VIA_OPENROUTER"] = "true";
    // Ключ обовʼязковий: прапорець без нього свідомо не діє, інакше вийшов би
    // півстан «OpenRouter-моделі у прямий Anthropic» → 404. Інваріант
    // закріплено окремо в `env/chatViaOpenRouter.test.ts`.
    process.env["OPENROUTER_API_KEY"] = "sk-or-test";
  });

  it("premium → z-ai/glm-5.2", async () => {
    pool.query.mockResolvedValueOnce(ok(1));
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("premium");
    expect(r.model).toBe("z-ai/glm-5.2");
  });

  it("standard → deepseek/deepseek-v4-flash", async () => {
    pool.query.mockResolvedValueOnce(full()).mockResolvedValueOnce(ok(1));
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("standard");
    expect(r.model).toBe("deepseek/deepseek-v4-flash");
  });

  // Модель змінено 2026-08-26: `google/gemini-2.5-flash-lite` давала 9 зривів
  // стріму з 12 на прод-формі виклику (stream + 78 інструментів), тобто три
  // чверті відповідей floor-тиру були порожні. Обґрунтування й заміри —
  // у докстрінгу `env/chatModels.ts::CHAT_MODEL_DEFAULTS.floor`.
  it("floor → google/gemini-3.7-flash", async () => {
    pool.query.mockResolvedValueOnce(full()).mockResolvedValueOnce(full());
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("floor");
    expect(r.model).toBe("google/gemini-3.7-flash");
  });

  it("явний env-override перекриває дефолт шлюзу", async () => {
    process.env["CHAT_MODEL_SYNTHESIS"] = "openai/gpt-5.1-mini";
    pool.query.mockResolvedValueOnce(ok(1));
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.model).toBe("openai/gpt-5.1-mini");
  });
});

describe("resolveProTier — fail-open never blocks a paying user", () => {
  it("DB error on premium consume → premium (fail-open)", async () => {
    pool.query.mockRejectedValueOnce(new Error("db down"));
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("premium");
  });

  it("plan lookup throws → premium (monetization-safe)", async () => {
    getUserPlan.mockRejectedValue(new Error("subs blip"));
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("premium");
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("no DATABASE_URL → premium (fail-open)", async () => {
    delete process.env["DATABASE_URL"];
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("premium");
  });
});

describe("resolveProTier — catastrophic-cost circuit-breaker (degrade-all)", () => {
  it("flag on + hard breached → floor for a Pro user, no DB roundtrip", async () => {
    process.env["ANTHROPIC_BUDGET_HARD_DEGRADE_ALL"] = "true";
    isHardExceeded.mockReturnValue(true);
    const res = makeRes();
    const r = await resolveProTier(makeReq(), res, "chat");
    expect(r.tier).toBe("floor");
    expect(res.headers["X-AI-Tier"]).toBe("floor");
    // Degrade short-circuits before any bucket consume.
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("flag on + hard breached → floor for a Free user too (Free dominates COGS)", async () => {
    process.env["ANTHROPIC_BUDGET_HARD_DEGRADE_ALL"] = "true";
    isHardExceeded.mockReturnValue(true);
    getUserPlan.mockResolvedValue({ plan: "free" });
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("floor");
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("flag on but NOT breached → normal tiering (premium)", async () => {
    process.env["ANTHROPIC_BUDGET_HARD_DEGRADE_ALL"] = "true";
    isHardExceeded.mockReturnValue(false);
    pool.query.mockResolvedValueOnce(ok());
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("premium");
  });

  it("breached but flag OFF (default) → normal tiering, breaker is opt-in", async () => {
    isHardExceeded.mockReturnValue(true); // breached…
    // …but ANTHROPIC_BUDGET_HARD_DEGRADE_ALL unset → no degrade.
    pool.query.mockResolvedValueOnce(ok());
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("premium");
  });

  it("flag on + hard breached → floor for an anonymous caller too", async () => {
    process.env["ANTHROPIC_BUDGET_HARD_DEGRADE_ALL"] = "true";
    isHardExceeded.mockReturnValue(true);
    getSessionUser.mockResolvedValue(null);
    const res = makeRes();
    const r = await resolveProTier(makeReq(), res, "chat");
    expect(r.tier).toBe("floor");
    expect(res.headers["X-AI-Tier"]).toBe("floor");
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("founder is never degraded even when flag on + breached", async () => {
    process.env["ANTHROPIC_BUDGET_HARD_DEGRADE_ALL"] = "true";
    process.env["AI_QUOTA_FOUNDER_IDS"] = "u1";
    isHardExceeded.mockReturnValue(true);
    const r = await resolveProTier(makeReq(), makeRes(), "chat");
    expect(r.tier).toBe("premium");
    expect(pool.query).not.toHaveBeenCalled();
  });
});
