import {
  resolveLsStore,
  safeReadLS,
  safeReadStringLS,
  safeRemoveLS,
  safeRemoveLSDurable,
  safeWriteLS,
  safeWriteStringLSDurable,
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
/**
 * Синхронне localStorage-дзеркало сесій. Існує лише щоб пережити релоад,
 * який випередив асинхронний запис у SQLite — розбір у `loadSessions`.
 */
export const SESSIONS_MIRROR_KEY = "hub_chat_sessions_mirror_v1";
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

/** Найсвіжіший `updatedAt` у наборі; `-1` для порожнього чи битого. */
function newestUpdatedAt(sessions: readonly HubChatSession[]): number {
  let newest = -1;
  for (const s of sessions) {
    const at = typeof s.updatedAt === "number" ? s.updatedAt : -1;
    if (at > newest) newest = at;
  }
  return newest;
}

function parseSessionsBlob(raw: unknown): HubChatSession[] {
  if (!Array.isArray(raw)) return [];
  try {
    return raw
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

function readMirroredSessions(): HubChatSession[] {
  const raw = resolveLsStore()?.getString(SESSIONS_MIRROR_KEY);
  if (!raw) return [];
  try {
    return parseSessionsBlob(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function loadSessions(): HubChatSession[] {
  // Порядок принциповий: спершу зводимо ОБИДВА поточні джерела, і лише якщо
  // там порожньо — дивимось на legacy-ключ.
  //
  // AI-DANGER: доти `migrateLegacyIfNeeded()` стояв ПЕРШИМ і перевіряв лише
  // `SESSIONS_STORAGE_KEY`. У сценарії, заради якого дзеркало й існує
  // (основний асинхронний запис не долетів), свіжі сесії лежали в дзеркалі,
  // а старий непорожній `hub_chat_history` перехоплював гілку — і
  // `saveSessions(migrated)` затирав ними дзеркало. Тобто фікс гонки мав
  // власну дірку рівно тієї ж форми (рев'ю CodeRabbit на PR #1053).
  const current = reconcileSessions();
  if (current.length > 0) return current;

  const migrated = migrateLegacyIfNeeded();
  if (migrated) {
    saveSessions(migrated);
    return migrated;
  }
  return [];
}

/** Зводить основний ключ і синхронне дзеркало, беручи свіжіше за `updatedAt`. */
function reconcileSessions(): HubChatSession[] {
  // Читаємо ОБИДВА джерела і беремо свіжіше за `updatedAt`.
  //
  // AI-DANGER: тут не можна віддати перевагу одному джерелу назавжди, і саме
  // на цьому баг і тримався. `safeWriteLS` пише в SQLite fire-and-forget
  // (`createSqliteKVStore` — warm-cache + асинхронний upsert), тож сплеск
  // повідомлень і релоад за ним втрачали запис: warm-cache гине разом зі
  // сторінкою, а до OPFS воно доїхати не встигало. Браузерний QA 2026-09-02
  // ловив зникнення всієї історії з 20+ повідомлень навіть через 3 с після
  // останнього запису — уп'ятеро довше за debounce.
  //
  // Дзеркало в localStorage синхронне і цю гонку закриває, але зробити його
  // безумовно головним не можна: якщо запис у localStorage не пройшов
  // (квота — адаптер ковтає помилку мовчки), головним стало б СТАРЕ дзеркало,
  // і ми обміняли б одну втрату на іншу. Автоматичне відновлення в
  // `bootstrapKvStore()` теж не рятує — воно діє лише для ключів, ВІДСУТНІХ
  // у SQLite, а не для застарілих.
  //
  // Тому джерело істини визначає дані, а не походження: перемагає той бік, у
  // якого свіжіший `updatedAt`. Це самовиправно в обидва боки.
  const primary = parseSessionsBlob(safeReadLS<unknown>(SESSIONS_STORAGE_KEY));
  const mirrored = readMirroredSessions();
  if (mirrored.length === 0) return primary;
  if (primary.length === 0) return mirrored;
  return newestUpdatedAt(mirrored) > newestUpdatedAt(primary)
    ? mirrored
    : primary;
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
  // Синхронне дзеркало проти гонки «запис → релоад» (див. `loadSessions`).
  // Пишемо під ОКРЕМИМ ключем, а не durable-хелпером по основному: інакше
  // `bootstrapKvStore()` підняв би дзеркало у warm-cache як основне значення,
  // і порівняння за `updatedAt` втратило б другий бік.
  safeWriteStringLSDurable(SESSIONS_MIRROR_KEY, JSON.stringify(trimmed));

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
    // Дзеркало мусить гинути РАЗОМ з основним ключем: інакше приватність F12
    // (нижче в докстрінгу) обходиться через нього — наступний залогінений
    // юзер на тому ж пристрої прочитав би історію попереднього.
    safeRemoveLSDurable(SESSIONS_MIRROR_KEY);
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
