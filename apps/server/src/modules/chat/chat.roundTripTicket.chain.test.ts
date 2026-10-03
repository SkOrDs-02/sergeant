/**
 * sec-03 / logic-02 (аудит 2026-10-01) — ланцюжок квитків через реальні
 * `assertAiQuota` + `chat.ts`, без заглушок квоти. Handler-тести
 * (`chat.roundTripTicket.test.ts`) квоту не бачать, а `aiQuota.test.ts` не
 * бачить видачі квитків; дефект жив саме на їхньому стику: перший тур із
 * квитком проходив безкоштовно і видавав новий квиток.
 *
 * Лічильник списань — це кількість успішних UPSERT-ів у `ai_usage_daily`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

vi.mock("../../auth.js", () => ({ getSessionUser: vi.fn() }));

vi.mock("../../db.js", () => {
  const pool = { connect: vi.fn(), query: vi.fn() };
  const withSubjectContext = (_subject: string, fn: (db: unknown) => unknown) =>
    fn(pool);
  return { default: pool, pool, withSubjectContext };
});

vi.mock("../../lib/anthropic.js", () => ({
  anthropicMessages: vi.fn(),
  anthropicMessagesStream: vi.fn(),
  extractAnthropicText: vi.fn(
    (d: { content?: { type: string; text?: string }[] }) =>
      (d?.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n"),
  ),
}));

import { getSessionUser as _getSessionUser } from "../../auth.js";
import _pool from "../../db.js";
import { anthropicMessages as _anthropicMessages } from "../../lib/anthropic.js";
import handler from "./chat.js";
import { assertAiQuota } from "./aiQuota.js";
import { aiQuotaCircuitBreaker } from "./aiQuotaCircuitBreaker.js";
import { __resetChatResponseCache } from "./chatResponseCache.js";
import { __resetRoundTripTickets } from "./chatRoundTripTicket.js";

const getSessionUser = _getSessionUser as unknown as Mock;
const pool = _pool as unknown as { query: Mock };
const anthropicMessages = _anthropicMessages as unknown as Mock;

const USER = { id: "u-chain-1" };

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
  return res as unknown as Response & {
    statusCode: number;
    body: unknown;
  };
}

/** Один запит через ланцюг роуту: `requireAiQuota` (чат-опції) → хендлер. */
async function send(
  body: unknown,
): Promise<{ res: ReturnType<typeof makeRes>; passedQuota: boolean }> {
  const req = {
    anthropicKey: "sk-test",
    body,
    headers: {},
    socket: { remoteAddress: "1.2.3.4" },
    user: USER,
  } as unknown as Request;
  const res = makeRes();
  const passedQuota = await assertAiQuota(req, res, "ai", {
    allowRoundTripTicket: true,
  });
  if (passedQuota) await handler(req, res);
  return { res, passedQuota };
}

const toolUse = (id: string) => ({
  type: "tool_use",
  id,
  name: "mark_habit_done",
  input: { habit_id: "hab_1" },
});

const modelReturnsToolUse = (id: string) =>
  anthropicMessages.mockResolvedValueOnce({
    response: { ok: true, status: 200 },
    data: { content: [toolUse(id)] },
  });

let charges = 0;
let weeklyLimit = 20;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ["DATABASE_URL", "AI_QUOTA_DISABLED"]) {
    savedEnv[k] = process.env[k];
  }
  process.env["DATABASE_URL"] = "postgres://ignored";
  process.env["AI_QUOTA_DISABLED"] = "0";
  vi.clearAllMocks();
  anthropicMessages.mockReset();
  aiQuotaCircuitBreaker.reset();
  __resetChatResponseCache();
  __resetRoundTripTickets();
  getSessionUser.mockResolvedValue(USER);
  charges = 0;
  weeklyLimit = 20;
  pool.query.mockImplementation(async (text: string) => {
    if (!/INSERT INTO ai_usage_daily/i.test(text)) {
      return { rows: [], rowCount: 0 };
    }
    if (charges + 1 > weeklyLimit) return { rows: [], rowCount: 0 };
    charges += 1;
    return { rows: [{ request_count: charges }], rowCount: 1 };
  });
});

afterEach(() => {
  aiQuotaCircuitBreaker.reset();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("round_trip_ticket: ланцюжок через реальну квоту і chat.ts", () => {
  it("легітимний двотуровий хід (tool_calls → tool_results) коштує рівно одну дію", async () => {
    modelReturnsToolUse("toolu_1");
    const first = await send({
      messages: [{ role: "user", content: "Відміть звичку" }],
    });
    expect(first.res.statusCode).toBe(200);
    const ticket = (first.res.body as { round_trip_ticket?: string })
      .round_trip_ticket;
    expect(typeof ticket).toBe("string");
    expect(charges).toBe(1);

    anthropicMessages.mockResolvedValueOnce({
      response: { ok: true, status: 200 },
      data: { content: [{ type: "text", text: "Готово." }] },
    });
    const second = await send({
      messages: [{ role: "user", content: "Відміть звичку" }],
      tool_calls_raw: [toolUse("toolu_1")],
      tool_results: [{ tool_use_id: "toolu_1", content: "ok" }],
      round_trip_ticket: ticket,
    });

    expect(second.res.statusCode).toBe(200);
    expect((second.res.body as { text?: string }).text).toBe("Готово.");
    // Тур синтезу безкоштовний: списано лише перший тур.
    expect(charges).toBe(1);
  });

  it("тур, оплачений квитком, не видає новий квиток", async () => {
    modelReturnsToolUse("toolu_1");
    const first = await send({
      messages: [{ role: "user", content: "Відміть звичку" }],
    });
    const ticket = (first.res.body as { round_trip_ticket?: string })
      .round_trip_ticket;

    // Навіть якщо модель на турі синтезу знову «хоче» tool_use, відповідь
    // віддається текстом (`extractAnthropicText`) і квитка не несе.
    modelReturnsToolUse("toolu_2");
    const second = await send({
      messages: [{ role: "user", content: "Відміть звичку" }],
      tool_calls_raw: [toolUse("toolu_1")],
      tool_results: [{ tool_use_id: "toolu_1", content: "ok" }],
      round_trip_ticket: ticket,
    });

    expect(second.passedQuota).toBe(true);
    expect(charges).toBe(1);
    const body = second.res.body as Record<string, unknown>;
    expect(body["round_trip_ticket"]).toBeUndefined();
    expect(body["tool_calls"]).toBeUndefined();
  });

  it("безкінечний ланцюжок «перший тур + квиток з попередньої відповіді» впирається в 429 на 21-му запиті", async () => {
    // Скриптований клієнт: нове питання щоразу, у тілі — квиток з попередньої
    // відповіді, без tool_results. Раніше це були безкоштовні тури без стелі.
    let ticket: string | undefined;
    let ok = 0;
    for (let i = 0; i < 25; i += 1) {
      modelReturnsToolUse(`toolu_${i}`);
      const { res, passedQuota } = await send({
        messages: [
          { role: "user", content: `Питання ${i}. Виклич інструмент` },
        ],
        ...(ticket ? { round_trip_ticket: ticket } : {}),
      });
      if (!passedQuota) {
        expect(res.statusCode).toBe(429);
        break;
      }
      ok += 1;
      ticket = (res.body as { round_trip_ticket?: string }).round_trip_ticket;
    }

    expect(ok).toBe(20);
    expect(charges).toBe(20);
    // Модель дзвонили рівно 20 разів, а не 25.
    expect(anthropicMessages.mock.calls.length).toBe(20);
  });
});
