import { useEffect, useMemo, useRef } from "react";
import { cn } from "@shared/lib/cn";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { useVisualKeyboardInset } from "@sergeant/shared";
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
  /**
   * When provided, the chat header gains a "minimize" button that hides
   * the dialog without unmounting it (so messages, draft input and any
   * in-flight request are preserved). The host renders a floating FAB
   * to restore the chat.
   */
  isMinimized?: boolean;
  onMinimize?: () => void;
  /**
   * Called whenever `messages` changes while `isMinimized` is true so
   * the host can drive the unseen-message badge on the FAB. Only the
   * count delta matters — the host owns the actual counter state.
   */
  onUnseenChange?: (count: number) => void;
}

/**
 * Hub chat shell. Composes:
 *  - `useChatSessions` — multi-session state, persistence, undo flow.
 *  - `useChatSend`     — input/loading/speaking, context cache, abort.
 *  - `HubChatHeader`   — popover-backed title row + new/close pills.
 *  - `HubChatBody`     — scrollable messages + inline cancel pill.
 *  - `HubChatComposer` — quick chips + offline banner + ChatInput.
 *  - `HubChatHistoryDrawer` — sessions sidebar (out-of-tree).
 */
function HubChat({
  onClose,
  initialMessage,
  autoSendInitial,
  onOpenCatalogue,
  isMinimized = false,
  onMinimize,
  onUnseenChange,
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

  // Unseen-while-minimized tracking. Snapshot the assistant-message
  // count on the transition `open → minimized`, then on every
  // subsequent `messages` change report `current - snapshot` to the
  // host so it can render a numeric badge on the restore FAB. The
  // snapshot is cleared on the transition back to visible (`open`)
  // so re-minimizing starts fresh.
  const minimizedBaselineRef = useRef<number | null>(null);
  useEffect(() => {
    if (isMinimized) {
      if (minimizedBaselineRef.current === null) {
        minimizedBaselineRef.current = messages.filter(
          (m) => m.role === "assistant",
        ).length;
      }
    } else {
      minimizedBaselineRef.current = null;
      onUnseenChange?.(0);
    }
  }, [isMinimized, messages, onUnseenChange]);
  useEffect(() => {
    if (!isMinimized) return;
    const baseline = minimizedBaselineRef.current ?? 0;
    const current = messages.filter((m) => m.role === "assistant").length;
    onUnseenChange?.(Math.max(0, current - baseline));
  }, [messages, isMinimized, onUnseenChange]);

  const panelRef = useRef<HTMLDivElement | null>(null);

  // Focus trap + Escape + restore focus to trigger on close. Shared
  // with Sheet / ConfirmDialog / InputDialog so every modal surface
  // gets the same WCAG 2.4.3 focus-order guarantees in one place.
  // Suppressed while minimized so the user can interact with the
  // rest of the hub. Esc still routes to `onClose` when the dialog
  // is visible.
  useDialogFocusTrap(!isMinimized, panelRef, { onEscape: onClose });

  // On-screen keyboard handling. Without this, when a mobile user
  // taps the chat input, the browser's virtual keyboard covers the
  // field and the send button — visualViewport API tells us the
  // remaining viewport height so we can pad the panel up and keep
  // the input visible. Matches the `kbInsetPx` pattern used by Sheet.
  const kbInsetPx = useVisualKeyboardInset(true);

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
      className={cn(
        "fixed inset-0 z-50 flex flex-col safe-area-pt-pb",
        // Visually collapse the dialog while minimized but keep the
        // subtree mounted so messages, draft input, and any in-flight
        // request survive across hide/restore cycles.
        isMinimized && "pointer-events-none opacity-0",
      )}
      aria-hidden={isMinimized}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
        tabIndex={-1}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hub-chat-title"
        aria-describedby="hub-chat-privacy"
        className="relative mt-auto flex flex-col bg-bg border-t border-line rounded-t-3xl shadow-float max-h-[92dvh] outline-none transition-[margin] duration-150"
        style={kbInsetPx > 0 ? { marginBottom: kbInsetPx } : undefined}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-line rounded-full" />
        </div>

        <HubChatHeader
          detailsOpen={detailsOpen}
          onDetailsOpenChange={setDetailsOpen}
          contextState={contextState}
          hasData={hasData}
          sessionInfo={sessionInfo}
          sessionsCount={sessions.length}
          onOpenHistory={() => setHistoryOpen(true)}
          onMinimize={onMinimize}
          onClearChat={handleCreateSession}
          onClose={onClose}
        />

        <HubChatBody
          messages={messages}
          loading={loading}
          onSpeak={() => setSpeaking(true)}
          onCancel={cancelInFlight}
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
    </div>
  );
}

export default HubChat;
