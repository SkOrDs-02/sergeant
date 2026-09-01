import type { Request, Response } from "express";
import { env } from "../../env.js";
import { chatViaOpenRouter } from "../../env/chatModels.js";
import { parseBody } from "../../http/validate.js";
import { ChatRequestSchema } from "../../http/schemas.js";
import {
  anthropicMessages,
  extractAnthropicText,
} from "../../lib/anthropic.js";
import { resolveProTier } from "./aiQuota.js";
import {
  type AnthropicContentBlock,
  type AnthropicMessagesResponseData,
  type FetchResponse,
  MAX_TEXT_CONTINUATIONS,
  refundQuotaOnUpstreamFailure,
} from "./chatShared.js";
import { streamAnthropicToSse } from "./chatStream.js";
import { SYSTEM_PROMPT_VERSION } from "./tools.js";
import {
  applyMessagesCacheBreakpoint,
  buildSynthesisToolsPayload,
  buildSystem,
  buildToolsPayload,
  toolNamesFromRawCalls,
} from "./promptCache.js";
import { recordToolProposals, recordToolExecutions } from "./toolMetrics.js";
import {
  buildChatCacheKey,
  getCachedChatResponse,
  setCachedChatResponse,
} from "./chatResponseCache.js";
import { prepareToolResults } from "./prepareToolResults.js";
import { validateToolCallsRawProvenance } from "./validateToolCallsRaw.js";
import { als } from "../../obs/requestContext.js";
import { makeAiProviderError, ValidationError } from "../../obs/errors.js";
import { chatToolIterationCapHitTotal } from "../../obs/metrics.js";
import { emitSecurityEvent } from "../../obs/securityEvents.js";
import { getSessionUser } from "../../auth.js";
import { getCounterpartyNames } from "../../lib/counterpartyNames.js";
import { maskMachineText, maskUserText } from "../../lib/llmRedaction.js";
import { buildRagContext } from "../ai-memory/ragContext.js";
import { getCoachCorrelationsBlock } from "./coach.js";
import { getUserPreferences } from "../me/dataRights.js";
import { pool } from "../../db.js";

type WithAnthropicKey = Request & { anthropicKey?: string };

/**
 * Timeout budget for Anthropic chat tool-result + chat completion calls.
 * Aligned with the longest expected tool-aided round-trip; covers both the
 * `chat-tool-result` continuation and the main `chat` endpoint.
 */
const CHAT_TOOL_TIMEOUT_MS = 30_000;

// Anthropic prompt-caching хелпери (buildSystem / buildToolsPayload /
// applyMessagesCacheBreakpoint) винесені в `./promptCache.ts` — три cache
// breakpoint-и (system prefix, останній не-deferred tool, останнє повідомлення)
// задокументовані там разом із TTL-політикою і tool search.
// Винесення тримає chat.ts під module-size cap (Hard Rule #18).

// SSE-streaming (`streamAnthropicToSse` / `streamOneIterationToSse` /
// `SSE_HEARTBEAT_MS`) винесено в `./chatStream.ts`, а спільні типи/константи/
// refund-хелпер (`AnthropicContentBlock`, `AnthropicMessagesResponseData`,
// `FetchResponse`, `StreamUsage`, `MAX_TEXT_CONTINUATIONS`,
// `refundQuotaOnUpstreamFailure`) — у `./chatShared.ts`. Тримає chat.ts під
// module-size cap (Hard Rule #18).

interface ClientChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * M7 — hard cap on `tool_use` blocks per round-trip. Орthogonal до
 * `MAX_TEXT_CONTINUATIONS`: текстовий continuation не зменшує цей бюджет, і
 * навпаки. Кожен round-trip клієнт↔сервер на `/api/chat` несе максимум один
 * `tool_calls_raw` blob (від клієнта) або один model-output (від Anthropic) —
 * якщо будь-який з них містить >MAX_TOOL_ITERATIONS блоків `tool_use`, ми
 * розриваємо цикл з `422` замість того, щоб дозволити модель/клієнту
 * розкручувати tool-loop безкінечно (DoS / runaway-cost).
 *
 * Поріг 8 узгоджено з картою: реальні chat-сценарії ніколи не потребують
 * >3-х паралельних tool-вызовів в одному турі (брифінг, sync-стан + питання
 * про конкретну категорію — це 2-3). Запас ×2-3 закриває forward-looking
 * розширення (memory + cross-module комбіновані інструменти) без false
 * positive.
 *
 * See `docs/security/hardening/M7-chat-tool-iteration-cap.md`.
 */
export const MAX_TOOL_ITERATIONS = 8;

/**
 * Структурований 422 для cap-overflow. `code` — стабільний string для
 * клієнта і Sentry-фільтрів; `boundary` дублює лейбл метрики
 * `chat_tool_iteration_cap_hit_total`.
 */
function rejectWithToolIterationCap(
  res: Response,
  boundary: "anthropic_response" | "client_request",
  observed: number,
): void {
  chatToolIterationCapHitTotal.inc({ boundary });
  emitSecurityEvent({
    event: "chat_tool_cap_hit",
    severity: boundary === "client_request" ? "high" : "medium",
    details: `boundary=${boundary} observed=${observed} max=${MAX_TOOL_ITERATIONS}`,
  });
  res.status(422).json({
    error: "Перевищено ліміт tool-ітерацій у запиті",
    code: "MAX_TOOL_ITERATIONS",
    detail: { boundary, observed, max: MAX_TOOL_ITERATIONS },
  });
}

/**
 * Викликає `anthropicMessages` у циклі: якщо відповідь обірвалася на max_tokens
 * і в content-і лише text-блоки (без tool_use), доклеює partial текст як
 * assistant-повідомлення і робить ще один виклик. Повертає останню response/data,
 * але з content, де вся накопичена текстова частина зібрана в один text-блок.
 *
 * Якщо в content-і є tool_use — НЕ продовжуємо: tool_use завжди має йти
 * парою з tool_result, який буде робити клієнт. Без cap-а на max_tokens в моделі,
 * що пише tool_use+text разом — рідкісний варіант; якщо трапляється, пропускаємо без
 * continuation — клієнт обробить tool_use, а якщо text при цьому обрізаний — це прийнятно.
 */
async function callAnthropicWithContinuation(
  apiKey: string,
  basePayload: Record<string, unknown>,
  options: {
    timeoutMs?: number;
    endpoint: string;
    signal?: AbortSignal;
    promptVersion?: string;
    userId?: string;
  },
): Promise<{
  response: FetchResponse | null;
  data: AnthropicMessagesResponseData;
  continued: boolean;
}> {
  const baseMessages = (basePayload["messages"] as Array<unknown>) ?? [];
  let currentMessages: Array<unknown> = baseMessages.slice();
  const mergedTextChunks: string[] = [];
  let lastResponse: FetchResponse | null = null;
  let lastData: AnthropicMessagesResponseData = {};
  let lastNonTextBlocks: AnthropicContentBlock[] = [];
  let continued = false;

  // AI-DANGER: do not remove this continuation loop as an "optimization". When
  // Anthropic returns `stop_reason: "max_tokens"` with text-only content, this
  // re-issues the call with the partial text appended so the model resumes
  // exactly where it cut off — it is the safety net that hides short-capped
  // replies (parity with a manual "продовж"). Capped at MAX_TEXT_CONTINUATIONS.
  // (domain-invariants.md — PR #813.)
  for (let i = 0; i <= MAX_TEXT_CONTINUATIONS; i++) {
    if (options.signal?.aborted) break;

    const { response, data } = await anthropicMessages(
      apiKey,
      { ...basePayload, messages: currentMessages },
      // Умову приносить сам чат: `chatViaOpenRouter()` перевіряє і прапорець,
      // і наявність ключа. Зорові шляхи мають власний прапорець.
      { ...options, allowOpenRouter: chatViaOpenRouter() },
    );
    lastResponse = response;
    lastData = data as AnthropicMessagesResponseData;

    if (!response?.ok) {
      // Якщо вже є partial-текст з попередніх успішних викликів — повертаємо його
      // як успішний результат (graceful degradation): юзер бачить часткову
      // відповідь замість 5xx, квоту не рефандимо (перші виклики легітимно
      // обслужені). Без partial-у — помилку віддаємо caller-у на refund.
      // Синтезуємо ok-response, щоб caller-и (які роблять `if (!response.ok)`)
      // потрапили у success-гілку.
      if (continued && mergedTextChunks.length > 0) {
        return {
          response: new Response(null, { status: 200 }) as FetchResponse,
          data: {
            content: buildMergedContent(
              mergedTextChunks.join(""),
              lastNonTextBlocks,
            ),
          },
          continued,
        };
      }
      return { response, data: lastData, continued };
    }

    const content: AnthropicContentBlock[] = lastData?.content ?? [];
    const textParts = content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    if (textParts) mergedTextChunks.push(textParts);
    lastNonTextBlocks = content.filter((b) => b.type !== "text");

    const stopReason = lastData?.stop_reason;
    const hasToolUse = lastNonTextBlocks.some((b) => b.type === "tool_use");

    if (
      stopReason !== "max_tokens" ||
      hasToolUse ||
      i === MAX_TEXT_CONTINUATIONS ||
      !textParts
    ) {
      const mergedContent = buildMergedContent(
        mergedTextChunks.join(""),
        lastNonTextBlocks,
      );
      return {
        response,
        data: { ...lastData, content: mergedContent },
        continued,
      };
    }

    // Продовжуємо: rebuild з baseMessages + ОДИН assistant-msg з усім склеєним
    // текстом. Anthropic Messages API вимагає user/assistant alternation —
    // якщо просто .push-ити новий assistant-msg на кожній ітерації, на 2-му
    // continuation-і отримаємо два assistant-and-row → 400 від upstream.
    currentMessages = [
      ...baseMessages,
      { role: "assistant", content: mergedTextChunks.join("") },
    ];
    continued = true;
  }

  // Захисний fallback (не досяжний у нормальному флоу).
  return {
    response: lastResponse,
    data: {
      ...lastData,
      content: buildMergedContent(mergedTextChunks.join(""), lastNonTextBlocks),
    },
    continued,
  };
}

function buildMergedContent(
  mergedText: string,
  nonTextBlocks: AnthropicContentBlock[],
): AnthropicContentBlock[] {
  const out: AnthropicContentBlock[] = [];
  if (mergedText) out.push({ type: "text", text: mergedText });
  out.push(...nonTextBlocks);
  return out;
}

/**
 * POST /api/chat — основний чат з AI-асистентом з tool-calling та SSE-стрімом.
 * Middleware-и роутера гарантують ключ у `req.anthropicKey` і валідну квоту.
 */
export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const apiKey = (req as WithAnthropicKey).anthropicKey as string;

  // AbortController мапить client-disconnect (Express `req.close`) на
  // Anthropic-виклик, щоб upstream не дограв запит, на який уже ніхто не чекає
  // (і не спалив токени). Прокидається у всі виклики anthropicMessages*.
  const clientAbort = new AbortController();
  if (typeof req.on === "function") {
    req.on("close", () => {
      if (!res.writableEnded) clientAbort.abort();
    });
  }

  // AI-5 (`docs/90-work/audits/2026-09-01-product-audit/findings.md`) —
  // `assertAiQuota` (router middleware, `requireAiQuota()`) consumes a
  // daily-quota ticket BEFORE this handler runs. Everything from here down
  // to the first upstream `callAnthropicWithContinuation` /
  // `streamAnthropicToSse` call is OUR OWN validation, not an Anthropic
  // round trip — a 4xx here means the user got nothing for the ticket they
  // already paid. `refundQuotaOnUpstreamFailure` used to fire only around
  // the upstream calls themselves; every early-reject path below now
  // refunds too, so a 400/422 issued before upstream never burns quota.
  let context, messages, tool_results, tool_calls_raw, stream, preset;
  try {
    ({
      context = "",
      messages = [],
      tool_results,
      tool_calls_raw,
      stream,
      preset,
    } = parseBody(ChatRequestSchema, req));
  } catch (e) {
    await refundQuotaOnUpstreamFailure(req);
    throw e;
  }

  // B36 — `tool_results` і `tool_calls_raw` мусять приходити РАЗОМ або не
  // приходити взагалі. Рядок нижче (304) перевіряє лише `tool_results &&
  // tool_calls_raw`: запит з РІВНО ОДНИМ полем не потрапляв у ту гілку й
  // мовчки падав у "перший тур" — round-trip виконаних інструментів губився
  // без жодного сигналу клієнту (та без явного 400 у логах/Sentry).
  // `!!x` нормалізує порожній масив (`[]`, truthy в JS) так само, як і
  // непорожній — важлива лише присутність поля, не його довжина.
  if (!!tool_results !== !!tool_calls_raw) {
    await refundQuotaOnUpstreamFailure(req);
    throw new ValidationError(
      "tool_results і tool_calls_raw мають надходити разом",
      {
        code: "CHAT_TOOL_ROUND_TRIP_INCOMPLETE",
        cause: {
          hasToolResults: !!tool_results,
          hasToolCallsRaw: !!tool_calls_raw,
        },
      },
    );
  }

  // Резолвимо сесію один раз — для RAG-injection (перший тур) і для per-user
  // cost-ledger (`ai_usage_daily` рядок `u:<id>` поряд із global aggregate).
  // anon / lookup-error → null: cost тоді пишеться лише глобально.
  const sessionUser = await getSessionUser(req).catch(() => null);
  const ledgerUserId = sessionUser?.id ?? undefined;

  // Маскування перед відправкою за периметр (рішення founder-а #10).
  //
  // AI-DANGER: три входи чату мають РІЗНІ класи маскування, і плутати їх
  // не можна. `context` (знімок фінансів) і `tool_results` (відповіді
  // інструментів) — машинного походження, до них іде клас А + клас Б.
  // `messages` — те, що людина набрала руками; до них іде ЛИШЕ клас А.
  // Причина в `lib/llmRedaction.ts`: вирізати імʼя з фрази користувача —
  // це клас В, відкладений власником, і без повернення імені у відповідь
  // AI відповість «[особа] винна тобі 500».
  //
  // Кожен шлях маскується РІВНО ОДИН раз. Спокуса поставити маску і тут,
  // і глибше («про всяк випадок») робить кожну точку окремо необовʼязковою
  // — тоді видалення однієї з них не ловиться жодним тестом, бо друга
  // ще тримає. Ідемпотентність маски це приховує, а не рятує.
  const knownValues = await getCounterpartyNames(ledgerUserId);
  const maskedMessages = messages.map((m) => ({
    ...m,
    content: maskUserText(m.content),
  }));

  // Другий крок: клієнт виконав tool calls і повертає результати
  if (tool_results && tool_calls_raw) {
    // M7 — hard cap на кількість tool_use-блоків з клієнтського
    // боку. Schema допускає до 20 (`ToolResult.max(20)`), але семантично
    // легітимний потік ніколи не перевищує MAX_TOOL_ITERATIONS у одному
    // round-trip-і. Перевіряємо ДО `recordToolExecutions`, щоб маніпульований
    // payload не отруював `chat_tool_invocations_total{outcome="executed"}`.
    const incomingToolUses = tool_calls_raw.filter(
      (b) =>
        typeof b === "object" &&
        b !== null &&
        (b as { type?: unknown }).type === "tool_use",
    );
    if (incomingToolUses.length > MAX_TOOL_ITERATIONS) {
      // AI-5 — pre-upstream reject (client's own request is malformed), so
      // the ticket `assertAiQuota` already consumed for this turn goes back.
      await refundQuotaOnUpstreamFailure(req);
      rejectWithToolIterationCap(
        res,
        "client_request",
        incomingToolUses.length,
      );
      return;
    }
    // B32 — реєстр-allowlist на `name` + provenance-звʼязок кожного
    // `tool_use.id` з `tool_results`. Так само ДО `recordToolExecutions`,
    // щоб підроблений payload не отруював метрику раніше, ніж ми його
    // відхилимо 400-кою.
    try {
      validateToolCallsRawProvenance(tool_calls_raw, tool_results);
    } catch (e) {
      // AI-5 — same reasoning: still pre-upstream.
      await refundQuotaOnUpstreamFailure(req);
      throw e;
    }
    recordToolExecutions(tool_results, tool_calls_raw);
    // Великі `tool_result`-блоби (брифінги, місячні digest-и) зʼїдають
    // бюджет вхідних токенів і зривають continuation. Truncate на сервері,
    // повний blob — у Sentry breadcrumb для debug-у.
    // Маска → усічення → `<tool_output>`-огорожа + сканер інʼєкцій. Порядок
    // між кроками — інваріант безпеки (маска мусить бути ПЕРЕД усіченням, бо
    // те кладе повний оригінал у Sentry-breadcrumb); тому всі три живуть
    // одним конвеєром у `prepareToolResults`, а не тут поодинці.
    const toolResultMessages = prepareToolResults(
      tool_results,
      tool_calls_raw,
      {
        knownValues,
        requestId: als.getStore()?.requestId ?? undefined,
      },
    );

    // Беремо лише останнє user-повідомлення (питання що спричинило tool call)
    const lastUserMsg = [
      ...(Array.isArray(maskedMessages) ? maskedMessages : []),
    ]
      .reverse()
      .find(
        (m) =>
          m?.role === "user" &&
          typeof m?.content === "string" &&
          m.content.trim(),
      );

    const fullMessages = [
      ...(lastUserMsg ? [{ role: "user", content: lastUserMsg.content }] : []),
      { role: "assistant", content: tool_calls_raw },
      { role: "user", content: toolResultMessages },
    ];

    // AI-CONTEXT: cap на tool-result відповідь — це фінальний текст для
    // юзера після того як модель отримала дані з tool_result (брифінги,
    // підсумки, аналіз бюджету). Markdown-таблиці + кілька секцій по-українськи
    // легко займають 1.5–2k токенів; нижчі значення обрізали відповідь
    // посеред речення. Тримаємо із запасом — модель сама зупиниться раніше,
    // якщо контент закінчився.
    // Pro tiered degradation: the tool-result synthesis is the expensive
    // Sonnet turn, so it carries the tier. `resolveProTier` returns the
    // Anthropic model for this Pro user's daily tier (premium Sonnet →
    // standard Haiku 4.5 → floor Haiku 3 — all Anthropic, so streaming +
    // tool-use + prompt-cache keep working). Free та анон ідуть standard-ним
    // тиром (2026-08-06: раніше — premium; це була інверсія проти Pro, який
    // після 20 викликів доби падає на standard). founder/flag-off і fail-open
    // шляхи лишаються на premium. The first-turn router below is untiered.
    const proTier = await resolveProTier(req, res, "chat");
    const payload = {
      model: proTier.model,
      max_tokens: 2500,
      // Preset іде і в tool-result тур: інструкція інтервʼю має діяти й на
      // синтезі після `remember`, інакше модель «забуває» ліміт у 4
      // повідомлення рівно там, де підбиває підсумок.
      system: buildSystem(maskMachineText(context, knownValues), preset),
      // Tools для ЦІЄЇ моделі: Pro-деградація може підмінити Sonnet на
      // Haiku, а ops — на будь-що через `AI_PRO_*_CHAT_MODEL`. Tool search
      // підтримують не всі моделі, тож payload будується під фактичну.
      //
      // На турі синтезу шлемо лише згадані в реплеї визначення: `tool_use`
      // звідси нікуди не доїжджає (нижче — `extractAnthropicText`, у стрімі —
      // лише `text_delta`), а під шлюзом без tool search тут інакше їхав би
      // весь реєстр — ~18k токенів без кешу на кожному турі. Деталі й межі —
      // `promptCache.ts::buildSynthesisToolsPayload`.
      tools: buildSynthesisToolsPayload(
        proTier.model,
        toolNamesFromRawCalls(tool_calls_raw),
      ),
      messages: fullMessages,
    };

    if (stream) {
      await streamAnthropicToSse(
        req,
        res,
        apiKey,
        payload,
        "chat-tool-result",
        clientAbort.signal,
        SYSTEM_PROMPT_VERSION,
        ledgerUserId,
      );
      return;
    }

    let response, data;
    try {
      ({ response, data } = await callAnthropicWithContinuation(
        apiKey,
        payload,
        {
          timeoutMs: CHAT_TOOL_TIMEOUT_MS,
          endpoint: "chat-tool-result",
          signal: clientAbort.signal,
          promptVersion: SYSTEM_PROMPT_VERSION,
          ...(ledgerUserId !== undefined ? { userId: ledgerUserId } : {}),
        },
      ));
    } catch (e) {
      await refundQuotaOnUpstreamFailure(req);
      throw e;
    }

    if (!response?.ok) {
      await refundQuotaOnUpstreamFailure(req);
      throw makeAiProviderError({
        rawProviderMessage: data?.error?.message,
        status: response?.status,
      });
    }

    const text = extractAnthropicText(data);
    res.status(200).json({ text: text || "Готово." });
    return;
  }

  // Перший запит — може повернути tool_use або текст
  const cleaned = sanitizeMessages(maskedMessages);
  if (cleaned.length === 0) {
    // AI-5 — pre-upstream reject, same as above: refund the ticket.
    await refundQuotaOnUpstreamFailure(req);
    res.status(400).json({ error: "Немає повідомлень" });
    return;
  }

  // Coach-correlations surfacing: підмішуємо ≤3 найсвіжіші крос-модульні
  // кореляції з weekly-digest памʼяті коуча (`coach_memory`, WP3) у system
  // context **тільки на першому турі**, тим самим шляхом що й RAG нижче.
  // Дешевий point-lookup (<1мс) — на відміну від RAG не ходить у Voyage,
  // тож fail-safe і без помітної затримки.
  const correlationsBlock = sessionUser?.id
    ? await getCoachCorrelationsBlock(sessionUser.id)
    : "";
  const contextWithCorrelations = correlationsBlock
    ? `${context}\n${correlationsBlock}`
    : context;

  // RAG-injection: підмішуємо top-K схожих ai_memories у system context
  // **тільки на першому турі** (тут), не на tool-result-турі вище. Sync
  // за дизайном: блокуємо handler на ≤RAG_TIMEOUT_MS перш ніж дзвонити
  // Anthropic. Failure-mode → no-op (повертає baseContext).
  const augmentedContext = maskMachineText(
    await buildRagContext({
      userId: sessionUser?.id ?? null,
      baseContext: contextWithCorrelations,
      messages: cleaned,
    }),
    knownValues,
  );

  const firstTurnSystem = buildSystem(augmentedContext, preset);

  // Response-cache (перший тур): ключ від фактичного system+messages. `system`
  // несе живий фінансовий снапшот + RAG + coach-кореляції, тож будь-яка зміна
  // даних → інший ключ → miss (інвалідація автоматична, stale віддати не
  // можна). Hit пропускає весь Anthropic-виклик і continuation-loop. Кешуємо
  // лише success-відповіді цього туру (нижче), не 422/error. Див.
  // `chatResponseCache.ts`.
  const cacheKey = buildChatCacheKey({
    userId: ledgerUserId,
    model: env.CHAT_MODEL_FIRST_TURN,
    system: firstTurnSystem,
    messages: cleaned,
  });
  const cached = getCachedChatResponse(cacheKey);
  if (cached) {
    res.status(cached.status).json(cached.body);
    return;
  }

  // ПІСЛЯ кеш-виходу навмисно: `activeModules` потрібен лише для `tools:`
  // у виклику нижче, а попадання в response-cache має пропускати всю
  // роботу — інакше кожна закешована відповідь усе одно платила б SELECT-ом
  // у `user_preferences`.
  //
  // Best-effort: будь-яка помилка читання — повний реєстр, бо втратити
  // потрібний tool дорожче, ніж заплатити за зайвий. Анонім теж отримує
  // повний.
  const activeModules = sessionUser?.id
    ? await getUserPreferences(pool, sessionUser.id)
        .then((p) => p.activeModules)
        .catch(() => null)
    : null;

  let response, data;
  try {
    ({ response, data } = await callAnthropicWithContinuation(
      apiKey,
      // AI-CONTEXT: перший крок чату — модель може повернути text або tool_use.
      // Direct-text відповіді на питання типу «що з фінансами?» потребують
      // більше за 600 токенів, бо це часто структуровані пояснення з
      // markdown-форматуванням. Тримаємо нижче за tool-result cap, бо тут
      // зазвичай немає таблиць/брифінгів.
      // Haiku: ~4× дешевший за Sonnet на першому турі ($1 vs $3 /1M input,
      // $5 vs $15 /1M output); підтримує той самий tool-calling формат.
      // Tool-result synthesis (другий тур) лишається на Sonnet — там важлива
      // якість складних звітів. Обидві моделі env-kеровані
      // (CHAT_MODEL_FIRST_TURN / CHAT_MODEL_SYNTHESIS) — ре-тиринг без редеплою.
      {
        model: env.CHAT_MODEL_FIRST_TURN,
        max_tokens: 1500,
        system: firstTurnSystem,
        tools: buildToolsPayload(env.CHAT_MODEL_FIRST_TURN, activeModules),
        // 3-й cache breakpoint: кешуємо префікс історії діалогу, щоб наступний
        // тур читав попередні повідомлення з кешу замість повного re-білінгу.
        messages: applyMessagesCacheBreakpoint(cleaned),
      },
      {
        timeoutMs: CHAT_TOOL_TIMEOUT_MS,
        endpoint: "chat",
        signal: clientAbort.signal,
        promptVersion: SYSTEM_PROMPT_VERSION,
        ...(ledgerUserId !== undefined ? { userId: ledgerUserId } : {}),
      },
    ));
  } catch (e) {
    await refundQuotaOnUpstreamFailure(req);
    throw e;
  }

  if (!response?.ok) {
    await refundQuotaOnUpstreamFailure(req);
    throw makeAiProviderError({
      rawProviderMessage: data?.error?.message,
      status: response?.status,
    });
  }

  const content: AnthropicContentBlock[] = data?.content || [];
  const toolUses = content.filter((b) => b.type === "tool_use");
  const textParts = content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");

  // M7 — model-side cap. Anthropic може повернути довгий ланцюг tool-call-ів
  // без тексту: malicious / malfunctioning prompt здатен розкрутити
  // tool_use → tool_result → tool_use round-tripами безкінечно. Якщо в
  // одній відповіді >MAX_TOOL_ITERATIONS блоків `tool_use` — це вже runaway,
  // refundимо квоту і повертаємо 422 ДО `recordToolProposals`, щоб не
  // забруднити `chat_tool_invocations_total{outcome="proposed"}` легітимними
  // інструментами зі сміттєвої відповіді.
  if (toolUses.length > MAX_TOOL_ITERATIONS) {
    await refundQuotaOnUpstreamFailure(req);
    rejectWithToolIterationCap(res, "anthropic_response", toolUses.length);
    return;
  }

  if (toolUses.length > 0) {
    recordToolProposals(content);
    const body = {
      text: textParts || null,
      tool_calls: toolUses.map((t) => ({
        id: t.id,
        name: t.name,
        input: t.input,
      })),
      tool_calls_raw: content,
    };
    // Кешуємо tool_use-пропозицію: вона детермінована для цього prompt-у, а
    // клієнт усе одно виконає інструменти проти ЖИВИХ даних — тож stale немає.
    setCachedChatResponse(cacheKey, { status: 200, body });
    res.status(200).json(body);
    return;
  }

  const textBody = { text: textParts || "Немає відповіді від AI." };
  setCachedChatResponse(cacheKey, { status: 200, body: textBody });
  res.status(200).json(textBody);
}

function sanitizeMessages(messages: unknown): ClientChatMessage[] {
  const cleaned = (Array.isArray(messages) ? messages : [])
    .filter(
      (m): m is ClientChatMessage =>
        !!m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .slice(-12);

  // Anthropic вимагає чергування user/assistant і початок з user.
  //
  // B35: на дублікаті ролі поспіль тримаємо НОВІШЕ повідомлення, не старіше.
  // `cleaned` іде у хронологічному порядку (найстаріше → найновіше), тож
  // коли два `user`-и опиняються поспіль (типовий сценарій: тур обірвався
  // без асистентської репліки — мережевий збій, refresh посеред стріму),
  // старе `continue` пропускало САМЕ НОВЕ повідомлення і модель відповідала
  // на застаріле питання. Гілка tool-result вище (`lastUserMsg`,
  // `.reverse().find(...)`) уже бере найновіше — цей цикл тепер узгоджений
  // із тим самим інваріантом.
  const result: ClientChatMessage[] = [];
  for (const m of cleaned) {
    if (result.length > 0 && result[result.length - 1]!.role === m.role) {
      result[result.length - 1] = m;
      continue;
    }
    result.push(m);
  }
  while (result.length > 0 && result[0]!.role !== "user") result.shift();
  while (result.length > 0 && result[result.length - 1]!.role !== "user")
    result.pop();

  return result;
}
