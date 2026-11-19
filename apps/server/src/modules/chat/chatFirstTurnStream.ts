import type { Request, Response } from "express";
import { env } from "../../env.js";
import { chatViaOpenRouter } from "../../env/chatModels.js";
import {
  type AnthropicStreamResult,
  anthropicMessagesStream,
  recordAnthropicUsage,
} from "../../lib/anthropic.js";
import { replaceLongDash } from "../../lib/modelText.js";
import type { AiProvider } from "../../lib/posthogAi.js";
import { makeAiProviderError } from "../../obs/errors.js";
import { logger } from "../../obs/logger.js";
import {
  chatFirstTurnFirstVisibleMs,
  chatFirstTurnSilentRetryTotal,
} from "../../obs/metrics.js";
import {
  type AnthropicContentBlock,
  type FetchResponse,
  type StreamUsage,
  MAX_TEXT_CONTINUATIONS,
  refundQuotaOnUpstreamFailure,
} from "./chatShared.js";
import { SSE_GENERIC_ERROR, mergeStreamUsage } from "./chatStream.js";

/**
 * Стрім ПЕРШОГО ходу чату (С-1 (а), рішення founder-а 2026-11-18, спека
 * `docs/work/specs/hubchat-first-turn-stream.md`).
 *
 * Протокол кадрів (`data: <json>\n\n`, як у турі синтезу):
 * - `{ t }` — шматок тексту, який модель пише просто зараз;
 * - `{ tool }` — модель почала блок виклику інструмента (імʼя з реєстру), щоб
 *   клієнт одразу показав підпис кроку («Шукаю операції»);
 * - `{ final }` — зібрана відповідь у ТІЙ САМІЙ формі, що JSON першого ходу
 *   (`text`, `tool_calls`, `tool_calls_raw`, `round_trip_ticket`); дії на
 *   пристрої клієнт виконує лише після цього кадру;
 * - `{ err, code? }` — збій; після видимих кадрів написане лишається в людини;
 * - `[DONE]` — кінець потоку.
 *
 * Аргументи інструментів (`input_json_delta`) клієнту не стрімляться: частковим
 * аргументам віри немає, вони збираються тут і їдуть лише у `final`.
 *
 * AI-DANGER: текст моделі й кадри не логуються (Hard Rule #21) — лише причина
 * збою та імʼя моделі.
 */

/** Стеля одного upstream-стріму, як у турі синтезу (`chatStream.ts`). */
const FIRST_TURN_STREAM_TIMEOUT_MS = 60_000;

/** Скільки upstream-спроб до першого видимого кадру (одна тиха повторна). */
const MAX_SILENT_ATTEMPTS = 2;

/** Нижче цього спроба безглузда (той самий поріг, що в `anthropic.ts`). */
const MIN_USEFUL_ATTEMPT_MS = 1_000;

/** Імʼя інструмента, яке можна віддати клієнту кадром `{ tool }`. */
const TOOL_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;

export type FirstTurnVisibleKind = "text" | "tool";

/** SSE-канал першого ходу: заголовки відкриваються ліниво, heartbeat свій. */
export class FirstTurnSse {
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  opened = false;

  constructor(private readonly res: Response) {}

  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    this.res.setHeader("Cache-Control", "no-cache, no-transform");
    this.res.setHeader("X-Accel-Buffering", "no");
    this.heartbeat = setInterval(() => {
      if (!this.res.writableEnded) this.res.write(": ping\n\n");
    }, env.SSE_HEARTBEAT_MS);
    if (typeof this.heartbeat.unref === "function") this.heartbeat.unref();
  }

  frame(payload: Record<string, unknown>): void {
    this.open();
    if (!this.res.writableEnded) {
      this.res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  }

  close(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (this.opened && !this.res.writableEnded) {
      this.res.write("data: [DONE]\n\n");
      this.res.end();
    }
  }
}

export interface FirstTurnStreamParams {
  req: Request;
  res: Response;
  apiKey: string;
  payload: Record<string, unknown>;
  /** Розрив зʼєднання клієнтом (`res` 'close' у `chat.ts`). */
  signal: AbortSignal;
  traceId: string;
  userId: string | undefined;
  promptVersion: string;
  /** Бюджет першої спроби до першого видимого кадру. */
  attemptTimeoutMs: number;
  /** Стеля всіх тихих спроб разом. */
  totalTimeoutMs: number;
  /** Вхід у handler — відлік часу до першого видимого знаку. */
  handlerStartedAt: number;
}

export type FirstTurnStreamResult =
  | { outcome: "ok"; content: AnthropicContentBlock[]; sse: FirstTurnSse }
  /** Потік уже закрито: збій із кадром `err` або клієнт пішов. */
  | { outcome: "closed" };

interface BlockEntry {
  block: AnthropicContentBlock;
  json: string;
}

interface TurnState {
  /** Показаний людині текст (після `replaceLongDash`), через усі ітерації. */
  text: string;
  /** Не-текстові блоки (tool_use тощо) у порядку появи. */
  nonText: AnthropicContentBlock[];
  shown: boolean;
}

interface IterationResult {
  outcome: "ok" | "error";
  stopReason: string | null;
  usage: StreamUsage | null;
  reason: string | null;
  iterText: string;
}

interface StreamEvent {
  type?: string;
  index?: number;
  content_block?: AnthropicContentBlock;
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    thinking?: string;
    signature?: string;
    stop_reason?: string;
  };
  message?: { usage?: StreamUsage };
  usage?: StreamUsage;
  error?: { type?: string; message?: string };
}

/**
 * Читає одну upstream-відповідь: шле видимі кадри й збирає блоки в `state`.
 * Не закриває потік — оркестратор може відкрити continuation.
 */
async function readIteration(
  upstream: FetchResponse,
  state: TurnState,
  emit: {
    text: (delta: string) => void;
    tool: (name: string) => void;
  },
): Promise<IterationResult> {
  const result: IterationResult = {
    outcome: "ok",
    stopReason: null,
    usage: null,
    reason: null,
    iterText: "",
  };
  const reader = upstream.body?.getReader();
  if (!reader) return { ...result, outcome: "error", reason: "empty_body" };

  const blocks = new Map<number, BlockEntry>();
  let separatorPending = false;
  let sawEvent = false;
  const pushText = (raw: string): void => {
    if (!raw) return;
    let delta = replaceLongDash(raw);
    // Кілька text-блоків в одній відповіді: JSON-шлях склеює їх через "\n"
    // (`chat.ts`), тож і показаний текст мусить мати той самий розділювач.
    if (separatorPending) {
      delta = `\n${delta}`;
      separatorPending = false;
    }
    result.iterText += delta;
    state.text += delta;
    emit.text(delta);
  };

  const handle = (ev: StreamEvent): void => {
    const index = typeof ev.index === "number" ? ev.index : -1;
    if (ev.type === "content_block_start" && ev.content_block) {
      const cb = ev.content_block;
      if (cb.type === "text") {
        blocks.set(index, { block: { type: "text" }, json: "" });
        separatorPending = result.iterText !== "";
        pushText(typeof cb.text === "string" ? cb.text : "");
        return;
      }
      blocks.set(index, { block: { ...cb }, json: "" });
      if (cb.type === "tool_use" && typeof cb.name === "string") {
        if (TOOL_NAME_RE.test(cb.name)) emit.tool(cb.name);
      }
      return;
    }
    if (ev.type === "content_block_delta" && ev.delta) {
      const entry = blocks.get(index);
      const d = ev.delta;
      if (d.type === "text_delta" && d.text) pushText(d.text);
      else if (d.type === "input_json_delta" && entry) {
        entry.json += d.partial_json ?? "";
      } else if (d.type === "thinking_delta" && entry) {
        entry.block["thinking"] =
          String(entry.block["thinking"] ?? "") + (d.thinking ?? "");
      } else if (d.type === "signature_delta" && entry) {
        entry.block["signature"] = d.signature ?? "";
      }
      return;
    }
    if (ev.type === "content_block_stop") {
      const entry = blocks.get(index);
      if (!entry || entry.block.type === "text") return;
      if (entry.json) {
        try {
          entry.block.input = JSON.parse(entry.json) as unknown;
        } catch {
          result.outcome = "error";
          result.reason = "bad_tool_input";
          return;
        }
      } else if (
        (entry.block.type === "tool_use" ||
          entry.block.type === "server_tool_use") &&
        entry.block.input === undefined
      ) {
        entry.block.input = {};
      }
      state.nonText.push(entry.block);
      return;
    }
    if (ev.type === "message_delta") {
      if (ev.delta?.stop_reason) result.stopReason = ev.delta.stop_reason;
      if (ev.usage) result.usage = mergeStreamUsage(result.usage, ev.usage);
      return;
    }
    if (ev.type === "message_start" && ev.message?.usage) {
      result.usage = mergeStreamUsage(result.usage, ev.message.usage);
      return;
    }
    if (ev.type === "error") {
      result.outcome = "error";
      result.reason = ev.error?.message || ev.error?.type || "unknown";
    }
  };

  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (result.outcome === "ok") {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      for (;;) {
        const nl = buf.indexOf("\n");
        if (nl === -1) break;
        const line = buf.slice(0, nl).replace(/\r$/, "");
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") continue;
        let ev: StreamEvent;
        try {
          ev = JSON.parse(raw) as StreamEvent;
        } catch {
          continue;
        }
        sawEvent = true;
        handle(ev);
        // `handle` міняє `outcome` у замиканні, звуження TS цього не бачить.
        if ((result.outcome as IterationResult["outcome"]) === "error") break;
      }
    }
  } catch (e: unknown) {
    result.outcome = "error";
    result.reason = e instanceof Error ? e.name || e.message : String(e);
  }
  if (result.outcome === "ok" && !sawEvent) {
    // Тіло закрилось, не давши жодної події: це збій, а не порожня відповідь.
    result.outcome = "error";
    result.reason = "empty_stream";
  }
  return result;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function readProviderError(response: FetchResponse): Promise<string> {
  try {
    const text = await response.text();
    try {
      const j = JSON.parse(text) as { error?: { message?: string } };
      return j?.error?.message || text || "AI error";
    } catch {
      return text || "AI error";
    }
  } catch {
    return "AI error";
  }
}

/**
 * Перший хід через стрім. Тиха повторна спроба діє, доки людина нічого не
 * бачила (зависання зʼєднання до першого кадру, мережевий збій, 429/5xx).
 * Збій ДО відкриття потоку кидається (JSON-помилка, як у нестрімовому шляху);
 * збій після — кадр `err` і закритий потік.
 */
export async function streamFirstTurnToSse(
  params: FirstTurnStreamParams,
): Promise<FirstTurnStreamResult> {
  const { req, res, apiKey, payload, signal, traceId, userId } = params;
  const model = (payload["model"] as string) || "unknown";
  const sse = new FirstTurnSse(res);
  const state: TurnState = { text: "", nonText: [], shown: false };
  const startedAt = Date.now();

  const markShown = (kind: FirstTurnVisibleKind): void => {
    if (state.shown) return;
    state.shown = true;
    chatFirstTurnFirstVisibleMs.observe(
      { kind, source: "model" },
      Date.now() - params.handlerStartedAt,
    );
  };
  const emit = {
    text: (delta: string) => {
      markShown("text");
      sse.frame({ t: delta });
    },
    tool: (name: string) => {
      markShown("tool");
      sse.frame({ tool: name });
    },
  };

  const recordIteration = (
    endpoint: string,
    iter: IterationResult,
    stream: AnthropicStreamResult,
  ): void => {
    if (!iter.usage) return;
    recordAnthropicUsage(
      model,
      endpoint,
      iter.usage,
      params.promptVersion,
      userId,
      {
        provider: stream.provider as AiProvider | undefined,
        latencyMs:
          typeof stream.elapsedMs === "function"
            ? stream.elapsedMs()
            : undefined,
        traceId,
      },
    );
  };

  let lastStatus: number | undefined;
  let lastMessage = "AI error";
  let first: { stream: AnthropicStreamResult; iter: IterationResult } | null =
    null;

  for (let attempt = 1; attempt <= MAX_SILENT_ATTEMPTS; attempt++) {
    if (signal.aborted) break;
    const remaining = params.totalTimeoutMs - (Date.now() - startedAt);
    if (remaining < MIN_USEFUL_ATTEMPT_MS) break;
    const watchdogMs =
      attempt === 1 ? Math.min(params.attemptTimeoutMs, remaining) : remaining;

    const attemptAc = new AbortController();
    const onExternalAbort = (): void => attemptAc.abort();
    signal.addEventListener("abort", onExternalAbort, { once: true });
    let stalled = false;
    const watchdog = setTimeout(() => {
      if (state.shown) return;
      stalled = true;
      attemptAc.abort();
    }, watchdogMs);
    if (typeof watchdog.unref === "function") watchdog.unref();

    let retryReason: "stall" | "network" | "status" | null = null;
    try {
      let stream: AnthropicStreamResult;
      try {
        stream = await anthropicMessagesStream(apiKey, payload, {
          endpoint: "chat",
          timeoutMs: FIRST_TURN_STREAM_TIMEOUT_MS,
          signal: attemptAc.signal,
          allowOpenRouter: chatViaOpenRouter(),
          userId,
          traceId,
        });
      } catch (e) {
        if (signal.aborted) break;
        lastMessage = e instanceof Error ? e.message : String(e);
        retryReason = stalled ? "stall" : "network";
        continue;
      }

      if (!stream.response.ok) {
        stream.recordStreamEnd("error");
        lastStatus = stream.response.status;
        lastMessage = await readProviderError(stream.response);
        if (isRetryableStatus(lastStatus)) {
          retryReason = "status";
          continue;
        }
        break;
      }

      sse.open();
      const iter = await readIteration(stream.response, state, emit);
      stream.recordStreamEnd(
        iter.outcome === "ok" ? "ok" : stalled ? "timeout" : "error",
      );
      recordIteration("chat", iter, stream);

      if (iter.outcome === "ok") {
        first = { stream, iter };
        break;
      }
      if (signal.aborted) break;
      lastMessage = iter.reason ?? "unknown";
      if (state.shown) break;
      // Людина ще нічого не бачила: зібране викидаємо і пробуємо ще раз.
      state.text = "";
      state.nonText = [];
      retryReason = stalled ? "stall" : "network";
    } finally {
      clearTimeout(watchdog);
      signal.removeEventListener("abort", onExternalAbort);
      if (retryReason && attempt < MAX_SILENT_ATTEMPTS && !signal.aborted) {
        chatFirstTurnSilentRetryTotal.inc({ reason: retryReason });
      }
    }
  }

  if (!first) {
    if (signal.aborted) {
      if (!state.shown) await refundQuotaOnUpstreamFailure(req);
      sse.close();
      return { outcome: "closed" };
    }
    logger.warn({
      msg: "chat_first_turn_stream_failed",
      model,
      shown: state.shown,
      status: lastStatus,
      reason: lastMessage.slice(0, 200),
    });
    if (!sse.opened) {
      // Потік ще не відкрито: та сама JSON-помилка, що в нестрімовому шляху
      // (квоту повертає caller, як і там).
      throw makeAiProviderError({
        rawProviderMessage: lastMessage,
        status: lastStatus,
      });
    }
    // Написане лишається в людини (рішення founder-а: обрив → «Ще раз»), тож
    // квоту повертаємо лише тоді, коли не показали нічого.
    if (!state.shown) await refundQuotaOnUpstreamFailure(req);
    sse.frame({ err: SSE_GENERIC_ERROR });
    sse.close();
    return { outcome: "closed" };
  }

  // AI-DANGER: continuation на `max_tokens` для текстової відповіді — той самий
  // запобіжник, що `callAnthropicWithContinuation` у нестрімовому шляху.
  let iter = first.iter;
  for (let left = MAX_TEXT_CONTINUATIONS; left > 0; left--) {
    const hasToolUse = state.nonText.some((b) => b.type === "tool_use");
    if (
      iter.stopReason !== "max_tokens" ||
      hasToolUse ||
      !iter.iterText ||
      signal.aborted
    ) {
      break;
    }
    const baseMessages = (payload["messages"] as Array<unknown>) ?? [];
    let next: AnthropicStreamResult;
    try {
      next = await anthropicMessagesStream(
        apiKey,
        {
          ...payload,
          messages: [
            ...baseMessages,
            { role: "assistant", content: state.text },
          ],
        },
        {
          endpoint: "chat-cont",
          timeoutMs: FIRST_TURN_STREAM_TIMEOUT_MS,
          signal,
          allowOpenRouter: chatViaOpenRouter(),
          userId,
          traceId,
        },
      );
    } catch {
      break;
    }
    if (!next.response.ok) {
      next.recordStreamEnd("error");
      break;
    }
    iter = await readIteration(next.response, state, emit);
    next.recordStreamEnd(iter.outcome);
    recordIteration("chat-cont", iter, next);
    if (iter.outcome !== "ok") break;
  }

  if (signal.aborted) {
    sse.close();
    return { outcome: "closed" };
  }

  const content: AnthropicContentBlock[] = [
    ...(state.text ? [{ type: "text", text: state.text }] : []),
    ...state.nonText,
  ];
  return { outcome: "ok", content, sse };
}

/**
 * Відповідь із кешу першого ходу тим самим протоколом: текст одним кадром,
 * кадри кроків, потім `final`. Дії клієнт так само виконує лише після `final`.
 */
export function replayFirstTurnFromCache(
  res: Response,
  body: Record<string, unknown>,
  handlerStartedAt: number,
): void {
  const sse = new FirstTurnSse(res);
  const text = typeof body["text"] === "string" ? body["text"] : "";
  const toolCalls = Array.isArray(body["tool_calls"])
    ? (body["tool_calls"] as Array<{ name?: unknown }>)
    : [];
  const firstKind: FirstTurnVisibleKind | null = text
    ? "text"
    : toolCalls.length > 0
      ? "tool"
      : null;
  if (firstKind) {
    chatFirstTurnFirstVisibleMs.observe(
      { kind: firstKind, source: "cache" },
      Date.now() - handlerStartedAt,
    );
  }
  if (text) sse.frame({ t: text });
  for (const tc of toolCalls) {
    if (typeof tc.name === "string" && TOOL_NAME_RE.test(tc.name)) {
      sse.frame({ tool: tc.name });
    }
  }
  sse.frame({ final: body });
  sse.close();
}
