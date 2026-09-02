// Utility functions shared across HubChat modules

import { isApiError } from "@sergeant/api-client";
import { friendlyApiError as baseFriendlyApiError } from "@shared/lib/api/friendlyApiError";
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
 * Єдиний текст для «сервер не пустив без сесії».
 *
 * `/api/chat` стоїть за `requireSession()` (аудит `ai-abuse-2026-08-05.md`,
 * A1) — анонімного AI не існує НАВМИСНО, і послаблювати це не можна. Але
 * загальний мапер віддавав на 401/403 суху «Доступ заборонено.», яку
 * `friendlyChatError` ще й обгортав у «Помилка: …», тож незалогінений
 * відвідувач упирався в глухий кут без жодної підказки (browser QA
 * 2026-08-23). Текст називає вихід; кнопку входу дає `ChatAuthGate`.
 */
export const CHAT_AUTH_REQUIRED_TEXT =
  "Асистент працює після входу в акаунт. Увійди, і повернемось до розмови.";

/**
 * HubChat-специфічний `friendlyApiError`. Додає три кейси поверх
 * загального мапера в `@shared/lib/friendlyApiError`:
 *  - 401/403 → чесний текст «потрібен вхід» (див. `CHAT_AUTH_REQUIRED_TEXT`);
 *  - 500 без ключа AI → окремий текст про чат;
 *  - 429 `AI_QUOTA_PRESET` → серверна копія проходить БЕЗ перезапису;
 *  - 429 з маркером AI_QUOTA / «ліміт AI» → явне повідомлення про
 *    денний ліміт (замість загального «Забагато запитів»).
 *
 * AI-CONTEXT: `code` читається з тіла відповіді, а не з тексту — так копія
 * лишається на сервері в одному екземплярі й не дрейфує.
 *
 * Гілки `AI_QUOTA_ANON` тут більше немає: сервер прибрав анонімне квотне
 * відро цілком, `/api/chat` session-gated, тож анонім отримує 401, а не 429
 * (репорт server-агента 2026-08-23). Її колишню роботу — сказати гостю, що
 * вихід у вході, — тепер робить гілка 401/403 разом із `ChatAuthGate`.
 */
export function friendlyApiError(
  status: number,
  message?: string,
  code?: string,
): string {
  const m = message || "";
  if (status === 401 || status === 403) return CHAT_AUTH_REQUIRED_TEXT;
  if (status === 500 && /ANTHROPIC|not set|key/i.test(m)) {
    return "Чат на сервері не налаштовано (немає ключа AI).";
  }
  // Сценарний preset має власне ТИЖНЕВЕ відро, тож «спробуй завтра» нижче
  // для нього просто неправда, а вихід інший — ручне заповнення профілю.
  if (status === 429 && code === "AI_QUOTA_PRESET" && m) {
    return m;
  }
  if (status === 429 && /ліміт AI|AI_QUOTA|квот/i.test(m)) {
    return "Денний ліміт AI вичерпано. Спробуй завтра або зменш навантаження.";
  }
  // Шлюзові збої приходять від проксі, а не від застосунку, тож тіла з
  // поясненням у них немає — і на екран виїжджало голе «Помилка 504», яке
  // не каже ні що сталось, ні що робити (звіт власника 2026-09-02).
  //
  // Текст живе саме ТУТ, а не в спільному мапері: там форма `Помилка N` є
  // сигналом для `formatApiError` підставити caller-специфічний fallback
  // («Помилка генерації звіту»), і перебивати його загальним текстом про
  // шлюз означало б забрати контекст у кожного викликача. У чату свого
  // fallback-у немає, тож потрібен саме тут.
  //
  // 504 окремо від 502/503: там таймаут, і повтор має сенс — наступна
  // спроба може вкластися. Обидві гілки під `!m`: якщо проксі все ж дав
  // тіло, воно конкретніше.
  if (!m && status === 504) {
    return "Сервер не встиг відповісти. Спробуй ще раз.";
  }
  if (!m && (status === 502 || status === 503)) {
    return "Сервер тимчасово недоступний. Спробуй за хвилину.";
  }
  return baseFriendlyApiError(status, message);
}

/**
 * AI-DANGER: HTTP-помилка приходить сюди з `message`, ЯКИЙ УЖЕ пройшов
 * `friendlyApiError` — `useChatSend` перезаписує його перед тим, як кинути
 * далі (див. коментар «Rewrite `message` to user-friendly» там же). Тому
 * сліпий префікс наприкінці цієї функції давав «Помилка: Помилка 504»:
 * двічі те саме слово, і жодної підказки, що робити (звіт власника
 * 2026-09-02).
 *
 * Гілка 401/403 нижче була плястиром на ту саму рану — вона ловила рівно
 * один випадок із багатьох. Тепер причина знята за ТИПОМ, а не за виглядом
 * рядка: HTTP-помилка вже готова до показу, тож віддається як є. Префікс
 * лишається лише для СИРИХ помилок (мережеві винятки, `TypeError`), де без
 * нього незрозуміло, що це взагалі збій.
 *
 * Перевіряти тут довжину чи початок рядка не можна: `friendlyApiError`
 * віддає й тексти без слова «Помилка» («Доступ заборонено.», «Сервер не
 * встиг відповісти.»), і вони так само не потребують обгортки.
 */
export function friendlyChatError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/failed to fetch|network|load failed/i.test(msg)) {
    return "Немає зʼєднання з мережею або сервер недоступний.";
  }
  if (isApiError(e) && e.kind === "http") return msg;
  // `/api/chat` стоїть за `requireSession()` (аудит `ai-abuse-2026-08-05.md`, A1),
  // тож анонім упирається сюди. Сервер віддає «Потрібна автентифікація» —
  // технічно правильно, але без підказки, що робити далі. Другий рукав —
  // вже перекладений `friendlyApiError` текст: без нього повідомлення
  // виїжджало назовні як «Помилка: Доступ заборонено.».
  if (
    /Потрібна автентифікація|UNAUTHORIZED|Доступ заборонено/i.test(msg) ||
    msg === CHAT_AUTH_REQUIRED_TEXT
  ) {
    return CHAT_AUTH_REQUIRED_TEXT;
  }
  return `Помилка: ${msg}`;
}

/** Максимум байтів усього SSE-потоку чату. 256 КБ ≈ 60-80 тис. символів — більше за будь-яку розумну AI-відповідь. Час обмежує `useChatSend` (90 с), цей ліміт обмежує память і CPU на rerender. */
const MAX_SSE_TOTAL_BYTES = 256 * 1024;
/** Максимум на одну SSE-лінію (між `\n`). Захист від runaway-server, що шле один рядок без переносів. */
const MAX_SSE_LINE_BYTES = 8 * 1024;

/** Читає SSE з /api/chat (data: {"t":"..."} / [DONE]). Рядок за рядком — стійко до часткових чанків. Кидає `Error("Відповідь занадто довга")` якщо потік перевищує MAX_SSE_TOTAL_BYTES або одна лінія перевищує MAX_SSE_LINE_BYTES. */
export async function consumeHubChatSse(
  response: Response,
  onDelta: (delta: string) => void,
): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      totalBytes += value.byteLength;
      if (totalBytes > MAX_SSE_TOTAL_BYTES) {
        try {
          await reader.cancel();
        } catch {
          /* reader вже закритий — гнатися немає за чим */
        }
        throw new Error("Відповідь занадто довга");
      }
    }
    buf += dec.decode(value, { stream: true });
    if (buf.length > MAX_SSE_LINE_BYTES && buf.indexOf("\n") === -1) {
      try {
        await reader.cancel();
      } catch {
        /* див. вище */
      }
      throw new Error("Відповідь занадто довга");
    }
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
    `m_${Date.now()}_${crypto.randomUUID()}`
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
      `legacy_${i}_${Date.now()}_${crypto.randomUUID()}`,
  }));
}

// Thin adapters over the canonical safe-storage helpers.
// Callers import `ls`/`lsSet` for backward-compat; new code should prefer
// `safeReadLS`/`safeWriteLS` from `@shared/lib/storage` directly.
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { formatNumberUk } from "@sergeant/shared";

export function ls<T>(key: string, fallback: T): T {
  return (safeReadLS<T>(key) as T | null) ?? fallback;
}

export function lsSet(key: string, value: unknown): void {
  safeWriteLS(key, value);
}

export function fmt(n: number): string {
  return formatNumberUk(Math.round(n));
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
