// AI-CONTEXT: prompt-caching хелпери для chat-handler-а, винесені з `chat.ts`
// (Hard Rule #18 — module-size discipline; chat.ts давно понад 600-рядковий
// cap). Чисті функції без side-effects: легко юніт-тестувати окремо
// (`promptCache.test.ts`) і тримати `chat.ts` тоншим. Поведінка ідентична до
// інлайн-версії: жодна не мутує вхід.

import { TOOLS, SYSTEM_PREFIX } from "./tools.js";

/**
 * Anthropic prompt-caching, три точки розриву (cache breakpoints). Порядок
 * рендеру в Anthropic — `tools` → `system` → `messages`; кожен `cache_control`
 * кешує весь префікс ДО себе включно. Мінімальний кешований префікс залежить
 * від моделі: Haiku 4.5 (перший тур) — 4096 токенів, Sonnet 4.6 (tool-result
 * тур) — 2048. TTL ephemeral = 5 хв. Ліміт Anthropic — max 4 breakpoint-и/запит.
 *
 * 1. **SYSTEM_PREFIX** (`buildSystem`) — окремий cached `text`-блок. Сам по собі
 *    ~987 токенів, нижче обох мінімумів, тому власного слоту не реєструє; але
 *    оскільки tools рендеряться ПЕРЕД system, сумарний префікс tools+SYSTEM_PREFIX
 *    перевищує поріг і кешується.
 *
 * 2. **Останній tool** (`applyToolsCacheBreakpoint`) — кешує всі tools (~19 шт).
 *    Tools + SYSTEM_PREFIX разом — стабільний блок ~6000+ токенів, спільний між
 *    усіма запитами; основний cache-read на кожному турі.
 *
 * 3. **Останнє повідомлення** (`applyMessagesCacheBreakpoint`) — кешує префікс
 *    історії діалогу. На наступному турі клієнт дошле історію як префікс, і
 *    Anthropic віддасть її з кешу (~0.1× ціни input) замість повторного білінгу.
 *    Застосовується ЛИШЕ на першому турі (`cleaned` несе повну історію); на
 *    tool-result турі шлеться ефемерний one-shot (останній user + tool-раунд),
 *    тож кеш там був би марним 1.25× write без re-read.
 *
 * Per-user `context` рендериться другим блоком system — **без** `cache_control`,
 * щоб не створювати власного cache slot per-user-ом. Але оскільки cache key
 * охоплює весь system, різний context між юзерами все одно фрагментує кеш (один слот
 * на user). Це ОК: юзер в межах своєї сесії (5хв) отримує багато cache_read.
 *
 * Коли `context` порожній, Anthropic API відхиляє `text`-блоки з empty `text`,
 * тому під cap-ом повертаємо лише самий cached prefix.
 */
export interface AnthropicSystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

export function buildSystem(context: string): AnthropicSystemBlock[] {
  const cached: AnthropicSystemBlock = {
    type: "text",
    text: SYSTEM_PREFIX,
    cache_control: { type: "ephemeral" },
  };
  if (!context) return [cached];
  return [cached, { type: "text", text: context }];
}

/**
 * Клонує `TOOLS` і додає `cache_control: ephemeral` до останнього tool. Не
 * мутує імпортований масив, бо він реєкспортиться в інших місцях.
 *
 * Anthropic кешує весь префікс ДО цього блоку включно (порядок рендеру:
 * tools → system → messages). Разом із cache_control на SYSTEM_PREFIX це кешує
 * стабільний блок tools + system на кожному турі.
 */
export function applyToolsCacheBreakpoint<T extends object>(
  tools: readonly T[],
): Array<T & { cache_control?: { type: "ephemeral" } }> {
  if (tools.length === 0) return [];
  const cloned = tools.slice() as Array<
    T & { cache_control?: { type: "ephemeral" } }
  >;
  const last = cloned[cloned.length - 1];
  cloned[cloned.length - 1] = {
    ...last,
    cache_control: { type: "ephemeral" },
  } as T & { cache_control: { type: "ephemeral" } };
  return cloned;
}

/**
 * Anthropic strict-mode schemas currently compile reliably only for very small
 * subsets. Keep the full registry annotated for internal validation, but send
 * the live provider payload in non-strict mode so `/api/chat` stays available.
 */
export function stripStrictModeForAnthropic<T extends { strict?: unknown }>(
  tools: readonly T[],
): Array<Omit<T, "strict">> {
  return tools.map(({ strict: _strict, ...tool }) => tool);
}

/**
 * Tools із cache breakpoint на останньому — обчислюється один раз при імпорті
 * модуля (TOOLS статичний), щоб не клонувати масив на кожен запит.
 */
export const TOOLS_WITH_CACHE = applyToolsCacheBreakpoint(
  stripStrictModeForAnthropic(TOOLS),
);

/**
 * Вхід для `applyMessagesCacheBreakpoint` — мінімальна структурна форма
 * повідомлення (string-content). `ClientChatMessage` із `chat.ts` структурно
 * сумісний; тримаємо тип локальним, щоб уникнути циклічного імпорту.
 */
export interface CacheableInputMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Message-content shape після того, як останньому повідомленню додали
 * cache-breakpoint: або сирий string (як прийшло від клієнта), або масив
 * content-блоків з `cache_control` на одному з них.
 */
export type CachedMessage =
  | { role: "user" | "assistant"; content: string }
  | { role: "user" | "assistant"; content: Array<Record<string, unknown>> };

/**
 * Третій cache breakpoint (див. § doc вгорі): додає `cache_control: ephemeral`
 * до ОСТАННЬОГО повідомлення, щоб префікс історії діалогу читався з кешу на
 * наступному турі. String-content обгортається в один `text`-блок із
 * cache_control; масив-content (tool_use / tool_result) отримує cache_control на
 * останній блок (defensive — `cleaned` завжди має string-content, тож у проді
 * спрацьовує перша гілка). Чистий: повертає НОВИЙ масив, вхід не мутується.
 */
export function applyMessagesCacheBreakpoint(
  messages: CacheableInputMessage[],
): CachedMessage[] {
  if (messages.length === 0) return messages;
  const out: CachedMessage[] = messages.slice();
  const lastIdx = out.length - 1;
  const last = messages[lastIdx]!;
  out[lastIdx] = {
    role: last.role,
    content: [
      {
        type: "text",
        text: last.content,
        cache_control: { type: "ephemeral" },
      },
    ],
  };
  return out;
}
