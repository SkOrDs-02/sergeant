import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { chatApi, isApiError } from "@shared/api";
import {
  createStreamedReply,
  requestFirstTurn,
  toolTurnPrefix,
  withoutInterrupted,
} from "./firstTurnStream";
import { useToast } from "@shared/hooks/useToast";
import { useOnlineStatus } from "@shared/hooks/useOnlineStatus";
import { useRegisterDirtyState } from "@shared/hooks/useRegisterDirtyState";
import { initialChatInput, useChatInputDraft } from "./chatInputDraft";
import { billingKeys, chatKeys, hubKeys } from "@shared/lib/api/queryKeys";
import { perfMark, perfEnd } from "@shared/lib/ui/perf";
import {
  CONTEXT_TTL_MS,
  cancelIdle,
  friendlyChatError,
  getActiveModule,
  isHelpCommand,
  makeAssistantMsg,
  makeErrorMsg,
  makeUserMsg,
  newMsgId,
  requestIdle,
  type ActiveModule,
} from "../../lib/hubChatUtils";
import { buildContextMeasured } from "../../lib/hubChatContext";
import { executeActions } from "../../lib/hubChatActions";
import { logger } from "@shared/lib";
import { ANALYTICS_EVENTS, type ChatPreset } from "@sergeant/shared";
import { trackEvent } from "../../observability/analytics";
import { parseToolCalls } from "./toolCallSchema";
import { SYNTHESIS_STEP_LABEL, describeToolStep } from "./chatProgress";
import {
  CANCELLED_BY_USER_TEXT,
  HUB_CHAT_HELP_TEXT,
  isAutoTtsEnabled,
} from "./chatSendText";
import { firstTurnEcho } from "./replayableToolBlocks";
import { requestSynthesis } from "./synthesisRequest";
import {
  destructiveConfirmItems,
  reportExecutedTools,
  runSecondToolRound,
} from "./secondToolRound";
import { buildTurnCards, markCardsAfterFailedSynthesis } from "./turnCards";
import { historyForServer, turnRefsField, withTurnRefs } from "./turnRefs";
import {
  useDestructiveConfirm,
  type UseDestructiveConfirmResult,
} from "./useDestructiveConfirm";
import { VOICE_KEYWORDS, speak } from "../../lib/hubChatSpeech";
import { setHubStreaming } from "../streamingStore";
import { useFinykHubPreview } from "../useFinykHubPreview";
import type { HubChatSession } from "../hubChatSessions";
import { usePlan } from "../../billing/usePlan";
import { useSessionReady } from "../../auth/useSessionReady";

type ChatMessage = HubChatSession["messages"][number];

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
  /** Id активної бесіди — хід привʼязується до неї на старті (data-44). */
  activeId?: string | undefined;
  /**
   * Запис у бесіду за id (див. `useChatSessions.updateSessionMessages`).
   * Без нього (ізольовані тести/вбудовування) хід пише в `setMessages`.
   */
  updateSessionMessages?:
    | ((
        sessionId: string,
        updater: React.SetStateAction<ChatMessage[]>,
      ) => void)
    | undefined;
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
  /**
   * Що Сержант робить зараз (С-1 (б)): підпис інструмента лише на час його
   * виконання клієнтом; `null` — нейтральний стан (перший хід, синтез).
   */
  step: string | null;
  speaking: boolean;
  setSpeaking: React.Dispatch<React.SetStateAction<boolean>>;
  online: boolean;
  contextState: { status: string; ts: number };
  activeModule: ActiveModule | null;
  /** Send `text` (or the current `input`). `fromVoice` flag triggers TTS reply. */
  send: (text?: string, fromVoice?: boolean) => Promise<void>;
  /** Abort the in-flight request (cancel button or close while streaming). */
  cancelInFlight: () => void;
  paywallOpen: boolean;
  /**
   * Free-tier тижневий ліміт AI-дій (`GET /api/chat/usage::limit`).
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
  activeId,
  updateSessionMessages,
  initialMessage,
  autoSendInitial,
  onOpenCatalogue,
  preset,
}: UseChatSendOptions): UseChatSendResult {
  const toast = useToast();
  const queryClient = useQueryClient();
  const finykPreview = useFinykHubPreview();
  const { isPro } = usePlan();
  const online = useOnlineStatus();

  // Джерело істини для пре-гейту пейволу: `GET /api/chat/usage` (тижневе
  // відро `ai.actions`, те саме, що в знімку доступу для `ChatUsageCounter`).
  // Раніше тут стояв окремий localStorage-лічильник повідомлень: рахував
  // не те (повідомлення, а не одиниці квоти) і не там (per-device, сервер —
  // per-user), тож два ходи з інструментом розходились із серверним
  // рахунком удвічі. `enabled: !isPro` — Pro не гейтиться взагалі, запит
  // не потрібен.
  // Без сесії ендпоінт віддає 401 (FULL-20261119-PERF-1): гість квоти не має.
  const sessionReady = useSessionReady();
  const { data: usageData } = useQuery({
    queryKey: chatKeys.usage,
    queryFn: ({ signal }) => chatApi.usage({ signal }),
    enabled: !isPro && sessionReady,
    staleTime: 30_000,
    retry: false,
  });

  const [input, setInput] = useState(initialChatInput);
  useChatInputDraft(input);
  // Непорожній композер — незбережений ввід: тихий idle-reload сервіс-воркера
  // його не знищує (data-45, `core/app/autoUpdate.ts`).
  useRegisterDirtyState(input.trim() !== "");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<string | null>(null);
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
          makeErrorMsg(
            "Немає підключення. Спробуй ще раз, коли зʼявиться інтернет.",
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

      // data-44: усе, що хід пише ПІСЛЯ цього рядка (стрім, картки,
      // помилки, «Запит скасовано»), адресується бесіді, у якій хід
      // стартував. Якщо користувач за цей час натисне «Нова» чи обере
      // іншу бесіду, відповідь однаково дописується у свою, а не в ту, що
      // стала активною (раніше — осиротіла відповідь у чужій бесіді й
      // персистенція зіпсованої історії).
      const turnSessionId = activeId;
      const setTurnMessages = (
        updater: React.SetStateAction<ChatMessage[]>,
      ): void => {
        if (updateSessionMessages && turnSessionId) {
          updateSessionMessages(turnSessionId, updater);
        } else {
          setMessages(updater);
        }
      };
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

      // С-1 (а): обірвана відповідь лишається на екрані, але не в історії.
      const history = historyForServer(withoutInterrupted(next));

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
      const reply = createStreamedReply(setTurnMessages, () => ac.abort());

      try {
        // The idle snapshot can predate a pull, a local write in another
        // module, or midnight. Read canonical data at the user's turn;
        // a Finyk-only preview notification cannot invalidate every input.
        // С-2 (а): id з останньої відповіді їдуть у блок ДАНІ (`turnRefs.ts`).
        const context = withTurnRefs(buildContextMeasured(), messages);
        contextRef.current = { text: context, ts: Date.now() };
        setContextState({ status: "ready", ts: contextRef.current.ts });

        // С-1 (а): перший хід стрімиться. Текст іде в бульбашку, поки модель
        // пише, крок — щойно вона обрала інструмент; дії лише після `final`.
        const seenTools: string[] = [];
        const data = await requestFirstTurn(
          {
            context,
            messages: history,
            ...(turnPreset ? { preset: turnPreset } : {}),
          },
          {
            signal,
            onText: reply.onText,
            onTool: (name) => {
              seenTools.push(name);
              setStep(describeToolStep(seenTools));
            },
          },
        );

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
            // Коментар вище прямо каже: «для користувача це збій», інакше
            // зламаний інструмент виглядав би звичайною текстовою відповіддю.
            // Досі це відображалось лише в телеметрії, а бульбашка лишалась
            // невідрізненною — і озвучувалась.
            reply.put(makeErrorMsg(fallback));
            return;
          }
          const toolCalls = parsed.value;

          // Канон §8 — «Деструктивне тільки з підтвердженням», причому
          // ПЕРЕД виконанням. Гейт стоїть тут, а не всередині хендлерів:
          // хендлери — чисті функції над сховищем, у них немає UI, і
          // підтвердження в кожному з них розповзлось би шістьма копіями.
          const confirmItems = destructiveConfirmItems(toolCalls);
          if (
            confirmItems.length > 0 &&
            !(await requestDestructiveConfirm(confirmItems))
          ) {
            // Скасування — весь батч, а не лише деструктивна його
            // частина. Часткове виконання лишило б стан, якого
            // користувач не обмірковував: він відмовився від «видали
            // й перепиши», а отримав би половину.
            //
            // Другий запит до моделі теж не робимо: `tool_calls_raw`
            // йде лише в ньому, тож жоден `tool_use` не лишається без
            // пари — протокол не ламається, а токени не палимо.
            setTurnMessages((m) => [
              ...m,
              makeAssistantMsg(CANCELLED_BY_USER_TEXT),
            ]);
            return;
          }

          // С-1 (б): крок показуємо рівно на час виконання, не за таймером.
          setStep(describeToolStep(toolCalls.map((tc) => tc.name as string)));
          const handlerResults = await executeActions(
            toolCalls as Parameters<typeof executeActions>[0],
          );
          // Друга фаза: інструменти відпрацювали, далі модель пише відповідь.
          setStep(SYNTHESIS_STEP_LABEL);

          // `hubchat_tool_invoked` і undo-тости мутаторів — одна точка для
          // обох раундів (`secondToolRound.ts`).
          reportExecutedTools(handlerResults, toast);
          const toolResults = toolCalls.map((tc, idx) => ({
            tool_use_id: tc.id,
            content: handlerResults[idx]?.result ?? "",
          }));

          // Картки для відомих tool-ів + текстовий фолбек для решти.
          let { cards, uncardedText } = buildTurnCards(
            toolCalls,
            handlerResults,
          );
          // Вступ моделі перед інструментом (стрім або `text` старого
          // сервера) стоїть над картками в тій самій бульбашці.
          const preamble = reply.text || data.text || "";
          let prefix = toolTurnPrefix(preamble, uncardedText);

          const assistantId = reply.id ?? newMsgId();
          reply.put({
            id: assistantId,
            role: "assistant",
            text: prefix,
            ...(cards.length > 0 ? { cards } : {}),
            ...turnRefsField(toolCalls, handlerResults),
          });
          const patchTurn = (patch: Partial<ChatMessage>): void =>
            setTurnMessages((m) =>
              m.map((x) => (x.id === assistantId ? { ...x, ...patch } : x)),
            );

          let followUpText = "";
          // Синтез (другий тур) міг упасти — тоді в бульбашці лежить текст
          // помилки, а не відповідь, і озвучувати його не треба.
          let synthesisFailed = false;
          try {
            const synthesisOpts = {
              signal,
              abort: () => ac.abort(),
              onText: (acc: string) => patchTurn({ text: prefix + acc }),
            };
            // Той самий preset і на турі синтезу: інструкція має діяти й
            // після `remember`, і цей запит теж має списатись із
            // preset-відра, а не з денного.
            const synthesisBase = {
              context: contextRef.current.text || context,
              messages: history,
              stream: true,
              ...(turnPreset ? { preset: turnPreset } : {}),
            };
            // Блоки першого туру і його квиток (`firstTurnEcho`): сервер
            // приймає лише `tool_use`-подібні блоки (B32), а без квитка
            // синтез списує другу одиницю квоти (AI-5).
            const firstEcho = firstTurnEcho(data);
            // `second_tool_round`: цей клієнт уміє прийняти виклики запису
            // другого раунду замість тексту (С-2 (б)).
            let outcome = await requestSynthesis(
              {
                ...synthesisBase,
                tool_results: toolResults,
                ...firstEcho,
                second_tool_round: true,
              },
              synthesisOpts,
            );

            // С-2 (б): після пошуку сервер може повернути виклики запису
            // другого раунду замість тексту. Стеля два раунди: синтез після
            // них уже не повертає інструментів (`chatSecondRound.ts`).
            if (outcome.kind === "tools") {
              const second = await runSecondToolRound(outcome.data, {
                confirm: requestDestructiveConfirm,
                onExecuting: (names) => setStep(describeToolStep(names)),
              });
              if (second.kind === "cancelled") {
                // Перший раунд лише шукав, тож справді нічого не змінено.
                outcome = { kind: "text", text: CANCELLED_BY_USER_TEXT };
                patchTurn({ text: prefix + CANCELLED_BY_USER_TEXT });
              } else if (second.kind === "invalid") {
                throw new Error("second-round tool_calls schema mismatch");
              } else {
                setStep(SYNTHESIS_STEP_LABEL);
                reportExecutedTools(second.results, toast);
                const more = buildTurnCards(second.toolCalls, second.results);
                cards = [...cards, ...more.cards];
                uncardedText = [uncardedText, more.uncardedText]
                  .filter(Boolean)
                  .join("\n\n");
                prefix = toolTurnPrefix(preamble, uncardedText);
                patchTurn({
                  text: prefix,
                  ...(cards.length > 0 ? { cards } : {}),
                  ...turnRefsField(
                    [...toolCalls, ...second.toolCalls],
                    [...handlerResults, ...second.results],
                  ),
                });
                // Квиток другого раунду: хід коштує одну одиницю (AI-5).
                outcome = await requestSynthesis(
                  {
                    ...synthesisBase,
                    tool_results: [...toolResults, ...second.toolResults],
                    tool_calls_raw: [
                      ...(firstEcho.tool_calls_raw ?? []),
                      ...second.replay,
                    ],
                    ...(second.ticket
                      ? { round_trip_ticket: second.ticket }
                      : {}),
                  },
                  synthesisOpts,
                );
              }
            }
            followUpText = outcome.kind === "text" ? outcome.text : "";
          } catch (e2) {
            synthesisFailed = true;
            setTurnMessages((m) =>
              m.map((x) => {
                if (x.id !== assistantId) return x;
                // AI-6: картки синтезу, що впав (див. `turnCards.ts`).
                const patchedCards = x.cards
                  ? markCardsAfterFailedSynthesis(x.cards)
                  : undefined;
                return {
                  ...x,
                  // `prefix` уже закінчується порожнім рядком, коли не
                  // порожній сам; окремі `\n\n` дали б чотири переноси
                  // з карткою і два ведучі — без неї.
                  text: `${prefix}${friendlyChatError(e2)}`,
                  error: true,
                  ...(patchedCards ? { cards: patchedCards } : {}),
                };
              }),
            );
          }

          // Синтез упав — у бульбашці текст помилки, і озвучувати його
          // немає сенсу (той самий принцип, що й `error`-гілка в
          // `components/ChatMessage.tsx`, де кнопка TTS зникає).
          if (shouldSpeak && !synthesisFailed) {
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
          const answer = data.text || reply.text || "Немає відповіді.";
          reply.put(makeAssistantMsg(answer));
          if (shouldSpeak) maybeSpeak(answer);
          replyLength = answer.length;
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
        if ((!isAbort || timedOut) && reply.interrupt(msg)) {
          // Обрив після видимого тексту (рішення founder-а): написане лишається
          // з «Ще раз», окремої бульбашки помилки немає.
          trackEvent(ANALYTICS_EVENTS.HUBCHAT_ERROR, { kind: "interrupted" });
        } else if (isAbort && timedOut) {
          setTurnMessages((m) => [
            ...m,
            makeErrorMsg("Час очікування вичерпано. Спробуй ще раз."),
          ]);
          trackEvent(ANALYTICS_EVENTS.HUBCHAT_ERROR, { kind: "aborted" });
        } else if (isAbort) {
          // Explicit cancel (cancel button or chat close). Події НЕ шлемо:
          // користувач передумав — це не збій асистента. Такі спроби видно
          // як розрив `message_sent − (response_received + error)`.
          setTurnMessages((m) => [...m, makeAssistantMsg("Запит скасовано.")]);
        } else {
          setTurnMessages((m) => [...m, makeErrorMsg(friendlyChatError(e))]);
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
        setStep(null);
        setHubStreaming(false);
        // Лічильник квоти читався лише на монтуванні, тож пігулка все життя
        // сесії показувала «0/5» навіть поруч із 429 (browser QA
        // 2026-08-23). Інвалідовуємо ПІСЛЯ кожного ходу, включно з невдалим:
        // сервер списує запит і тоді, коли відповідь була помилкою. Пігулка
        // читає знімок `billingKeys.status`, пре-гейт читає `chatKeys.usage`.
        queryClient.invalidateQueries({ queryKey: chatKeys.usage });
        queryClient.invalidateQueries({ queryKey: billingKeys.status });
      }
    },
    [
      activeId,
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
      updateSessionMessages,
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
      // Чернетка, відновлена після замка (sec-13), має перевагу над `?q=`.
      setInput((cur) => (cur.trim() !== "" ? cur : initialMessage));
    }
  }, [initialMessage, autoSendInitial]);

  return {
    input,
    setInput,
    loading,
    step,
    speaking,
    setSpeaking,
    online,
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
