/**
 * Mobile-side HubChat session persistence. Дзеркало
 * `apps/web/src/core/hub/hubChatSessions.ts`, але читає / пише через
 * мобільний MMKV adapter (`@/lib/storage`), а не web-localStorage.
 *
 * Storage keys ідентичні web-варіанту, щоб майбутній CloudSync шар міг
 * мирно тримати один формат серіалізації між поверхнями.
 */

import {
  lsRead,
  lsReadString,
  lsRemove,
  lsWrite,
  normalizeStoredMessages,
  type ChatMessage,
} from "./hubChatUtils";

export const SESSIONS_STORAGE_KEY = "hub_chat_sessions_v1";
export const ACTIVE_SESSION_KEY = "hub_chat_active_session_v1";
const LEGACY_KEY = "hub_chat_history";
const SESSION_LIMIT = 20;
const MESSAGES_PER_SESSION = 60;

export interface HubChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

function newId(): string {
  const rnd = globalThis.crypto?.randomUUID?.();
  return rnd ?? `s_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function deriveSessionTitle(
  msgs: ChatMessage[],
  createdAt: number,
): string {
  const firstUser = msgs.find((m) => m.role === "user" && m.text?.trim());
  if (firstUser) {
    const text = firstUser.text.trim().replace(/\s+/g, " ");
    return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  }
  const date = new Date(createdAt);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `Бесіда ${dd}.${mm} ${hh}:${min}`;
}

function createInitialSession(messages?: ChatMessage[]): HubChatSession {
  const now = Date.now();
  const msgs = normalizeStoredMessages(messages ?? null);
  return {
    id: newId(),
    title: deriveSessionTitle(msgs, now),
    createdAt: now,
    updatedAt: now,
    messages: msgs,
  };
}

/**
 * Одноразова міграція з web-варіанту `hub_chat_history` (single
 * session, last 30 messages) у `hub_chat_sessions_v1`. Iдемпотентна:
 * якщо нова схема вже заповнена, не чіпає її.
 */
function migrateLegacyIfNeeded(): HubChatSession[] | null {
  const existing = lsReadString(SESSIONS_STORAGE_KEY);
  if (existing) return null;
  const parsed = lsRead<unknown>(LEGACY_KEY);
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const session = createInitialSession(
    normalizeStoredMessages(parsed as ChatMessage[]),
  );
  return [session];
}

export function loadSessions(): HubChatSession[] {
  const migrated = migrateLegacyIfNeeded();
  if (migrated) {
    saveSessions(migrated);
    return migrated;
  }
  const parsed = lsRead<unknown>(SESSIONS_STORAGE_KEY);
  if (!Array.isArray(parsed)) return [];
  try {
    return parsed
      .filter(
        (x): x is HubChatSession =>
          typeof x === "object" && x != null && typeof x.id === "string",
      )
      .map((s) => ({
        ...s,
        messages: normalizeStoredMessages(s.messages),
      }));
  } catch {
    return [];
  }
}

export function saveSessions(sessions: HubChatSession[]): void {
  const trimmed = sessions
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, SESSION_LIMIT)
    .map((s) => ({
      ...s,
      messages: s.messages.slice(-MESSAGES_PER_SESSION),
    }));
  lsWrite(SESSIONS_STORAGE_KEY, trimmed);

  // Mirror новішої сесії у legacy ключ, щоб майбутні backup-shimи
  // продовжували бачити очікувану форму даних — те саме, що робить
  // web версія.
  const newest = trimmed[0];
  if (newest) {
    lsWrite(LEGACY_KEY, newest.messages.slice(-30));
  }
}

export function loadActiveSessionId(): string | null {
  return lsReadString(ACTIVE_SESSION_KEY);
}

export function saveActiveSessionId(id: string | null): void {
  if (id == null) {
    lsRemove(ACTIVE_SESSION_KEY);
  } else {
    lsWrite(ACTIVE_SESSION_KEY, id);
  }
}

export function createSession(messages?: ChatMessage[]): HubChatSession {
  return createInitialSession(messages);
}

export function upsertSession(
  sessions: HubChatSession[],
  next: HubChatSession,
): HubChatSession[] {
  const idx = sessions.findIndex((s) => s.id === next.id);
  if (idx === -1) return [next, ...sessions];
  const copy = sessions.slice();
  copy[idx] = next;
  return copy;
}

export function deleteSession(
  sessions: HubChatSession[],
  id: string,
): HubChatSession[] {
  return sessions.filter((s) => s.id !== id);
}

export function findSession(
  sessions: HubChatSession[],
  id: string | null,
): HubChatSession | null {
  if (!id) return null;
  return sessions.find((s) => s.id === id) ?? null;
}

export function ensureActiveSession(
  sessions: HubChatSession[],
  activeId: string | null,
): { sessions: HubChatSession[]; activeId: string } {
  const found = findSession(sessions, activeId);
  if (found) {
    return { sessions, activeId: found.id };
  }
  if (sessions.length > 0) {
    const first = sessions[0]!;
    return { sessions, activeId: first.id };
  }
  const fresh = createSession();
  return { sessions: [fresh], activeId: fresh.id };
}
