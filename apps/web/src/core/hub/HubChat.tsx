import { useEffect, useMemo, useRef } from "react";
import { ANALYTICS_EVENTS, type ChatPreset } from "@sergeant/shared";
import { trackEvent } from "../observability/analytics";
import { HubChatHistoryDrawer } from "./HubChatHistoryDrawer";
import { useChatSessions } from "./chat/useChatSessions";
import { useChatSend } from "./chat/useChatSend";
import { useHubChatStorageBoot } from "./chat/useHubChatStorageBoot";
import { HubChatHeader } from "./chat/HubChatHeader";
import { HubChatBody } from "./chat/HubChatBody";
import { HubChatComposer } from "./chat/HubChatComposer";
import { ChatAuthGate } from "./chat/ChatAuthGate";
import { useAuthOptional } from "../auth/AuthContext";
import { PaywallModal } from "../billing/PaywallModal";
import { DestructiveConfirmModal } from "./chat/DestructiveConfirmModal";

interface HubChatProps {
  onClose: () => void;
  initialMessage?: string;
  autoSendInitial?: boolean;
  /**
   * Сценарний режим розмови (`CHAT_PRESETS`). Прокидується в
   * `useChatSend`, який чіпляє його до перших N відправок — див.
   * `PRESET_TURNS`.
   */
  preset?: ChatPreset | undefined;
  onOpenCatalogue?: () => void;
  /**
   * Поверхня, з якої відкрито чат — їде в `hubchat_opened`. Проп, а не
   * висновок з `location.pathname`: оверлей можна відкрити і перебуваючи
   * на `/chat`, і тоді шлях збрехав би «route».
   */
  source?: "overlay" | "route";
}

/**
 * Hub chat shell. Composes:
 *  - `useChatSessions` — multi-session state, persistence, undo flow.
 *  - `useChatSend`     — input/loading/speaking, context cache, abort.
 *  - `HubChatHeader`   — popover-backed title row + new/close pills.
 *  - `HubChatBody`     — scrollable messages + inline cancel pill.
 *  - `HubChatComposer` — quick chips + offline banner + ChatInput.
 *  - `HubChatHistoryDrawer` — sessions sidebar (out-of-tree).
 *
 * Renders inline as a regular page child (host: `HubChatPage` at
 * `/chat`). The previous fullscreen-modal frame (`fixed inset-0`,
 * `backdrop-blur`, `useDialogFocusTrap`, `useVisualKeyboardInset`,
 * minimize-FAB plumbing) was removed when the chat moved to its own
 * route — page semantics handle the focus order, browser
 * back/forward and the on-screen keyboard natively.
 */
function HubChat({
  onClose,
  initialMessage,
  autoSendInitial,
  preset,
  onOpenCatalogue,
  source = "overlay",
}: HubChatProps) {
  // Warm the SQLite read caches + register the finyk dual-write context
  // so the off-React chat-action executors read fresh data and persist
  // their writes (see `useHubChatStorageBoot`).
  useHubChatStorageBoot();

  // Знаменник воронки HubChat. Сидить саме тут, а не в двох host-ах
  // (`HubChatOverlay` + `HubChatPage`), бо цей компонент — єдина спільна
  // точка монтування обох поверхонь: один call-site замість двох, які
  // неминуче розійшлися б. Обидва host-и монтують `HubChat` лише коли
  // чат реально відкритий (оверлей — `if (!open) return null`, сторінка —
  // окремий роут), тож mount == відкриття.
  //
  // Ref-гард — той самий патерн, що в `PageviewTracker`: ref переживає
  // StrictMode-івський mount→unmount→mount, тож подія лишається однією на
  // реальне відкриття. Справжнє переоткриття створює новий інстанс (і новий
  // ref), тож воно рахується окремо — саме так і треба.
  const openedFiredRef = useRef(false);
  useEffect(() => {
    if (openedFiredRef.current) return;
    openedFiredRef.current = true;
    trackEvent(ANALYTICS_EVENTS.HUBCHAT_OPENED, { source });
  }, [source]);

  // Гейт входу. `useAuthOptional`, а не `useAuth`: чат монтується поза
  // `AuthProvider` у частині юніт-тестів, і там «контексту немає» означає
  // «не знаю» — тоді нічого не гейтимо й лишаємо composer, як було.
  // Гейт спрацьовує лише на РОЗВʼЯЗАНОМУ `unauthenticated`, тож на буті
  // (`loading`) поле вводу не блимає.
  const auth = useAuthOptional();
  const signedOut = auth?.status === "unauthenticated";

  const sessionsState = useChatSessions();
  const {
    sessions,
    activeId,
    messages,
    setMessages,
    historyOpen,
    setHistoryOpen,
    detailsOpen,
    setDetailsOpen,
    handleCreateSession,
    handleSelectSession,
    handleDeleteSession,
  } = sessionsState;

  const sendState = useChatSend({
    messages,
    setMessages,
    initialMessage,
    autoSendInitial,
    preset,
    onOpenCatalogue,
  });
  const {
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
    usageLimit,
    closePaywall,
    confirmDestructive,
    sendRef,
    focusInputRef,
  } = sendState;

  const sessionInfo = useMemo(() => {
    const uiMsgs = Array.isArray(messages) ? messages : [];
    const history = uiMsgs
      .filter((x) => x?.role === "user" || x?.role === "assistant")
      .slice(-10);
    const chars = history.reduce(
      (acc, x) => acc + String(x?.text || "").length,
      0,
    );
    return { historyCount: history.length, chars };
  }, [messages]);

  return (
    <div
      role="region"
      aria-labelledby="hub-chat-title"
      aria-describedby="hub-chat-privacy"
      className="relative flex flex-col flex-1 min-h-0 bg-bg outline-none"
    >
      <HubChatHeader
        detailsOpen={detailsOpen}
        onDetailsOpenChange={setDetailsOpen}
        contextState={contextState}
        hasData={hasData}
        sessionInfo={sessionInfo}
        sessionsCount={sessions.length}
        onOpenHistory={() => setHistoryOpen(true)}
        onClearChat={handleCreateSession}
        onClose={onClose}
      />

      <HubChatBody
        messages={messages}
        loading={loading}
        onSpeak={() => setSpeaking(true)}
        onCancel={cancelInFlight}
        onPickSuggestion={(text) => {
          setInput(text);
          // Затримка, щоб React встиг змонтувати оновлений value у
          // input перед тим, як ми поставимо focus — той самий
          // pattern, що в `<ChatQuickActions onPrefill>`.
          setTimeout(() => focusInputRef.current?.(), 0);
        }}
      />

      {signedOut ? (
        <ChatAuthGate />
      ) : (
        <HubChatComposer
          activeModule={activeModule}
          loading={loading}
          online={online}
          speaking={speaking}
          setSpeaking={setSpeaking}
          input={input}
          setInput={setInput}
          onSend={(prompt) => {
            void send(prompt);
          }}
          onHelp={() => {
            void send("/help");
          }}
          sendRef={sendRef}
          focusInputRef={focusInputRef}
        />
      )}

      <HubChatHistoryDrawer
        open={historyOpen}
        sessions={sessions}
        activeId={activeId}
        onClose={() => setHistoryOpen(false)}
        onSelect={handleSelectSession}
        onCreate={handleCreateSession}
        onDelete={handleDeleteSession}
      />

      <DestructiveConfirmModal
        items={confirmDestructive.pending?.items ?? null}
        onConfirm={confirmDestructive.accept}
        onCancel={confirmDestructive.reject}
      />

      {/* eslint-disable sergeant-design/no-cyrillic-jsx-literal -- pre-existing PaywallModal copy; i18n catalog migration tracked separately. */}
      <PaywallModal
        open={paywallOpen}
        onClose={closePaywall}
        surface="ai_chat_limit"
        title="Безлімітний AI-чат у Pro"
        description={
          // AI-5 (`docs/90-work/audits/2026-09-01-product-audit/findings.md`)
          // — round-trip-квиток зробив кожен хід (навіть із дією) рівно
          // одним запитом, тож застереження «може коштувати кілька» більше
          // не правда.
          usageLimit != null
            ? `Free-тариф має ${usageLimit} запитів до AI на день, кожен хід рахується один раз. Pro відкриває безлімітний чат, авто-Mono sync і CloudSync.`
            : "Free-тариф має денний ліміт запитів до AI, кожен хід рахується один раз. Pro відкриває безлімітний чат, авто-Mono sync і CloudSync."
        }
      />
      {/* eslint-enable sergeant-design/no-cyrillic-jsx-literal */}
    </div>
  );
}

export default HubChat;
