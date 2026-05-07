import { useMemo } from "react";
import { HubChatHistoryDrawer } from "./HubChatHistoryDrawer";
import { useChatSessions } from "./chat/useChatSessions";
import { useChatSend } from "./chat/useChatSend";
import { HubChatHeader } from "./chat/HubChatHeader";
import { HubChatBody } from "./chat/HubChatBody";
import { HubChatComposer } from "./chat/HubChatComposer";

interface HubChatProps {
  onClose: () => void;
  initialMessage?: string;
  autoSendInitial?: boolean;
  onOpenCatalogue?: () => void;
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
  onOpenCatalogue,
}: HubChatProps) {
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

      <HubChatHistoryDrawer
        open={historyOpen}
        sessions={sessions}
        activeId={activeId}
        onClose={() => setHistoryOpen(false)}
        onSelect={handleSelectSession}
        onCreate={handleCreateSession}
        onDelete={handleDeleteSession}
      />
    </div>
  );
}

export default HubChat;
