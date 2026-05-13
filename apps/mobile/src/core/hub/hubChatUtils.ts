/**
 * Mobile-side HubChat utilities — RN port of
 * `apps/web/src/core/lib/hubChatUtils.ts` minus DOM dependencies.
 *
 * The web version reads from `window.location.hash` for `getActiveModule`
 * and uses `requestIdleCallback`; both have no RN counterparts. On mobile
 * we keep the message-constructors, the SSE consumer, the friendly-error
 * helpers and the `/help`-command sniffer — that is everything the mobile
 * chat actually needs.
 *
 * Storage helpers (`ls` / `lsSet`) live in `@/lib/storage`, so the slim
 * adapter wrappers from the web file are unnecessary here.
 */

import { safeReadLS, safeRemoveLS, safeWriteLS } from "@/lib/storage";

export const CHAT_HISTORY_WRITE_DEBOUNCE_MS = 600;

export type ChatRole = "user" | "assistant";

/**
 * Wire-shape of a single chat message kept in memory and persisted to
 * MMKV under `hub_chat_sessions_v1`. Mirrors the web `ChatMessage`
 * union — the `cards` slot is optional and only present on assistant
 * turns where the backend tool-call returned a structured action card.
 */
export interface ChatActionCardLite {
  readonly id: string;
  readonly toolName: string;
  readonly status: "completed" | "failed";
  readonly title: string;
  readonly summary: string;
  readonly module: "finyk" | "fizruk" | "routine" | "nutrition" | "hub";
  readonly icon?: string;
  readonly risky?: boolean;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  cards?: ChatActionCardLite[];
  /** Forward-compat: any extra fields from persisted legacy entries. */
  [key: string]: unknown;
}

const INTRO_TEXT =
  "Привіт! Я твій особистий асистент. Запитуй про фінанси (Фінік), тренування (Фізрук), звички (Рутина) або харчування. На мобільному поки що працює текстовий чат — голос і tool-actions в роботі.";

export function newMsgId(): string {
  const rnd = globalThis.crypto?.randomUUID?.();
  return rnd ?? `m_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function makeAssistantMsg(text: string): ChatMessage {
  return { id: newMsgId(), role: "assistant", text };
}

export function makeUserMsg(text: string): ChatMessage {
  return { id: newMsgId(), role: "user", text };
}

export function normalizeStoredMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [makeAssistantMsg(INTRO_TEXT)];
  }
  return raw.map(
    (m: Partial<ChatMessage> & Record<string, unknown>, i): ChatMessage => ({
      role: "assistant" as ChatRole,
      text: "",
      ...m,
      id:
        (typeof m.id === "string" && m.id) ||
        `legacy_${i}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    }),
  );
}

/**
 * Чисто-мобільна обгортка над `safeReadLS` / `safeWriteLS` так, щоб
 * `hubChatSessions.ts` міг використовувати ті ж самі імена API, що
 * на web (без імпорту з `apps/web/...`).
 */
export function lsRead<T>(key: string): T | null {
  return safeReadLS<T>(key);
}

export function lsReadString(key: string): string | null {
  const v = safeReadLS<unknown>(key);
  return typeof v === "string" ? v : null;
}

export function lsWrite(key: string, value: unknown): void {
  safeWriteLS(key, value);
}

export function lsRemove(key: string): void {
  safeRemoveLS(key);
}

/**
 * HubChat-specific `friendlyApiError`. Mirrors the web rules: 500 with
 * a missing AI key and 429 quota messages get domain-specific copy.
 */
export function friendlyApiError(status: number, message?: string): string {
  const m = message || "";
  if (status === 500 && /ANTHROPIC|not set|key/i.test(m)) {
    return "Чат на сервері не налаштовано (немає ключа AI).";
  }
  if (status === 429 && /ліміт AI|AI_QUOTA|квот/i.test(m)) {
    return "Денний ліміт AI вичерпано. Спробуй завтра або зменш навантаження.";
  }
  if (status === 429) return "Забагато запитів. Спробуй через хвилину.";
  if (status === 401 || status === 403) return "Доступ заборонено.";
  return m || `Помилка ${status}`;
}

export function friendlyChatError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/failed to fetch|network|load failed/i.test(msg)) {
    return "Немає з'єднання з мережею або сервер недоступний.";
  }
  return `Помилка: ${msg}`;
}

/**
 * Поточний RN-runtime (Hermes 0.76) має `ReadableStream` із
 * `getReader()` — той же протокол, що в web-builds, тож SSE-consumer
 * портується без змін. Виклик зберігає сумісність з web-сервером:
 * `data: { "t": "delta" } \n` рядки + терміналізуючий `[DONE]`.
 */
export async function consumeHubChatSse(
  response: Response,
  onDelta: (delta: string) => void,
): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    for (;;) {
      const nl = buf.indexOf("\n");
      if (nl === -1) break;
      const line = buf.slice(0, nl).replace(/\r$/, "");
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") return;
      let j: { t?: string; err?: string };
      try {
        j = JSON.parse(raw);
      } catch {
        continue;
      }
      if (j.err) throw new Error(j.err);
      if (j.t) onDelta(j.t);
    }
  }
}

const HELP_RE = /^\/(help|допомога|команди|інструменти)\s*$/i;

export function isHelpCommand(text: string): boolean {
  return HELP_RE.test(text.trim());
}
