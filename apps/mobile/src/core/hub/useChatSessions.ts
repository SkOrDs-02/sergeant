/**
 * Mobile-side multi-session state for HubChat.
 *
 * Це slim port `apps/web/src/core/hub/chat/useChatSessions.ts` без
 * web-only залежностей: `useToast`/undo-toast інтегрується через
 * мобільний `@/components/ui/Toast`, persistence ходить через MMKV
 * adapter у `hubChatSessions.ts`, на unload реагуємо через
 * `AppState.change` замість `beforeunload`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { useToast } from "@/components/ui/Toast";

import { normalizeStoredMessages, type ChatMessage } from "./hubChatUtils";
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
} from "./hubChatSessions";

const HISTORY_WRITE_DEBOUNCE_MS = 600;

export interface UseChatSessionsResult {
  sessions: HubChatSession[];
  activeId: string;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;
  persistCurrentMessages: () => void;
  handleCreateSession: () => void;
  handleSelectSession: (id: string) => void;
  handleDeleteSession: (id: string) => void;
}

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

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const initial = initialSessionsRef.current!;
    const found = initial.sessions.find((s) => s.id === initial.activeId);
    return normalizeStoredMessages(found?.messages ?? null);
  });

  const lastMessagesRef = useRef(messages);
  useEffect(() => {
    lastMessagesRef.current = messages;
  }, [messages]);

  // Debounced session write. Title re-derives на кожному flush щоб
  // перший user-message переіменував сесію без manual rename.
  useEffect(() => {
    const id = setTimeout(() => {
      const current = lastMessagesRef.current;
      setSessions((prev) => {
        const target = prev.find((s) => s.id === activeId);
        if (!target) return prev;
        const nextSession: HubChatSession = {
          ...target,
          title:
            target.title.startsWith("Бесіда ") || target.title === "Нова бесіда"
              ? deriveSessionTitle(current, target.createdAt)
              : target.title,
          updatedAt: Date.now(),
          messages: current,
        };
        const updated = upsertSession(prev, nextSession);
        saveSessions(updated);
        return updated;
      });
    }, HISTORY_WRITE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [messages, activeId]);

  // Flush на app background / unmount — на mobile використовуємо
  // AppState замість window.beforeunload.
  useEffect(() => {
    const flush = () => {
      setSessions((prev) => {
        const target = prev.find((s) => s.id === activeId);
        if (!target) return prev;
        const nextSession: HubChatSession = {
          ...target,
          updatedAt: Date.now(),
          messages: lastMessagesRef.current,
        };
        const updated = upsertSession(prev, nextSession);
        saveSessions(updated);
        return updated;
      });
    };
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "background" || state === "inactive") flush();
    });
    return () => {
      flush();
      sub.remove();
    };
  }, [activeId]);

  useEffect(() => {
    saveActiveSessionId(activeId);
  }, [activeId]);

  const persistCurrentMessages = useCallback(() => {
    setSessions((prev) => {
      const target = prev.find((s) => s.id === activeId);
      if (!target) return prev;
      const nextSession: HubChatSession = {
        ...target,
        updatedAt: Date.now(),
        messages: lastMessagesRef.current,
      };
      const updated = upsertSession(prev, nextSession);
      saveSessions(updated);
      return updated;
    });
  }, [activeId]);

  const handleCreateSession = useCallback(() => {
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
          nextActiveId = remaining[0]!.id;
          nextMessages = remaining[0]!.messages;
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
      toast.show(`Видалено бесіду «${removed.title}»`, "info");
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
    persistCurrentMessages,
    handleCreateSession,
    handleSelectSession,
    handleDeleteSession,
  };
}
