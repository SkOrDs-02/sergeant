import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/undoToast";
import { perfMark, perfEnd } from "@shared/lib/perf";
import {
  createSession,
  deleteSession as deleteSessionFn,
  deriveSessionTitle,
  ensureActiveSession,
  loadActiveSessionId,
  loadSessions,
  saveActiveSessionId,
  saveSessions,
  upsertSession,
  type HubChatSession,
} from "../hubChatSessions";
import {
  CHAT_HISTORY_WRITE_DEBOUNCE_MS,
  normalizeStoredMessages,
} from "../../lib/hubChatUtils";
import { stopSpeaking } from "../../lib/hubChatSpeech";

type ChatMessage = HubChatSession["messages"][number];

export interface UseChatSessionsResult {
  sessions: HubChatSession[];
  activeId: string;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;
  detailsOpen: boolean;
  setDetailsOpen: (open: boolean) => void;
  /** Persist the in-memory message list back to the active session synchronously. */
  persistCurrentMessages: () => void;
  /** Mint a fresh session and switch to it. */
  handleCreateSession: () => void;
  /** Switch to an existing session by id. */
  handleSelectSession: (id: string) => void;
  /** Delete a session and show an undo toast. */
  handleDeleteSession: (id: string) => void;
}

/**
 * Multi-session state for HubChat. Owns the sessions list, the active
 * id, the visible `messages` array, and the persistence pipeline
 * (debounced write on every message change + flush-on-unload). Also
 * exposes the controlled-popover flags for the header and history
 * drawer so the shell can collapse them on item click.
 *
 * On first render we run the legacy migration (`hub_chat_history` →
 * `hub_chat_sessions_v1`) inside `loadSessions` so existing users keep
 * their last 30 messages as session #1. The three useState
 * initializers all read from the same eagerly computed snapshot —
 * calling `ensureActiveSession` twice would otherwise mint two
 * independent fresh sessions when storage is empty.
 */
export function useChatSessions(): UseChatSessionsResult {
  const toast = useToast();

  const initialSessionsRef = useRef<{
    sessions: HubChatSession[];
    activeId: string;
  } | null>(null);
  if (initialSessionsRef.current === null) {
    initialSessionsRef.current = ensureActiveSession(
      loadSessions(),
      loadActiveSessionId(),
    );
  }

  const [sessions, setSessions] = useState<HubChatSession[]>(
    () => initialSessionsRef.current!.sessions,
  );
  const [activeId, setActiveId] = useState<string>(
    () => initialSessionsRef.current!.activeId,
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  // Header "Деталі" popover — controlled so item actions (open
  // history drawer, minimize) can dismiss it after the click.
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const initial = initialSessionsRef.current!;
    const found = initial.sessions.find((s) => s.id === initial.activeId);
    return normalizeStoredMessages(found?.messages ?? null);
  });

  const lastMessagesRef = useRef(messages);
  useEffect(() => {
    lastMessagesRef.current = messages;
  }, [messages]);

  // Debounced session write. Title is re-derived on every flush so a
  // freshly-typed first user message renames the session in the
  // drawer without a manual rename.
  useEffect(() => {
    const m = perfMark("hubchat:historyWrite(schedule)");
    const id = setTimeout(() => {
      const mm = perfMark("hubchat:historyWrite");
      const current = lastMessagesRef.current;
      setSessions((prev) => {
        const target = prev.find((s) => s.id === activeId);
        if (!target) return prev;
        const next: HubChatSession = {
          ...target,
          title:
            target.title.startsWith("Бесіда ") || target.title === "Нова бесіда"
              ? deriveSessionTitle(current, target.createdAt)
              : target.title,
          updatedAt: Date.now(),
          messages: current,
        };
        const updated = upsertSession(prev, next);
        saveSessions(updated);
        return updated;
      });
      perfEnd(mm);
    }, CHAT_HISTORY_WRITE_DEBOUNCE_MS);
    perfEnd(m);
    return () => clearTimeout(id);
  }, [messages, activeId]);

  // Flush on unload (skip the debounce — the user is leaving).
  useEffect(() => {
    const flush = () => {
      setSessions((prev) => {
        const target = prev.find((s) => s.id === activeId);
        if (!target) return prev;
        const next: HubChatSession = {
          ...target,
          updatedAt: Date.now(),
          messages: lastMessagesRef.current,
        };
        const updated = upsertSession(prev, next);
        saveSessions(updated);
        return updated;
      });
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [activeId]);

  useEffect(() => {
    saveActiveSessionId(activeId);
  }, [activeId]);

  const persistCurrentMessages = useCallback(() => {
    setSessions((prev) => {
      const target = prev.find((s) => s.id === activeId);
      if (!target) return prev;
      const next: HubChatSession = {
        ...target,
        updatedAt: Date.now(),
        messages: lastMessagesRef.current,
      };
      const updated = upsertSession(prev, next);
      saveSessions(updated);
      return updated;
    });
  }, [activeId]);

  // "Нова бесіда" — flush the current one and switch to a fresh
  // session with the standard intro from `normalizeStoredMessages`.
  const handleCreateSession = useCallback(() => {
    stopSpeaking();
    persistCurrentMessages();
    const fresh = createSession();
    fresh.title = "Нова бесіда";
    setSessions((prev) => {
      const updated = upsertSession(prev, fresh);
      saveSessions(updated);
      return updated;
    });
    setActiveId(fresh.id);
    setMessages(fresh.messages);
    setHistoryOpen(false);
  }, [persistCurrentMessages]);

  const handleSelectSession = useCallback(
    (id: string) => {
      if (id === activeId) {
        setHistoryOpen(false);
        return;
      }
      stopSpeaking();
      persistCurrentMessages();
      const target = sessions.find((s) => s.id === id);
      if (!target) return;
      setActiveId(target.id);
      setMessages(target.messages);
      setHistoryOpen(false);
    },
    [activeId, sessions, persistCurrentMessages],
  );

  const handleDeleteSession = useCallback(
    (id: string) => {
      const removed = sessions.find((s) => s.id === id);
      if (!removed) return;
      const remaining = deleteSessionFn(sessions, id);
      let nextActiveId = activeId;
      let nextMessages: ChatMessage[] | null = null;
      if (id === activeId) {
        if (remaining.length > 0) {
          nextActiveId = remaining[0].id;
          nextMessages = remaining[0].messages;
        } else {
          const fresh = createSession();
          remaining.unshift(fresh);
          nextActiveId = fresh.id;
          nextMessages = fresh.messages;
        }
      }
      setSessions(remaining);
      saveSessions(remaining);
      if (nextActiveId !== activeId) setActiveId(nextActiveId);
      if (nextMessages) setMessages(nextMessages);
      showUndoToast(toast, {
        msg: `Видалено бесіду «${removed.title}»`,
        onUndo: () => {
          setSessions((prev) => {
            const updated = upsertSession(prev, removed);
            saveSessions(updated);
            return updated;
          });
        },
      });
    },
    [sessions, activeId, toast],
  );

  return {
    sessions,
    activeId,
    messages,
    setMessages,
    historyOpen,
    setHistoryOpen,
    detailsOpen,
    setDetailsOpen,
    persistCurrentMessages,
    handleCreateSession,
    handleSelectSession,
    handleDeleteSession,
  };
}
