import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, chatApi, isApiError } from "@shared/api";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { useOnlineStatus } from "@shared/hooks/useOnlineStatus";
import { chatKeys, hubKeys } from "@shared/lib/api/queryKeys";
import { perfMark, perfEnd } from "@shared/lib/ui/perf";
import { safeReadLS } from "@shared/lib/storage/storage";
import {
  CONTEXT_TTL_MS,
  cancelIdle,
  consumeHubChatSse,
  friendlyApiError,
  friendlyChatError,
  getActiveModule,
  isHelpCommand,
  makeAssistantMsg,
  makeUserMsg,
  newMsgId,
  requestIdle,
  type ActiveModule,
} from "../../lib/hubChatUtils";
import { buildContextMeasured } from "../../lib/hubChatContext";
import { executeActions } from "../../lib/hubChatActions";
import { logger } from "@shared/lib";
import {
  ANALYTICS_EVENTS,
  getToolModule,
  type ChatPreset,
} from "@sergeant/shared";
import { trackEvent } from "../../observability/analytics";
import { parseToolCalls } from "./toolCallSchema";
import { keepReplayableToolBlocks } from "./replayableToolBlocks";
import {
  useDestructiveConfirm,
  type UseDestructiveConfirmResult,
} from "./useDestructiveConfirm";
import { summarizeDestructiveToolInput } from "./destructiveConfirmSummary";
import { VOICE_KEYWORDS, speak } from "../../lib/hubChatSpeech";
import { buildActionCard } from "../../lib/hubChatActionCards";
import { setHubStreaming } from "../streamingStore";
import type { ChatActionCard } from "../../lib/hubChatActionCards";
import { useFinykHubPreview } from "../useFinykHubPreview";
import type { HubChatSession } from "../hubChatSessions";
import { usePlan } from "../../billing/usePlan";
import { requiresConfirmation } from "@sergeant/shared";

type ChatMessage = HubChatSession["messages"][number];
const CANCELLED_BY_USER_TEXT = "Скасовано, нічого не змінено.";
const AUTO_TTS_ENABLED_KEY = "sergeant:hub-chat:auto-tts:v1";
const HUB_CHAT_HELP_TEXT = [
  "Ось коротка довідка по командам:",
  "",
  "• /help: показати цю довідку.",
  "• Напиши дію звичайними словами: «додай витрату 120 грн на каву», «запиши тренування», «що було цього тижня?»",
  "• Кнопка з ? біля поля вводу теж відкриває цю довідку.",
].join("\n");

/**
 * Audit 03 F15 (perf): cap the accumulated assistant text length per stream.
 * `consumeHubChatSse` already bounds the raw transport (256 KB total / 8 KB
 * per line), but a runaway model can still legitimately stream many small
 * deltas — each `acc += delta` triggers a full `setMessages(... .map ...)`
 * rerender (chat list + markdown reparse). Beyond this many chars the answer
 * is no longer readable on a phone anyway, so we abort the controller and let
 * the friendly-error path surface "Відповідь занадто довга". A char is a cheap
 * proxy for bytes here — UTF-16 code units, ~256 KB worst case for BMP text.
 */
const MAX_STREAM_CHARS = 256 * 1024;

function isAutoTtsEnabled(): boolean {
  return safeReadLS<boolean>(AUTO_TTS_ENABLED_KEY) === true;
}

/**
 * Скільки ПОСЛІДОВНИХ відправок несуть preset, рахуючи seed-повідомлення.
 *
 * AI-CONTEXT: preset мусить пережити не лише перший хід — інтервʼю
 * багатоходове, і без цього інструкція зникала б після першої відповіді,
 * а модель поверталась би до загальної поведінки рівно там, де користувач
 * почав відповідати. Але й «назавжди» не годиться: доївши інтервʼю,
 * людина питає «скільки я витратив на каву» в тому ж вікні — з активним
 * preset-ом це і поведінка не та, і списання з preset-відра квоти замість
 * денного.
 *
 * Числа дзеркалять самі інструкції (`apps/server/.../chatPresets.ts`):
 * інтервʼю — seed + до 4 відповідей користувача; доповнення — seed +
 * одне уточнення.
 */
const PRESET_TURNS: Record<ChatPreset, number> = {
  profile_interview: 5,
  profile_add_info: 2,
};

export interface UseChatSendOptions {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  initialMessage?: string | undefined;
  autoSendInitial?: boolean | undefined;
  onOpenCatalogue?: (() => void) | undefined;
  /** Сценарний режим (кнопки секції «Памʼять ШІ»). Див. `PRESET_TURNS`. */
  preset?: ChatPreset | undefined;
}

export interface UseChatSendResult {
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  loading: boolean;
  speaking: boolean;
  setSpeaking: React.Dispatch<React.SetStateAction<boolean>>;
  online: boolean;
  hasData: boolean;
  contextState: { status: string; ts: number };
  activeModule: ActiveModule | null;
  /** Send `text` (or the current `input`). `fromVoice` flag triggers TTS reply. */
  send: (text?: string, fromVoice?: boolean) => Promise<void>;
  /** Abort the in-flight request (cancel button or close while streaming). */
  cancelInFlight: () => void;
  paywallOpen: boolean;
  /**
   * Free-tier денний ліміт AI-запитів (`GET /api/chat/usage::limit`).
   * `null`, поки запит ще не відповів або план Pro — той самий кеш, з
   * якого читає `ChatUsageCounter`, тож пейвол-копія не тримає власного
   * числа.
   */
  usageLimit: number | null;
  /** Гейт підтвердження незворотних інструментів (канон §8). */
  confirmDestructive: UseDestructiveConfirmResult;
  closePaywall: () => void;
  /** Imperative send ref — used by the autofocus / quick-action handlers. */
  sendRef: React.MutableRefObject<
    ((text?: string, fromVoice?: boolean) => Promise<void>) | null
  >;
  /** Imperative focus ref — passed to ChatInput so quick actions can refocus. */
  focusInputRef: React.MutableRefObject<(() => void) | null>;
}

/**
 * Owns the send pipeline for HubChat: input/loading/speaking state,
 * the cached chat context, the online indicator, and the `send`
 * function itself. Keeps the abort-controller lifecycle (cancel
 * button, unmount during stream) and the TTS hand-off.
 *
 * The Finyk preview cache is observed here so the chat context is
 * rebuilt whenever Mono syncs / disconnects (driven by RQ
 * invalidation of `hubKeys.preview("finyk")`), and tool-call results
 * also invalidate the same query so subsequent streams see the
 * up-to-date snapshot.
 */
export function useChatSend({
  messages,
  setMessages,
  initialMessage,
  autoSendInitial,
  onOpenCatalogue,
  preset,
}: UseChatSendOptions): UseChatSendResult {
  const toast = useToast();
  const queryClient = useQueryClient();
  const finykPreview = useFinykHubPreview();
  const { isPro } = usePlan();
  const hasData = finykPreview.data?.hasMonoData ?? false;
  const online = useOnlineStatus();

  // Джерело істини для пре-гейту пейволу — той самий `GET /api/chat/usage`,
  // з якого читає `ChatUsageCounter` (спільний RQ-кеш `chatKeys.usage`).
  // Раніше тут стояв окремий localStorage-лічильник повідомлень: рахував
  // не те (повідомлення, а не одиниці квоти) і не там (per-device, сервер —
  // per-user), тож два ходи з інструментом розходились із серверним
  // рахунком удвічі. `enabled: !isPro` — Pro не гейтиться взагалі, запит
  // не потрібен.
  const { data: usageData } = useQuery({
    queryKey: chatKeys.usage,
    queryFn: ({ signal }) => chatApi.usage({ signal }),
    enabled: !isPro,
    staleTime: 30_000,
    retry: false,
  });

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const confirmDestructive = useDestructiveConfirm();
  // Беремо саме `request` у залежності `send`: сам обʼєкт хука
  // перестворюється на кожну зміну `pending`, і залежність від нього
  // пересоздавала б `send` щоразу, коли відкривається/закривається діалог.
  // `request` стабільний (useCallback без залежностей).
  const requestDestructiveConfirm = confirmDestructive.request;

  // AbortController for cancelling the active request (cancel button).
  // Lives in a ref because it does not affect render — we just need a
  // way to interrupt `chatApi.send`/`stream` and immediately return
  // the UI to ready (loading=false).
  const abortRef = useRef<AbortController | null>(null);
  const lastWasVoice = useRef(false);

  // Context cache.
  const contextRef = useRef({ text: "", ts: 0 });
  const [contextState, setContextState] = useState({ status: "idle", ts: 0 });
  const idleJobRef = useRef<ReturnType<typeof requestIdle> | null>(null);

  const scheduleContextBuild = useCallback((reason = "auto", force = false) => {
    const now = Date.now();
    if (
      !force &&
      contextRef.current.text &&
      now - contextRef.current.ts < CONTEXT_TTL_MS
    ) {
      setContextState((s) =>
        s.status === "ready"
          ? s
          : { status: "ready", ts: contextRef.current.ts },
      );
      return;
    }
    if (idleJobRef.current) cancelIdle(idleJobRef.current);
    setContextState({ status: "building", ts: contextRef.current.ts || 0 });
    idleJobRef.current = requestIdle(() => {
      idleJobRef.current = null;
      const m = perfMark(`hubchat:contextBuild(${reason})`);
      const text = buildContextMeasured();
      contextRef.current = { text, ts: Date.now() };
      perfEnd(m, { len: text?.length || 0 });
      setContextState({ status: "ready", ts: contextRef.current.ts });
    });
  }, []);

  useEffect(() => {
    scheduleContextBuild("mount", true);
    return () => {
      if (idleJobRef.current) cancelIdle(idleJobRef.current);
    };
  }, [scheduleContextBuild]);

  // Rebuild context whenever the Finyk preview snapshot flips
  // (Monobank sync, clear-cache, disconnect, or a cross-tab storage
  // event). Driven by RQ invalidation of `hubKeys.preview("finyk")`.
  const finykPreviewUpdatedAt = finykPreview.dataUpdatedAt;
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    scheduleContextBuild("finyk-cache", true);
  }, [finykPreviewUpdatedAt, scheduleContextBuild]);

  const activeModule = useMemo(() => getActiveModule(), []);

  // TTS speaking state poll.
  useEffect(() => {
    if (!speaking) return;
    const id = setInterval(() => {
      if (!window.speechSynthesis?.speaking) setSpeaking(false);
    }, 300);
    return () => clearInterval(id);
  }, [speaking]);

  const sendRef = useRef<
    ((text?: string, fromVoice?: boolean) => Promise<void>) | null
  >(null);
  // Callback ref into ChatInput's `.focus()` — used after prefill from
  // ChatQuickActions so focus lands on the input immediately.
  const focusInputRef = useRef<(() => void) | null>(null);

  const maybeSpeak = useCallback((text: string) => {
    speak(text);
    setSpeaking(true);
  }, []);

  // Лічильник ходів, що ще несуть preset. Ref, а не state: `send`
  // читає його всередині і не має перестворюватись на кожному ході.
  const presetTurnsRef = useRef(preset ? PRESET_TURNS[preset] : 0);

  const send = useCallback(
    async (text?: string, fromVoice = false) => {
      const msg = (text || input).trim();
      if (!msg || loading) return;

      if (isHelpCommand(msg)) {
        // `/help` (and the composer's "?" button) open the assistant
        // capability catalogue — a richer, discoverable, searchable
        // command list — instead of dumping static text into the thread.
        // Never spends an AI request. When no catalogue handler is wired
        // (embedded/test contexts) fall back to the inline help text so
        // the command is never a silent no-op.
        setInput("");
        if (onOpenCatalogue) {
          onOpenCatalogue();
          return;
        }
        setMessages((m) => [
          ...m,
          makeUserMsg(msg),
          makeAssistantMsg(HUB_CHAT_HELP_TEXT),
        ]);
        return;
      }

      if (!online) {
        setMessages((m) => [
          ...m,
          makeUserMsg(msg),
          makeAssistantMsg(
            "Немає підключення. Асистент працює лише онлайн, спробуй ще раз, коли зʼявиться інтернет.",
          ),
        ]);
        setInput("");
        return;
      }

      // Хід у сценарному режимі. Списується з окремого тижневого відра на
      // сервері (`resolvePresetBudget` у `aiQuota.ts`), тож денний лічильник
      // його не рахує і пейвол на ньому не спрацьовує: інакше онбординг
      // упирався б у paywall посеред інтервʼю — рівно та проблема, заради
      // якої відро й заведено. Вичерпання preset-відра приходить окремим
      // 429 `AI_QUOTA_PRESET` з тексту сервера.
      const turnPreset = presetTurnsRef.current > 0 ? preset : undefined;
      if (turnPreset) presetTurnsRef.current -= 1;

      if (!isPro && !turnPreset) {
        if (
          usageData &&
          usageData.remaining != null &&
          usageData.remaining <= 0
        ) {
          setPaywallOpen(true);
          return;
        }
      }

      const shouldSpeak =
        fromVoice ||
        lastWasVoice.current ||
        (isAutoTtsEnabled() && VOICE_KEYWORDS.test(msg));
      lastWasVoice.current = false;

      const userMsg = makeUserMsg(msg);
      const next = [...messages, userMsg];
      setMessages(next);
      setInput("");
      setLoading(true);
      setHubStreaming(true);

      // Чисельник воронки. Стоїть ПІСЛЯ всіх гейтів (help / offline /
      // пейвол), бо ті гілки не витрачають AI-запит і не мають рахуватися
      // як «звернувся до коуча». `length`, не текст: контракт події
      // (`analyticsEvents.ts`) навмисно не несе body повідомлення.
      const sentAt = Date.now();
      trackEvent(ANALYTICS_EVENTS.HUBCHAT_MESSAGE_SENT, {
        length: msg.length,
        fromVoice,
        ...(activeModule ? { module: activeModule } : {}),
      });

      const history = next
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.text }));

      // Fresh AbortController per send. If a previous one is still
      // alive (shouldn't be — `send` guards on `loading`) we abort it
      // for safety. Signal is forwarded into chatApi.send / stream.
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const signal = ac.signal;

      // Auto-abort after 90 s — prevents the UI from hanging forever if
      // the Anthropic stream stalls mid-response or the server drops the
      // SSE connection silently.
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        ac.abort();
      }, 90_000);

      try {
        const context = contextRef.current.text || buildContextMeasured();
        if (!contextRef.current.text) {
          contextRef.current = { text: context, ts: Date.now() };
          setContextState({ status: "ready", ts: contextRef.current.ts });
        }

        let data;
        try {
          data = await chatApi.send(
            {
              context,
              messages: history,
              ...(turnPreset ? { preset: turnPreset } : {}),
            },
            { signal },
          );
        } catch (err) {
          // Rewrite `message` to user-friendly while staying inside
          // `ApiError` — the outer `friendlyChatError` should see the
          // same error shape as every other call site.
          if (isApiError(err) && err.kind === "http") {
            throw new ApiError({
              kind: "http",
              message: friendlyApiError(
                err.status,
                err.serverMessage,
                (err.body as { code?: string } | undefined)?.code,
              ),
              status: err.status,
              body: err.body,
              bodyText: err.bodyText,
              url: err.url,
              cause: err,
            });
          }
          if (isApiError(err) && err.kind === "parse") {
            throw new ApiError({
              kind: "parse",
              message: "Некоректна відповідь сервера",
              body: err.body,
              bodyText: err.bodyText,
              url: err.url,
              cause: err,
            });
          }
          throw err;
        }

        let replyLength = 0;
        const hadTools = Boolean(data.tool_calls && data.tool_calls.length > 0);

        if (data.tool_calls && data.tool_calls.length > 0) {
          // Audit 03 F3 (critical/security): every entry must clear the
          // structural firewall — `{id: string, name: string, input: object}`
          // — before any handler runs. On failure we drop the whole batch,
          // toast the user, and fall back to plain-text rendering. Spending
          // tokens > silently writing to LocalStorage with a corrupted
          // payload.
          const parsed = parseToolCalls(data.tool_calls);
          if (!parsed.ok) {
            logger.warn("[hub-chat] tool_calls schema mismatch", {
              issues: parsed.issues,
            });
            // Модель повернула структурно биті tool_calls. Для користувача
            // це збій («Не вдалося виконати дію»), тож і в телеметрії це
            // помилка, а не тиха деградація до тексту — інакше зламаний
            // інструмент виглядав би як звичайна текстова відповідь.
            trackEvent(ANALYTICS_EVENTS.HUBCHAT_ERROR, { kind: "parse" });
            toast.error("Не вдалося виконати дію", undefined, {
              label: "Спробувати знову",
              onClick: () => void sendRef.current?.(msg),
            });
            const fallback = data.text || "Немає відповіді.";
            setMessages((m) => [...m, makeAssistantMsg(fallback)]);
            if (shouldSpeak) maybeSpeak(fallback);
            return;
          }
          const toolCalls = parsed.value;

          // Канон §8 — «Деструктивне тільки з підтвердженням», причому
          // ПЕРЕД виконанням. Гейт стоїть тут, а не всередині хендлерів:
          // хендлери — чисті функції над сховищем, у них немає UI, і
          // підтвердження в кожному з них розповзлось би шістьма копіями.
          const destructive = toolCalls.filter((tc) =>
            requiresConfirmation(tc.name as string),
          );
          if (destructive.length > 0) {
            const approved = await requestDestructiveConfirm(
              destructive.map((tc) => {
                const toolName = tc.name as string;
                // `exactOptionalPropertyTypes` — `summary?: string` means
                // "present and a string, or absent", never "present and
                // `undefined`". Omit the key entirely for tools without a
                // summary instead of assigning `undefined` to it.
                const summary = summarizeDestructiveToolInput(
                  toolName,
                  tc.input as Record<string, unknown>,
                );
                return summary
                  ? { name: toolName, summary }
                  : { name: toolName };
              }),
            );
            if (!approved) {
              // Скасування — весь батч, а не лише деструктивна його
              // частина. Часткове виконання лишило б стан, якого
              // користувач не обмірковував: він відмовився від «видали
              // й перепиши», а отримав би половину.
              //
              // Другий запит до моделі теж не робимо: `tool_calls_raw`
              // йде лише в ньому, тож жоден `tool_use` не лишається без
              // пари — протокол не ламається, а токени не палимо.
              setMessages((m) => [
                ...m,
                makeAssistantMsg(CANCELLED_BY_USER_TEXT),
              ]);
              return;
            }
          }

          const handlerResults = await executeActions(
            toolCalls as Parameters<typeof executeActions>[0],
          );

          // `hubchat_tool_invoked` — подія стояла в каталозі
          // (`ANALYTICS_EVENTS`) із квітня, закріплена тестом, і НІХТО її не
          // слав: панель tool-leaderboard у `hubchat.json` була порожня
          // назавжди, а виглядала як «інструментами не користуються».
          //
          // Емітимо тут, а не в кожному хендлері: це єдина точка, крізь яку
          // проходить кожен виконаний tool-call, тож розповзання на шість
          // копій виключене — той самий аргумент, що для гейта підтверджень
          // вище.
          //
          // `success` береться зі СТРУКТУРНОГО `ok`, а не з префікса тексту:
          // рядок «Помилка виконання: …» — це копірайт, який колись
          // перепишуть, і телеметрія тихо почала б рахувати провали успіхами.
          for (const r of handlerResults) {
            trackEvent(ANALYTICS_EVENTS.HUBCHAT_TOOL_INVOKED, {
              tool: r.name,
              module: getToolModule(r.name),
              success: r.ok,
              latency_ms: r.latencyMs,
            });
          }
          const toolResults = toolCalls.map((tc, idx) => ({
            tool_use_id: tc.id,
            content: handlerResults[idx]?.result ?? "",
          }));

          // Mutator handlers (`create_transaction`, `mark_habit_done`,
          // `log_meal`, `create_habit`, …) return `{ undo }` alongside
          // the textual result. Show the standard 5-second undo toast
          // for each — `showUndoToast` returns its own timer
          // (overlap-stack is acceptable: one tool-call covers 99 %
          // of turns; in the rare 2-3 simultaneous mutations case the
          // user sees one toast per change). Read-only handlers
          // (search, totals, summaries) have no `undo` so no toast.
          for (const hr of handlerResults) {
            if (hr.undo) {
              const undoFn = hr.undo;
              showUndoToast(toast, {
                msg: hr.result,
                onUndo: undoFn,
              });
            }
          }

          // Build action cards for known tools. Unknown tool → null,
          // text-only fallback.
          const builtCards = toolCalls.map((tc, idx) =>
            buildActionCard({
              name: tc.name as string,
              input: tc.input as Record<string, unknown>,
              result: toolResults[idx]?.content || "",
            }),
          );
          const cards: ChatActionCard[] = builtCards.filter(
            (c): c is ChatActionCard => c !== null,
          );

          /**
           * Текстовий рядок «✓ …» — фолбек для інструментів БЕЗ картки.
           *
           * AI-CONTEXT (2026-08-07): раніше він друкувався для кожного
           * виклику незалежно від картки, тобто дублював її слово в слово —
           * і разом із тим виносив у чат сирий результат виконавця. Для
           * `remember` це означало UUID запису памʼяті
           * (`✓ Запамʼятав: Звати Діма (Інше, id:5c47fa7f-…)`) просто над
           * карткою, яка каже те саме людськими словами. Виглядало як
           * переказ моделі, але клеїв рядок саме цей код.
           *
           * Картка й рядок зʼявляються ОДНОЧАСНО (обидва летять у той самий
           * `setMessages`), тож там, де картка є, рядок не додає нічого.
           * Там, де її немає (невідомий tool), він лишається єдиним
           * підтвердженням — тому не викидаємо його зовсім.
           *
           * U+2713 CHECK MARK — типографічний символ, не emoji: наслідує
           * колір/шрифт повідомлення (emoji ✅ завжди зелена й чужа
           * токенам). Re-audit §7.2 — системний статус-маркер.
           */
          const uncardedText = toolResults
            .filter((_, idx) => builtCards[idx] == null)
            .map((r) => `✓ ${r.content}`)
            .join("\n");
          const prefix = uncardedText ? `${uncardedText}\n\n` : "";

          const assistantId = newMsgId();
          setMessages((m) => [
            ...m,
            {
              id: assistantId,
              role: "assistant",
              text: prefix,
              ...(cards.length > 0 ? { cards } : {}),
            },
          ]);

          let followUpText = "";
          try {
            const res2 = await chatApi.stream(
              {
                context: contextRef.current.text || context,
                messages: history,
                tool_results: toolResults,
                // Сервер приймає в `tool_calls_raw` лише блоки
                // `tool_use | server_tool_use | tool_search_tool_result`
                // (B32: інакше клієнт може вписати довільний текст від імені
                // асистента — єдиної ролі без огорожі). Модель же штатно
                // повертає ще й `text`-преамбулу перед викликом інструмента,
                // і досі ми відбивали `tool_calls_raw` назад ДОСЛІВНО.
                //
                // Тому фільтруємо тут, ТІЄЮ САМОЮ схемою, що валідує сервер —
                // не власним списком типів, який мовчки розʼїхався б із
                // серверним при наступній зміні. Преамбула не губиться для
                // користувача: вона вже дострімлена в UI вище.
                tool_calls_raw: keepReplayableToolBlocks(data.tool_calls_raw),
                stream: true,
                // Той самий preset і на турі синтезу: інструкція має діяти
                // й після `remember`, і цей запит теж має списатись із
                // preset-відра, а не з денного.
                ...(turnPreset ? { preset: turnPreset } : {}),
              },
              { signal },
            );

            const ct = res2.headers.get("content-type") || "";
            if (res2.ok && ct.includes("text/event-stream")) {
              let acc = "";
              await consumeHubChatSse(res2, (delta) => {
                if (acc.length + delta.length > MAX_STREAM_CHARS) {
                  // Abort the in-flight controller so the reader stops pulling
                  // chunks, then throw — the surrounding catch renders the
                  // friendly "Відповідь занадто довга" tail on this turn.
                  ac.abort();
                  throw new Error("Відповідь занадто довга");
                }
                acc += delta;
                setMessages((m) =>
                  m.map((x) =>
                    x.id === assistantId ? { ...x, text: prefix + acc } : x,
                  ),
                );
              });
              followUpText = acc;
            } else {
              const raw2 = await res2.text();
              let data2 = {};
              try {
                data2 = raw2 ? JSON.parse(raw2) : {};
              } catch {
                data2 = { error: raw2 };
              }
              const parsed = data2 as {
                error?: string;
                text?: string;
                code?: string;
              };
              if (!res2.ok)
                throw new ApiError({
                  kind: "http",
                  message: friendlyApiError(
                    res2.status,
                    parsed?.error,
                    parsed?.code,
                  ),
                  status: res2.status,
                  body: data2,
                  bodyText: raw2,
                  url: res2.url,
                });
              followUpText = parsed.text || "";
              setMessages((m) =>
                m.map((x) =>
                  x.id === assistantId
                    ? { ...x, text: prefix + followUpText }
                    : x,
                ),
              );
            }
          } catch (e2) {
            setMessages((m) =>
              m.map((x) =>
                x.id === assistantId
                  ? // `prefix` уже закінчується порожнім рядком, коли не
                    // порожній сам; окремі `\n\n` дали б чотири переноси
                    // з карткою і два ведучі — без неї.
                    { ...x, text: `${prefix}${friendlyChatError(e2)}` }
                  : x,
              ),
            );
          }

          if (shouldSpeak) {
            // Озвучуємо те, що людина бачить. Раніше фолбеком був сирий
            // результат виконавця — тобто TTS диктував UUID запису памʼяті
            // вголос. Тепер: відповідь моделі → рядок без картки → короткі
            // підписи карток.
            const speakTarget =
              followUpText ||
              uncardedText ||
              cards
                .map((c) => c.summary)
                .filter(Boolean)
                .join(". ");
            if (speakTarget) maybeSpeak(speakTarget);
          }

          queryClient.invalidateQueries({
            queryKey: hubKeys.preview("finyk"),
          });
          scheduleContextBuild("after-tools", true);
          replyLength = uncardedText.length + followUpText.length;
        } else {
          const reply = data.text || "Немає відповіді.";
          setMessages((m) => [...m, makeAssistantMsg(reply)]);
          if (shouldSpeak) maybeSpeak(reply);
          replyLength = reply.length;
        }

        // Знаменник «коуч відповів». Один call-site на обидві гілки: сюди
        // доходить і текстова відповідь, і tool-call-ланцюг (його
        // внутрішній catch деградує follow-up до тексту, не кидаючи далі).
        // Ранні `return` вище — биті tool_calls і відмова від деструктивної
        // дії — сюди навмисно НЕ доходять: там відповіді не було.
        trackEvent(ANALYTICS_EVENTS.HUBCHAT_RESPONSE_RECEIVED, {
          latency_ms: Date.now() - sentAt,
          length: replyLength,
          had_tools: hadTools,
        });
      } catch (e) {
        const isAbort =
          (isApiError(e) && e.kind === "aborted") ||
          (e as { name?: string } | null)?.name === "AbortError";
        if (isAbort && timedOut) {
          setMessages((m) => [
            ...m,
            makeAssistantMsg("Час очікування вичерпано. Спробуй ще раз."),
          ]);
          trackEvent(ANALYTICS_EVENTS.HUBCHAT_ERROR, { kind: "aborted" });
        } else if (isAbort) {
          // Explicit cancel (cancel button or chat close). Події НЕ шлемо:
          // користувач передумав — це не збій асистента. Такі спроби видно
          // як розрив `message_sent − (response_received + error)`.
          setMessages((m) => [...m, makeAssistantMsg("Запит скасовано.")]);
        } else {
          setMessages((m) => [...m, makeAssistantMsg(friendlyChatError(e))]);
          const kind = isApiError(e) ? e.kind : "unknown";
          trackEvent(ANALYTICS_EVENTS.HUBCHAT_ERROR, {
            kind,
            ...(isApiError(e) && e.kind === "http" && e.status
              ? { status: e.status }
              : {}),
          });
        }
      } finally {
        clearTimeout(timeoutId);
        if (abortRef.current === ac) abortRef.current = null;
        setLoading(false);
        setHubStreaming(false);
        // Лічильник квоти (`GET /api/chat/usage`) читався лише на монтуванні
        // `ChatUsageCounter`, тож пігулка все життя сесії показувала «0/5» —
        // навіть поруч із 429-помилкою про вичерпаний ліміт; правда
        // зʼявлялась тільки після перезавантаження сторінки (browser QA
        // 2026-08-23). Інвалідовуємо ПІСЛЯ кожного ходу, включно з невдалим:
        // сервер списує запит і тоді, коли відповідь була помилкою.
        queryClient.invalidateQueries({ queryKey: chatKeys.usage });
      }
    },
    [
      activeModule,
      input,
      isPro,
      loading,
      messages,
      online,
      maybeSpeak,
      onOpenCatalogue,
      preset,
      queryClient,
      requestDestructiveConfirm,
      scheduleContextBuild,
      setMessages,
      toast,
      usageData,
    ],
  );

  const cancelInFlight = useCallback(() => {
    abortRef.current?.abort();
  }, []);
  const closePaywall = useCallback(() => setPaywallOpen(false), []);

  // Cancel the in-flight request if the chat is closed mid-stream —
  // otherwise fetch keeps "burning" tokens in the background and the
  // finally handler runs after unmount (console noise + potential
  // race).
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);
  sendRef.current = send;

  // Fired-once guard: prevents re-sending when the user navigates back
  // to a route that still has `?q=` in the URL (e.g. via the browser
  // Back button). Without this, every re-mount (strict-mode double-mount
  // included) would fire a fresh send for the same query.
  const initialSentRef = useRef(false);

  // Initial-message handling — kick off the very first send if
  // `autoSendInitial`, otherwise prefill the input.
  useEffect(() => {
    if (!initialMessage) return;
    if (initialSentRef.current) return;
    initialSentRef.current = true;
    if (autoSendInitial) {
      sendRef.current?.(initialMessage);
    } else {
      setInput(initialMessage);
    }
  }, [initialMessage, autoSendInitial]);

  return {
    input,
    setInput,
    loading,
    speaking,
    setSpeaking,
    online,
    hasData,
    contextState,
    activeModule,
    send,
    cancelInFlight,
    paywallOpen,
    usageLimit: usageData?.limit ?? null,
    closePaywall,
    confirmDestructive,
    sendRef,
    focusInputRef,
  };
}
