/**
 * Замір фаз ПЕРШОГО ходу чату — метрика `chat_first_turn_phase_ms`.
 *
 * Знахідка AI-2 (`docs/90-work/audits/2026-09-01-product-audit/findings.md`):
 * «TTFT 5–14 с» міряв не те, що називався. Першого токена на цьому шляху
 * немає — перший хід не стрімиться, — тож `ai_first_token_ms` його не бачить,
 * і питання «скільки з очікування наше, а скільки провайдера» лишалось без
 * даних. Ці тести стережуть саме придатність відповіді, не факт запису:
 *
 * - фази пишуться на першому ході й лише на ньому (тур синтезу платить ті
 *   самі `session`/`counterparties`, і змішані серії описували б «середній
 *   хід», якого не існує);
 * - `pre_upstream` накриває все наше до виклику моделі, тож він не менший за
 *   суму названих фаз — інакше метрика мовчки губила б роботу;
 * - провал upstream потрапляє в розподіл (це найдовше очікування, яке людина
 *   бачить взагалі), а не лише щасливий шлях;
 * - попадання в кеш пише фази без `upstream`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

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

import { anthropicMessages as _anthropicMessages } from "../../lib/anthropic.js";
import handler from "./chat.js";
import { __resetChatResponseCache } from "./chatResponseCache.js";
import { chatFirstTurnPhaseMs } from "../../obs/metrics.js";

const anthropicMessages = _anthropicMessages as unknown as Mock;

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeReq(body: unknown): Request {
  return { anthropicKey: "sk-test", body } as unknown as Request;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as TestRes & Response;
}

/** `{ phase → скільки разів заміряно }` з поточного стану histogram-а. */
async function phaseCounts(): Promise<Record<string, number>> {
  const snapshot = await chatFirstTurnPhaseMs.get();
  const out: Record<string, number> = {};
  for (const v of snapshot.values) {
    if (v.metricName !== "chat_first_turn_phase_ms_count") continue;
    const phase = (v.labels as { phase?: string }).phase;
    if (phase) out[phase] = v.value;
  }
  return out;
}

/** `{ phase → сума мс }` — потрібна для перевірки «pre_upstream накриває». */
async function phaseSums(): Promise<Record<string, number>> {
  const snapshot = await chatFirstTurnPhaseMs.get();
  const out: Record<string, number> = {};
  for (const v of snapshot.values) {
    if (v.metricName !== "chat_first_turn_phase_ms_sum") continue;
    const phase = (v.labels as { phase?: string }).phase;
    if (phase) out[phase] = v.value;
  }
  return out;
}

function textReply(text: string) {
  return {
    response: { ok: true, status: 200 },
    data: { content: [{ type: "text", text }] },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  anthropicMessages.mockReset();
  __resetChatResponseCache();
  chatFirstTurnPhaseMs.reset();
});

describe("chat_first_turn_phase_ms", () => {
  it("перший хід пише фази до виклику моделі й сам виклик", async () => {
    anthropicMessages.mockResolvedValueOnce(textReply("Привіт!"));

    const res = makeRes();
    await handler(
      makeReq({ messages: [{ role: "user", content: "Привіт" }] }),
      res,
    );
    expect(res.statusCode).toBe(200);

    const counts = await phaseCounts();
    // Ці чотири платить КОЖЕН перший хід, включно з аноновим.
    expect(counts["session"]).toBe(1);
    expect(counts["counterparties"]).toBe(1);
    expect(counts["pre_upstream"]).toBe(1);
    expect(counts["upstream"]).toBe(1);
    // А ці три — умовні: без сесії немає ні кореляцій коуча, ні преференсів.
    // Порожня серія тут не діра, а сама відповідь: анонів хід дешевший, і
    // видно це саме за відсутністю фаз.
    expect(counts["correlations"]).toBeUndefined();
    expect(counts["preferences"]).toBeUndefined();
  });

  it("`total` — власна серія, бо саме вона несе SLO повної відповіді", async () => {
    anthropicMessages.mockResolvedValueOnce(textReply("Привіт!"));

    await handler(
      makeReq({ messages: [{ role: "user", content: "Привіт" }] }),
      makeRes(),
    );

    const counts = await phaseCounts();
    expect(counts["total"]).toBe(1);

    // Складати `total` з фаз на дашборді не можна — p95 суми не дорівнює
    // сумі p95. Тому серія власна, і вона мусить накривати upstream: інакше
    // обіцянка «повна відповідь за N секунд» знову була б невимірною.
    const sums = await phaseSums();
    expect(sums["total"]).toBeGreaterThanOrEqual(sums["upstream"] ?? 0);
  });

  it("`pre_upstream` накриває названі фази, а не йде поруч із ними", async () => {
    anthropicMessages.mockResolvedValueOnce(textReply("Привіт!"));

    await handler(
      makeReq({ messages: [{ role: "user", content: "Привіт" }] }),
      makeRes(),
    );

    const sums = await phaseSums();
    const named = (sums["session"] ?? 0) + (sums["counterparties"] ?? 0);
    // Нестрога нерівність навмисно: у юніт-тесті всі кроки моковані й
    // укладаються в один тік, тож чесний результат тут — рівність нулю.
    // Тест стереже ЗНАК різниці (неврахована робота не буває відʼємною),
    // а не конкретні мілісекунди, яких на моках не буває.
    expect(sums["pre_upstream"]).toBeGreaterThanOrEqual(named);
  });

  it("тур синтезу фаз НЕ пише — інакше серії описували б неіснуючий хід", async () => {
    anthropicMessages.mockResolvedValueOnce(textReply("Готово, видалено."));

    const res = makeRes();
    await handler(
      makeReq({
        messages: [{ role: "user", content: "Видали m_abc" }],
        tool_calls_raw: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "delete_transaction",
            input: { tx_id: "m_abc" },
          },
        ],
        tool_results: [
          { tool_use_id: "toolu_1", content: "Транзакцію m_abc видалено" },
        ],
      }),
      res,
    );
    expect(res.statusCode).toBe(200);

    expect(await phaseCounts()).toEqual({});
  });

  it("провал upstream теж потрапляє в розподіл", async () => {
    anthropicMessages.mockRejectedValueOnce(new Error("upstream timeout"));

    await expect(
      handler(
        makeReq({ messages: [{ role: "user", content: "Привіт" }] }),
        makeRes(),
      ),
    ).rejects.toThrow();

    const counts = await phaseCounts();
    expect(counts["upstream"]).toBe(1);
    expect(counts["pre_upstream"]).toBe(1);
  });

  it("попадання в кеш пише фази без `upstream`", async () => {
    anthropicMessages.mockResolvedValueOnce(textReply("Кешована відповідь"));
    const body = { messages: [{ role: "user", content: "однакове питання" }] };

    await handler(makeReq(body), makeRes());
    expect(await phaseCounts()).toMatchObject({
      pre_upstream: 1,
      upstream: 1,
    });

    const res2 = makeRes();
    await handler(makeReq(body), res2);
    expect(res2.body).toEqual({ text: "Кешована відповідь" });
    expect(anthropicMessages).toHaveBeenCalledTimes(1);

    const counts = await phaseCounts();
    expect(counts["pre_upstream"]).toBe(2);
    expect(counts["upstream"]).toBe(1);
    // `total` є на обох ходах, зокрема на тому, що моделі не бачив: SLO
    // повної відповіді стосується й кешованої відповіді.
    expect(counts["total"]).toBe(2);
  });
});
