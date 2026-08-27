/**
 * Last validated: 2026-07-26
 * Status: Active
 *
 * AI-CONTEXT: маскування в чаті легко зробити «майже правильним» — воно
 * не падає, відповіді приходять, і побачити витік можна лише прочитавши
 * payload, який пішов до Anthropic. Тому тести нижче дивляться саме на
 * payload, а не на відповідь handler-а.
 *
 * Друга половина файлу перевіряє протилежне: що маска НЕ чіпає текст
 * користувача (клас В відкладений власником) і не чіпає назви крамниць
 * (рішення #10 — «інакше поради пусті»).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

vi.mock("../../lib/anthropic.js", () => ({
  anthropicMessages: vi.fn(),
  anthropicMessagesStream: vi.fn(),
  extractAnthropicText: vi.fn(() => "готово"),
}));

vi.mock("../../lib/counterpartyNames.js", () => ({
  getCounterpartyNames: vi.fn(async () => ["Іван Петренко"]),
}));

/**
 * Sentry-breadcrumb-и — другий стік «за периметром» поряд з Anthropic.
 * Мокаємо, щоб тест міг дивитись на те, що реально пішло б у Sentry.
 */
const sentryMocks = vi.hoisted(() => ({ addBreadcrumb: vi.fn() }));
vi.mock("../../sentry.js", () => ({
  Sentry: { addBreadcrumb: sentryMocks.addBreadcrumb },
}));

import { anthropicMessages as _anthropicMessages } from "../../lib/anthropic.js";
import handler from "./chat.js";
import { __resetChatResponseCache } from "./chatResponseCache.js";

const anthropicMessages = _anthropicMessages as unknown as Mock;

function makeReq(body: unknown): Request {
  return { anthropicKey: "sk-test", body } as unknown as Request;
}

function makeRes(): Response {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response;
}

/** Payload першого (і єдиного) виклику Anthropic. */
function sentPayload(): Record<string, unknown> {
  const call = anthropicMessages.mock.calls[0];
  return (call?.[1] ?? {}) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  anthropicMessages.mockReset();
  __resetChatResponseCache();
  anthropicMessages.mockResolvedValue({
    response: { ok: true, status: 200 },
    data: { content: [{ type: "text", text: "готово" }] },
  });
});

describe("маскування на вході чату", () => {
  it("вирізає пошту й телефон із повідомлення користувача", async () => {
    await handler(
      makeReq({
        context: "",
        messages: [
          {
            role: "user",
            content: "мій імейл ivan@mail.com, тел +380671234567",
          },
        ],
      }),
      makeRes(),
    );
    const messages = sentPayload()["messages"] as { content: string }[];
    const sent = JSON.stringify(messages);
    expect(sent).not.toContain("ivan@mail.com");
    expect(sent).not.toContain("380671234567");
    expect(sent).toContain("[email]");
  });

  it("НЕ вирізає імʼя з тексту, який набрала людина", async () => {
    // Клас В відкладений власником 2026-07-26. Без повернення імені у
    // відповідь вирізання дало б «[особа] винна тобі 500» — гірше, ніж
    // не маскувати взагалі. Асерт стоїть тут, щоб зняття обмеження було
    // свідомим, а не побічним ефектом рефактора.
    await handler(
      makeReq({
        context: "",
        messages: [{ role: "user", content: "скільки я винен Іван Петренко" }],
      }),
      makeRes(),
    );
    expect(JSON.stringify(sentPayload()["messages"])).toContain(
      "Іван Петренко",
    );
  });

  it("вирізає імʼя контрагента зі знімка фінансів", async () => {
    // Знімок — машинного походження, тож до нього йде клас Б.
    await handler(
      makeReq({
        context: "Переказ: Іван Петренко, 500 грн",
        messages: [{ role: "user", content: "що там" }],
      }),
      makeRes(),
    );
    // `system` — масив блоків (cache breakpoints), не рядок.
    const system = JSON.stringify(sentPayload()["system"]);
    expect(system).not.toContain("Іван Петренко");
    expect(system).toContain("[особа]");
  });

  it("суми й назви крамниць у знімку лишаються", async () => {
    // Пряма перевірка другої половини рішення #10.
    await handler(
      makeReq({
        context: "Сільпо 342.50 грн, продукти",
        messages: [{ role: "user", content: "що там" }],
      }),
      makeRes(),
    );
    // `system` — масив блоків (cache breakpoints), не рядок.
    const system = JSON.stringify(sentPayload()["system"]);
    expect(system).toContain("Сільпо");
    expect(system).toContain("342.50");
  });

  it("маскує вміст результатів інструментів", async () => {
    await handler(
      makeReq({
        context: "",
        messages: [{ role: "user", content: "покажи перекази" }],
        tool_calls_raw: [
          { type: "tool_use", id: "t1", name: "find_transaction", input: {} },
        ],
        tool_results: [
          { tool_use_id: "t1", content: "Від Іван Петренко ivan@mail.com" },
        ],
      }),
      makeRes(),
    );
    const sent = JSON.stringify(sentPayload()["messages"]);
    expect(sent).not.toContain("Іван Петренко");
    expect(sent).not.toContain("ivan@mail.com");
  });

  // Знахідка B2 (`docs/90-work/audits/ai-pipeline-2026-08-05.md`): Anthropic —
  // не єдиний стік за периметром. `truncateToolResults` кладе ПОВНИЙ оригінал
  // у Sentry-breadcrumb (`data.full`), а `applyBeforeBreadcrumb` чистить `data`
  // лише для `category: "http"`. Поки маска стояла ПІСЛЯ усічення, сирі імена
  // їхали в Sentry. Тест дивиться саме на breadcrumb, а не на payload — інакше
  // регресія знову пройде повз (payload лишиться чистим в обох порядках).
  it("не пускає немасковане імʼя у Sentry-breadcrumb усічення", async () => {
    const long = `Від Іван Петренко ivan@mail.com ${"деталі ".repeat(400)}`;
    expect(long.length).toBeGreaterThan(2000); // інакше truncate не спрацює

    await handler(
      makeReq({
        context: "",
        messages: [{ role: "user", content: "покажи перекази" }],
        tool_calls_raw: [
          { type: "tool_use", id: "t1", name: "find_transaction", input: {} },
        ],
        tool_results: [{ tool_use_id: "t1", content: long }],
      }),
      makeRes(),
    );

    const breadcrumbs = sentryMocks.addBreadcrumb.mock.calls
      .map((c) => c[0] as { category?: string; data?: Record<string, unknown> })
      .filter((b) => b?.category === "chat.tool_result");
    expect(breadcrumbs).toHaveLength(1);

    const full = String(breadcrumbs[0]?.data?.["full"] ?? "");
    expect(full).not.toBe("");
    expect(full).not.toContain("Іван Петренко");
    expect(full).not.toContain("ivan@mail.com");
  });
});
