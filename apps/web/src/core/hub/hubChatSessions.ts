import {
  safeReadStringLS,
  safeRemoveLS,
  safeWriteLS,
} from "@shared/lib/storage/storage";
import {
  chatLegacyHistorySlot,
  chatSessionsMirrorSlot,
  chatSessionsSlot,
} from "../security/aiAtRest";
import { getKyivShortDateStamp } from "@shared/lib/time/kyivTime";
import { ACTIVE_SESSION_KEY } from "./hubChatOwner";
import { normalizeStoredMessages, type ChatMessage } from "../lib/hubChatUtils";

const SESSION_LIMIT = 20;
const MESSAGES_PER_SESSION = 60;

// Власник-штамп і прибирання при зміні особи живуть у `hubChatOwner.ts`
// (без залежності від aiAtRest, щоб не тягнути його в eager-чанк).
export {
  ACTIVE_SESSION_KEY,
  CHAT_OWNER_KEY,
  SESSIONS_MIRROR_KEY,
  SESSIONS_STORAGE_KEY,
  deviceOwnerIsUser,
  readDeviceOwnerId,
  reconcileChatOwnerOnAuthChange,
  type ChatOwnerReconcileResult,
} from "./hubChatOwner";

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

// A brand-new session (`createSession()` with no args) gets `msgs: []`
// from `normalizeStoredMessages(null)` — PR-A7: no synthesized greeting.
// `<ChatEmpty>` itself was removed by redesign v3 PR0 (п. 20, 35, рішення
// власника), so an empty session is the AI disclosure above an empty feed
// plus the quick-action chips in the composer. A synthesized greeting would
// bring back exactly the prose PR0 removed, as a fake persisted message.
// Do not special-case an empty result here to re-add one.
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
  const existing = chatSessionsSlot.read();
  if (existing) return null;
  const parsed = parseJson(chatLegacyHistorySlot.read());
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

/** Історія чату зберігається зашифрованою (aiAtRest), слот віддає JSON-текст. */
function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
  return parseSessionsBlob(parseJson(chatSessionsMirrorSlot.read()));
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
  const primary = parseSessionsBlob(parseJson(chatSessionsSlot.read()));
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
  void chatSessionsSlot.write(JSON.stringify(trimmed));
  // Синхронне дзеркало проти гонки «запис → релоад» (див. `loadSessions`).
  // Пишемо під ОКРЕМИМ ключем, а не durable-хелпером по основному: інакше
  // `bootstrapKvStore()` підняв би дзеркало у warm-cache як основне значення,
  // і порівняння за `updatedAt` втратило б другий бік.
  void chatSessionsMirrorSlot.write(JSON.stringify(trimmed));

  // Mirror the most recent session's tail back into the legacy
  // `hub_chat_history` key so `hubBackup.buildHubBackupPayload`
  // (`includeChat=true`) keeps producing the same export shape it
  // always has. Without this shim the migration would silently empty
  // out chat exports for users on the new schema.
  const newest = trimmed[0];
  if (newest) {
    void chatLegacyHistorySlot.write(
      JSON.stringify(newest.messages.slice(-30)),
    );
  }
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
