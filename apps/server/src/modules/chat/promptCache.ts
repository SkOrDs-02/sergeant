// AI-CONTEXT: prompt-caching хелпери для chat-handler-а, винесені з `chat.ts`
// (Hard Rule #18 — module-size discipline; chat.ts давно понад 600-рядковий
// cap). Чисті функції без side-effects: легко юніт-тестувати окремо
// (`promptCache.test.ts`) і тримати `chat.ts` тоншим. Поведінка ідентична до
// інлайн-версії: жодна не мутує вхід.

import { env } from "../../env.js";
import { presetInstruction } from "./chatPresets.js";
import { TOOLS, SYSTEM_PREFIX, filterToolsByActiveModules } from "./tools.js";
import type { DashboardModuleId } from "@sergeant/shared";
import { wrapAndScanUserContext } from "./toolOutputWrapping.js";
import {
  buildToolSearchPayload,
  isCacheable,
  modelSupportsToolSearch,
} from "./toolSearch.js";

/**
 * Anthropic prompt-caching, три точки розриву (cache breakpoints). Порядок
 * рендеру в Anthropic — `tools` → `system` → `messages`; кожен `cache_control`
 * кешує весь префікс ДО себе включно. Мінімальний кешований префікс залежить
 * від моделі: Haiku 4.5 (перший тур) — 4096 токенів, Sonnet 4.6 (tool-result
 * тур) — 2048. TTL ephemeral = 5 хв. Ліміт Anthropic — max 4 breakpoint-и/запит.
 *
 * 1. **SYSTEM_PREFIX** (`buildSystem`) — окремий cached `text`-блок. Сам по собі
 *    ~1.1-1.7k токенів (вимір 2026-07-25), нижче обох мінімумів, тому власного
 *    слоту не реєструє; але
 *    оскільки tools рендеряться ПЕРЕД system, сумарний префікс tools+SYSTEM_PREFIX
 *    перевищує поріг і кешується.
 *
 * 2. **Останній НЕ-deferred tool** (`applyToolsCacheBreakpoint`) — кешує
 *    tools-блок. Tools + SYSTEM_PREFIX разом — стабільний блок, спільний між
 *    усіма запитами; основний cache-read на кожному турі.
 *
 *    ВИМІРЯНО 2026-07-25: **77 інструментів, 43 КБ JSON, разом із
 *    SYSTEM_PREFIX ≈ 14 400-21 200 токенів.** Тут раніше стояло «~19 шт» і
 *    «~6000+ токенів» — застаріло в 2.4-3.5 рази, і на цій цифрі вже було
 *    побудовано заниження unit-економіки (див.
 *    `docs/01-product/launch/business/01-monetization-and-pricing.md` § 9.5).
 *
 *    Саме цей вимір і породив дві зміни нижче — TTL=1h і tool search.
 *
 * **TTL.** Tools і SYSTEM_PREFIX кешуються на `ttl: "1h"`, повідомлення —
 * на дефолтних 5 хв. Розрахунок для N повідомлень у межах години: 5 хв дає
 * ≈1.25·N (майже кожне холодне), 1h дає 2 + 0.1·(N−1). Рівність при N≈1.65,
 * тобто вже з другого повідомлення в сесії 1h вигідніший — а сесія з одного
 * повідомлення в чат-асистенті практично не трапляється. Повідомлення
 * лишаються на 5 хв свідомо: наступний тур приходить за секунди, і платити
 * 2× за запис, який прочитають один раз, сенсу немає.
 *
 * AI-CONTEXT (2026-08-04): уся арифметика вище чинна ЛИШЕ для прямого
 * Anthropic. Під `CHAT_VIA_OPENROUTER=true` кеш не вмикається взагалі
 * (виміряно: `cache_read` = 0 навіть із явним `cache_control` на блоці
 * 3958 токенів) — ці breakpoint-и просто ігноруються шлюзом.
 *
 * Це НЕ робить шлюз дорожчим за замовчуванням, і саме тут я один раз помилився:
 * «є кеш» порівнювалося з «немає кешу» на одній моделі, хоча слот міняє і
 * модель. Кешований `haiku-4.5` коштує $5.60/1k на сесії з 5 повідомлень і
 * $2.60 на 20; `deepseek-v4-flash` без кешу — $1.51/1k на будь-якій довжині.
 * Кеш виграє порівняння тільки якщо по обидва боки та сама модель.
 *
 * AI-DANGER: Anthropic вимагає, щоб блоки з ДОВШИМ TTL стояли ПЕРЕД
 * коротшими. Порядок рендеру `tools → system → messages` це задовольняє
 * (1h, 1h, 5m). Якщо колись зʼявиться четвертий breakpoint — став його з
 * урахуванням цього правила, інакше отримаєш 400.
 *
 * **Tool search.** Решта інструментів іде з `defer_loading: true` і в
 * контекст не потрапляє взагалі — деталі й обмеження в `toolSearch.ts`.
 * Перш ніж додавати інструменти, порахуй, скільки це додає до КОЖНОГО
 * холодного запиту (для гарячого набору — до кожного; для deferred —
 * лише коли модель його знайде).
 *
 * 3. **Останнє повідомлення** (`applyMessagesCacheBreakpoint`) — кешує префікс
 *    історії діалогу. На наступному турі клієнт дошле історію як префікс, і
 *    Anthropic віддасть її з кешу (~0.1× ціни input) замість повторного білінгу.
 *    Застосовується ЛИШЕ на першому турі (`cleaned` несе повну історію); на
 *    tool-result турі шлеться ефемерний one-shot (останній user + tool-раунд),
 *    тож кеш там був би марним 1.25× write без re-read.
 *
 * Per-user `context` рендериться ДРУГИМ блоком system — **без** `cache_control`
 * і, головне, ПІСЛЯ breakpoint-а на SYSTEM_PREFIX. Anthropic кешує префікс
 * up-to-and-including кожен breakpoint, тож shared-блок `tools + SYSTEM_PREFIX`
 * (breakpoint #1/#2) закривається ще ДО per-user context → цей cache однаковий
 * для ВСІХ юзерів і НЕ фрагментується їхнім context-ом. Per-user context
 * потрапляє лише в message-level cache (breakpoint #3), який і так per-
 * conversation. Тобто розміщення context у system тут коректне: воно не
 * "розмиває" cross-user shared prefix — саме тому НЕ переносимо його в перше
 * user-повідомлення (це нічого не покращило б, лише зламало б empty-context
 * гілку нижче).
 *
 * Коли `context` порожній, Anthropic API відхиляє `text`-блоки з empty `text`,
 * тому під cap-ом повертаємо лише самий cached prefix.
 */
export interface CacheControl {
  type: "ephemeral";
  ttl?: "1h";
}

export interface AnthropicSystemBlock {
  type: "text";
  text: string;
  cache_control?: CacheControl;
}

/**
 * `cache_control` для СТАБІЛЬНОГО префікса (tools + SYSTEM_PREFIX). Читає
 * `CHAT_CACHE_TTL_1H` на кожному виклику, а не при імпорті — щоб тест міг
 * перемкнути прапорець без перезавантаження модуля, і щоб kill-switch діяв
 * без редеплою.
 */
function stableCacheControl(): CacheControl {
  return env.CHAT_CACHE_TTL_1H
    ? { type: "ephemeral", ttl: "1h" }
    : { type: "ephemeral" };
}

/**
 * Другий system-блок несе дані, яких ми НЕ писали: клієнтський `context` із
 * тіла `/api/chat`, RAG-витяг із `ai_memories` (теж написаний користувачем) і
 * coach-кореляції. Тому він іде в `<user_data>`-огорожі — тією ж логікою, що
 * `tool_result` у `wrapAndScanToolResults`, і з парним параграфом у
 * `SYSTEM_PREFIX` (v17+), який наказує моделі трактувати вміст як дані.
 *
 * AI-DANGER: не прибирай огорожу «бо це ж наш власний context». Снапшот
 * будує КЛІЄНТ (`apps/web/src/core/hub/chat/useChatSend`), сервер його не
 * звіряє ні з чим — без огорожі один POST переписує системний промпт і
 * перетворює асистента на універсальний LLM.
 */
export function buildSystem(
  context: string,
  preset?: unknown,
): AnthropicSystemBlock[] {
  const cached: AnthropicSystemBlock = {
    type: "text",
    text: SYSTEM_PREFIX,
    cache_control: stableCacheControl(),
  };
  const blocks: AnthropicSystemBlock[] = [cached];

  // Preset-блок стоїть ПІСЛЯ cached-префікса і ПЕРЕД `context`:
  //   * після — щоб не зсувати байти всередині breakpoint-а (інакше кожен
  //     запит із preset-ом інвалідував би cross-user кеш `tools + SYSTEM_PREFIX`);
  //   * перед — бо це інструкція, а `context` це дані; порядок «правила,
  //     потім дані» дзеркалить структуру самого `SYSTEM_PREFIX`.
  //
  // AI-DANGER: без `<user_data>`-огорожі — навмисно, це наш текст, а не
  // клієнтський (`chatPresets.ts`). Клієнт передає лише enum-ідентифікатор.
  const instruction = presetInstruction(preset);
  if (instruction) blocks.push({ type: "text", text: instruction });

  if (context) {
    blocks.push({ type: "text", text: wrapAndScanUserContext(context) });
  }
  return blocks;
}

/**
 * Клонує `TOOLS` і додає `cache_control: ephemeral` до останнього tool. Не
 * мутує імпортований масив, бо він реєкспортиться в інших місцях.
 *
 * Anthropic кешує весь префікс ДО цього блоку включно (порядок рендеру:
 * tools → system → messages). Разом із cache_control на SYSTEM_PREFIX це кешує
 * стабільний блок tools + system на кожному турі.
 *
 * AI-DANGER: breakpoint ставиться на останній tool БЕЗ `defer_loading` —
 * Anthropic віддає 400 на `cache_control` разом із `defer_loading: true`.
 * Оскільки `buildToolSearchPayload` кладе гарячі інструменти перед
 * deferred-ими, «останній не-deferred» — це рівно кінець гарячого блоку.
 * Якщо не-deferred інструментів немає взагалі, breakpoint не ставимо: без
 * кешу дорожче, але запит хоча б проходить.
 */
export function applyToolsCacheBreakpoint<T extends object>(
  tools: readonly T[],
): Array<T & { cache_control?: CacheControl }> {
  const cloned = tools.slice() as Array<T & { cache_control?: CacheControl }>;
  let idx = -1;
  for (let i = cloned.length - 1; i >= 0; i--) {
    if (isCacheable(cloned[i] as { defer_loading?: unknown })) {
      idx = i;
      break;
    }
  }
  if (idx === -1) return cloned;
  cloned[idx] = {
    ...cloned[idx],
    cache_control: stableCacheControl(),
  } as T & { cache_control: CacheControl };
  return cloned;
}

/**
 * Видаляє `strict`-прапор з КОЖНОГО tool — legacy non-strict payload. Kill-
 * switch, коли `CHAT_STRICT_TOOLS=false`: гарантує, що Anthropic отримує
 * payload без strict-прапорів навіть якщо domain-defs анотовані `strict: true`.
 * Схема лишається нормалізованою (`additionalProperties: false` вже проставлено
 * у `tools.ts::normalizeStrictTools`) — це для провайдера безпечно.
 */
export function stripStrictModeForAnthropic<T extends { strict?: unknown }>(
  tools: readonly T[],
): Array<Omit<T, "strict">> {
  return tools.map(({ strict: _strict, ...tool }) => tool);
}

/**
 * Прибирає `strict: false` (явний opt-out) із payload-у, зберігаючи
 * `strict: true`. Anthropic не приймає `strict: false` — прапор або
 * присутній як `true`, або відсутній. Tools без `strict` лишаються без нього.
 */
function keepStrictTrueOnly<T extends { strict?: unknown }>(
  tools: readonly T[],
): T[] {
  return tools.map((tool) => {
    if (tool.strict === true) return tool;
    const { strict: _strict, ...rest } = tool;
    return rest as T;
  });
}

/**
 * Tools із cache breakpoint на останньому — обчислюється один раз при імпорті
 * модуля (TOOLS статичний), щоб не клонувати масив на кожен запит.
 *
 * `CHAT_STRICT_TOOLS` (default true) — вмикає Anthropic strict tool use для
 * ≤20 анотованих high-value write-tools; `false` — legacy kill-switch, який
 * зриває strict з усіх tools (див. INCIDENT 2026-05-16 у `tools.ts`).
 */
export const TOOLS_WITH_CACHE = applyToolsCacheBreakpoint(
  env.CHAT_STRICT_TOOLS
    ? keepStrictTrueOnly(TOOLS)
    : stripStrictModeForAnthropic(TOOLS),
);

/**
 * Per-model tools-payload. Мемоїзований по model-id: масив 77 дефініцій —
 * 43 КБ JSON, клонувати його на кожен запит було б помітно.
 *
 * Кеш лишається коректним, бо і `TOOLS`, і обидва прапорці читаються з
 * оточення, яке в ран-таймі не змінюється. У тестах, що перемикають
 * `CHAT_TOOL_SEARCH` / `CHAT_CACHE_TTL_1H`, викликай
 * `__resetToolsPayloadCache()`.
 */
const toolsPayloadByModel = new Map<string, ReadonlyArray<object>>();

/** 4 моделі × 4 типові набори модулів із запасом. */
const MAX_TOOLS_PAYLOAD_CACHE = 32;

/**
 * Tools для конкретної моделі. Повертає tool-search-payload, коли модель це
 * підтримує і `CHAT_TOOL_SEARCH` увімкнений; інакше — legacy-масив із усіма
 * 77 дефініціями в контексті.
 *
 * Модель обовʼязкова: `CHAT_MODEL_FIRST_TURN`, `CHAT_MODEL_SYNTHESIS` і
 * `AI_PRO_*_CHAT_MODEL` env-керовані, тож ops може ре-тирити чат на модель
 * без tool search. Ми це переживаємо деградацією, а не 400.
 */
export function buildToolsPayload(
  model: string,
  activeModules?: readonly DashboardModuleId[] | null,
): ReadonlyArray<object> {
  // Ключ кешу несе і вибір модулів: інакше перший користувач «прогрів» би
  // мемоїзацію своїм зрізом і роздав її решті — з чужими вирізаними tools.
  const cacheKey = `${model}|${activeModules ? [...activeModules].sort().join(",") : "*"}`;
  const cached = toolsPayloadByModel.get(cacheKey);
  if (cached) return cached;

  const registry = filterToolsByActiveModules(TOOLS, activeModules);
  const base = env.CHAT_STRICT_TOOLS
    ? keepStrictTrueOnly(registry)
    : stripStrictModeForAnthropic(registry);

  const useToolSearch = env.CHAT_TOOL_SEARCH && modelSupportsToolSearch(model);
  const tools: ReadonlyArray<object> = useToolSearch
    ? buildToolSearchPayload(base)
    : base;
  const payload = applyToolsCacheBreakpoint(tools);
  // Ключ тепер несе і набір модулів, тож кількість записів множиться на
  // число комбінацій (до 16), а кожен запис — клон реєстру на ~43 КБ.
  // FIFO-стеля тримає це обмеженим; попадання все одно майже стовідсоткове,
  // бо реальних комбінацій у сесії небагато.
  if (toolsPayloadByModel.size >= MAX_TOOLS_PAYLOAD_CACHE) {
    const oldest = toolsPayloadByModel.keys().next().value;
    if (oldest !== undefined) toolsPayloadByModel.delete(oldest);
  }
  toolsPayloadByModel.set(cacheKey, payload);
  return payload;
}

/** Тільки для тестів: скидає мемоїзацію після зміни env-прапорців. */
export function __resetToolsPayloadCache(): void {
  toolsPayloadByModel.clear();
}

/**
 * Tools для ТУРУ СИНТЕЗУ (`chat-tool-result`) — лише ті визначення, які реально
 * згадані у відтвореному `tool_calls_raw`.
 *
 * AI-CONTEXT (вимір 2026-08-06). Під шлюзом tool search недоступний: allowlist
 * у `toolSearch.ts` містить лише `claude-*`, а дефолтні chat-моделі там —
 * `google/gemini-3.7-flash`, `deepseek/deepseek-v4-flash` і `z-ai/glm-5.2`
 * (жодна не `claude-*`, тож висновок не змінився). Тож `buildToolsPayload`
 * тихо відкочується на legacy-масив, і в контекст їде ВЕСЬ реєстр: 77 схем,
 * ~18 000 токенів проти ~3 300 на Anthropic. Прompt-cache під шлюзом теж не
 * працює (виміряно: `cache_read` = 0), тож це оплачується повністю й щоразу —
 * на КОЖНОМУ турі. У вартості premium-синтезу префікс дає ~78%.
 *
 * Чому саме тур синтезу можна різати без втрати поведінки: `tool_use`, який
 * модель поверне на цьому турі, **нікуди не доїжджає**. Non-streaming шлях
 * робить `extractAnthropicText(data)` і віддає лише `{ text }`
 * (`chat.ts`), стрімовий — форвардить лише `text_delta` (`chatStream.ts`).
 * Тобто 77 схем тут не дають моделі жодної нової можливості; `SYSTEM_PREFIX`
 * до того ж прямо називає цей крок синтезом, а не викликом.
 *
 * Чому не порожній масив: у розмові вже лежать `tool_use`/`tool_result` блоки.
 * Ми не перевіряли живим запитом, чи приймає API такий payload без `tools`, і
 * ціна помилки — 400 на кожному другому турі. Підмножина «рівно ті, що
 * згадані» знімає це питання за побудовою й водночас дає майже весь виграш.
 *
 * На Anthropic поведінка НЕ змінюється: там працює tool search (6 схем у
 * контексті) і кеш, спільний між юзерами. Підмножина per-conversation
 * фрагментувала б цей кеш і зробила б гірше — тому шлях лишається старим.
 */
export function buildSynthesisToolsPayload(
  model: string,
  usedToolNames: readonly string[],
): ReadonlyArray<object> {
  const full = buildToolsPayload(model);
  if (!env.CHAT_SYNTHESIS_TRIM_TOOLS) return full;
  // Anthropic: tool search + cross-user cache — не чіпаємо.
  if (env.CHAT_TOOL_SEARCH && modelSupportsToolSearch(model)) return full;

  const wanted = new Set(usedToolNames);
  if (wanted.size === 0) return full;

  const base = env.CHAT_STRICT_TOOLS
    ? keepStrictTrueOnly(TOOLS)
    : stripStrictModeForAnthropic(TOOLS);
  const subset = base.filter((t) => wanted.has(t.name));
  // Жодне імʼя не збіглося з реєстром (перейменували tool, а клієнт шле старий
  // id) — краще заплатити за повний payload, ніж лишити модель без контексту.
  if (subset.length === 0) return full;

  return applyToolsCacheBreakpoint(subset);
}

/** Імена `tool_use`-блоків у відтвореному `tool_calls_raw`. */
export function toolNamesFromRawCalls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names = new Set<string>();
  for (const block of raw) {
    if (!block || typeof block !== "object") continue;
    const b = block as { type?: unknown; name?: unknown };
    if (b.type === "tool_use" && typeof b.name === "string") names.add(b.name);
  }
  return [...names];
}

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
