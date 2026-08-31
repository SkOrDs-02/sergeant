import {
  safeReadLS,
  safeReadStringLS,
  safeRemoveLS,
  safeWriteLS,
} from "@shared/lib/storage/storage";
import { getKyivShortDateStamp } from "@shared/lib/time/kyivTime";
import { normalizeStoredMessages, type ChatMessage } from "../lib/hubChatUtils";

export const SESSIONS_STORAGE_KEY = "hub_chat_sessions_v1";
export const ACTIVE_SESSION_KEY = "hub_chat_active_session_v1";
const LEGACY_KEY = "hub_chat_history";
/**
 * Privacy F12 (браузерна верифікація 2026-08-06): чат-ключі плоскі —
 * без цього стампа історія розмов попереднього акаунта (фінанси,
 * здоровʼя) читалась наступним залогіненим юзером на тому ж пристрої.
 */
export const CHAT_OWNER_KEY = "hub_chat_owner_v1";
const ANON_OWNER = "__anon__";
const SESSION_LIMIT = 20;
const MESSAGES_PER_SESSION = 60;

export interface HubChatSession {
  id: string;
  title: string;
  /**
   * Audit F14: де лежить current `title`. `"auto"` (default) — debounced
   * flush у `useChatSessions` може пере-derive-ити з першого user message;
   * `"user"` — manual rename взяв ownership, auto-rewrite не чіпає.
   * Optional для backward-compat зі старими сесіями — для них працює
   * legacy prefix heuristic ("Бесіда " / "Нова бесіда").
   */
  titleSource?: "auto" | "user" | undefined;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

function newId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `s_${Date.now()}_${crypto.randomUUID()}`
  );
}

/**
 * First user message (truncated) or fallback Ukrainian title.
 * Used when the user hasn't named a session — `Бесіда від <date>` stays
 * stable so sessions stay distinguishable in the drawer.
 */
export function deriveSessionTitle(
  msgs: ChatMessage[],
  createdAt: number,
): string {
  const firstUser = msgs.find((m) => m.role === "user" && m.text?.trim());
  if (firstUser) {
    const text = firstUser.text.trim().replace(/\s+/g, " ");
    return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  }
  // Kyiv-local so session titles read consistently regardless of the host
  // device timezone (consolidated page-audit § Theme 1 — 03 F1).
  return `Бесіда ${getKyivShortDateStamp(createdAt)}`;
}

function createInitialSession(messages?: ChatMessage[]): HubChatSession {
  const now = Date.now();
  const msgs = normalizeStoredMessages(messages ?? null);
  return {
    id: newId(),
    title: deriveSessionTitle(msgs, now),
    titleSource: "auto",
    createdAt: now,
    updatedAt: now,
    messages: msgs,
  };
}

/**
 * One-time migration from `hub_chat_history` (single-session, last 30
 * messages) to `hub_chat_sessions_v1` (multi-session). Idempotent: if
 * the new key already has data, leaves it untouched.
 */
function migrateLegacyIfNeeded(): HubChatSession[] | null {
  const existing = safeReadStringLS(SESSIONS_STORAGE_KEY);
  if (existing) return null;
  const parsed = safeReadLS<unknown>(LEGACY_KEY);
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
  const parsed = safeReadLS<unknown>(SESSIONS_STORAGE_KEY);
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
  // Keep newest first; cap at SESSION_LIMIT and trim each session's
  // tail so localStorage doesn't grow unbounded.
  const trimmed = sessions
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, SESSION_LIMIT)
    .map((s) => ({
      ...s,
      messages: s.messages.slice(-MESSAGES_PER_SESSION),
    }));
  safeWriteLS(SESSIONS_STORAGE_KEY, trimmed);

  // Mirror the most recent session's tail back into the legacy
  // `hub_chat_history` key so `hubBackup.buildHubBackupPayload`
  // (`includeChat=true`) keeps producing the same export shape it
  // always has. Without this shim the migration would silently empty
  // out chat exports for users on the new schema.
  const newest = trimmed[0];
  if (newest) {
    safeWriteLS(LEGACY_KEY, newest.messages.slice(-30));
  }
}

/**
 * Wipe chat history when the device identity changes (F12 privacy).
 *
 * Called from `AuthProvider` whenever the resolved auth identity settles
 * (`userId` — Better Auth id, `null` — signed-out/anonymous). Semantics:
 *
 *  - first ever call (no stored owner) → stamp only, keep sessions: an
 *    anonymous visitor who signs up keeps their draft conversation (same
 *    continuity contract as the anonymous-data migration);
 *  - stored owner differs from the new identity → wipe sessions + active
 *    id + the legacy mirror, then stamp. Covers logout (user → anon) and
 *    a different account signing in on the shared device.
 *
 * @returns `changed` — a previous different owner's chat state was wiped
 *   (the caller's "identity actually changed on this device" signal for
 *   clearing other non-user-scoped residue, e.g. quick-stats);
 *   `prevOwnerWasUser` — that previous owner was an AUTHENTICATED user
 *   (not the anonymous placeholder). Only this stricter signal may
 *   trigger the heavy teardown (React-Query clear + persisted-snapshot
 *   purge + reload): an `anon → user` transition must stay soft so the
 *   anonymous-data migration can carry local drafts into the account.
 */
export interface ChatOwnerReconcileResult {
  changed: boolean;
  prevOwnerWasUser: boolean;
}

export function reconcileChatOwnerOnAuthChange(
  userId: string | null,
): ChatOwnerReconcileResult {
  const nextOwner = userId ?? ANON_OWNER;
  const prevOwner = safeReadStringLS(CHAT_OWNER_KEY);
  if (prevOwner === nextOwner) {
    return { changed: false, prevOwnerWasUser: false };
  }
  const changed = prevOwner !== null;
  if (changed) {
    safeRemoveLS(SESSIONS_STORAGE_KEY);
    safeRemoveLS(ACTIVE_SESSION_KEY);
    safeRemoveLS(LEGACY_KEY);
  }
  safeWriteLS(CHAT_OWNER_KEY, nextOwner);
  return {
    changed,
    prevOwnerWasUser: changed && prevOwner !== ANON_OWNER,
  };
}

export function loadActiveSessionId(): string | null {
  return safeReadStringLS(ACTIVE_SESSION_KEY);
}

export function saveActiveSessionId(id: string | null): void {
  if (id == null) {
    safeRemoveLS(ACTIVE_SESSION_KEY);
  } else {
    safeWriteLS(ACTIVE_SESSION_KEY, id);
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
  if (found) return { sessions, activeId: found.id };
  const first = sessions[0];
  if (first) {
    return { sessions, activeId: first.id };
  }
  const fresh = createSession();
  return { sessions: [fresh], activeId: fresh.id };
}
