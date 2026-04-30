// Utility functions shared across HubChat modules

import { friendlyApiError as baseFriendlyApiError } from "@shared/lib/friendlyApiError";
import type { CapabilityModule } from "@sergeant/shared";
import type { ChatActionCard } from "./hubChatActionCards";

/**
 * Subset of `CapabilityModule` that has its own URL hash / nav surface.
 * Cross-cutting modules (`cross`, `analytics`, `utility`, `memory`) live
 * under the generic hub view, so they are represented by `null`.
 */
export type ActiveModule = Extract<
  CapabilityModule,
  "finyk" | "fizruk" | "routine" | "nutrition"
>;

export const CONTEXT_TTL_MS = 15_000;
export const CHAT_HISTORY_WRITE_DEBOUNCE_MS = 600;

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  /** Опційний набір action-карт (рендериться у `ChatMessage` UI). */
  cards?: ChatActionCard[];
  /** Optional extra fields preserved from persisted history. */
  [key: string]: unknown;
}

/**
 * Визначає активний модуль за URL hash. Раніше дублювалося inline у
 * `HubChat.tsx`; винесено сюди для перевикористання у quick actions
 * та подальших helper-ах. Якщо hash не вказує на жоден з відомих
 * модулів — повертає `null`.
 */
export function getActiveModule(): ActiveModule | null {
  try {
    const hash = (globalThis.window?.location?.hash || "")
      .replace(/^#\/?/, "")
      .toLowerCase();
    const first = hash.split(/[/?#]/)[0];
    if (
      first === "finyk" ||
      first === "fizruk" ||
      first === "routine" ||
      first === "nutrition"
    ) {
      return first;
    }
  } catch {
    /* noop */
  }
  return null;
}

/**
 * HubChat-специфічний `friendlyApiError`. Додає два кейси поверх
 * загального мапера в `@shared/lib/friendlyApiError`:
 *  - 500 без ключа AI → окремий текст про чат;
 *  - 429 з маркером AI_QUOTA / «ліміт AI» → явне повідомлення про
 *    денний ліміт (замість загального «Забагато запитів»).
 */
export function friendlyApiError(status: number, message?: string): string {
  const m = message || "";
  if (status === 500 && /ANTHROPIC|not set|key/i.test(m)) {
    return "Чат на сервері не налаштовано (немає ключа AI).";
  }
  if (status === 429 && /ліміт AI|AI_QUOTA|квот/i.test(m)) {
    return "Денний ліміт AI вичерпано. Спробуй завтра або зменш навантаження.";
  }
  return baseFriendlyApiError(status, message);
}

export function friendlyChatError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/failed to fetch|network|load failed/i.test(msg)) {
    return "Немає з'єднання з мережею або сервер недоступний.";
  }
  return `Помилка: ${msg}`;
}

/** Читає SSE з /api/chat (data: {"t":"..."} / [DONE]). Рядок за рядком — стійко до часткових чанків. */
export async function consumeHubChatSse(
  response: Response,
  onDelta: (delta: string) => void,
): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
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

export function newMsgId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `m_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  );
}

export function makeAssistantMsg(text: string): ChatMessage {
  return { id: newMsgId(), role: "assistant", text };
}

export function makeUserMsg(text: string): ChatMessage {
  return { id: newMsgId(), role: "user", text };
}

export function normalizeStoredMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [
      makeAssistantMsg(
        "Привіт! Я твій особистий асистент. Запитуй про фінанси (Фінік), тренування (Фізрук), звички (Рутина) або харчування. Можу також змінювати категорії, додавати борги, відмічати звички та записувати прийоми їжі.",
      ),
    ];
  }
  return raw.map((m: Partial<ChatMessage> & Record<string, unknown>, i) => ({
    role: "assistant" as ChatRole,
    text: "",
    ...m,
    id:
      (typeof m.id === "string" && m.id) ||
      `legacy_${i}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  }));
}

export function ls<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString("uk-UA");
}

// IdleHandle can be either requestIdleCallback id (number) or setTimeout id (ReturnType<typeof setTimeout>)
// We use a union type to avoid unsafe casts
export type IdleHandle = number | ReturnType<typeof setTimeout>;

export function requestIdle(cb: () => void): IdleHandle {
  if (typeof window !== "undefined") {
    if (window.requestIdleCallback)
      return window.requestIdleCallback(cb, { timeout: 800 });
    return window.setTimeout(cb, 0);
  }
  setTimeout(cb, 0);
  return 0;
}

export function cancelIdle(id: IdleHandle): void {
  if (typeof window === "undefined") {
    clearTimeout(id as ReturnType<typeof setTimeout>);
    return;
  }
  if (window.cancelIdleCallback && typeof id === "number") {
    window.cancelIdleCallback(id);
    return;
  }
  clearTimeout(id as ReturnType<typeof setTimeout>);
}

const HELP_RE = /^\/(help|допомога|команди|інструменти)\s*$/i;

export function isHelpCommand(text: string): boolean {
  return HELP_RE.test(text.trim());
}
