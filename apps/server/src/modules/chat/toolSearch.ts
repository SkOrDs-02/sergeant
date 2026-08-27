/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * Anthropic **tool search tool** + `defer_loading` для `/api/chat`.
 *
 * AI-CONTEXT: вимір 2026-07-25 показав, що ми в КОЖЕН запит вантажимо 77
 * tool-дефініцій = 43 КБ JSON, разом із `SYSTEM_PREFIX` 14 400-21 200
 * токенів. При TTL=5 хв і спорадичному використанні (персональний асистент
 * саме такий) більшість повідомлень платить cache **write**, а не read —
 * тобто цей префікс і є домінантна стаття витрат, а не сам діалог.
 *
 * Tool search розвʼязує це на боці Anthropic: усі дефініції далі йдуть у
 * `tools[]` (API потрібні вони server-side, щоб виконати пошук), але ті, що
 * позначені `defer_loading: true`, **не потрапляють у контекстне вікно** —
 * API виключає їх із system-prompt префікса. Модель знаходить потрібне через
 * серверний `tool_search_tool_regex_20251119`, і API дописує знайдені схеми
 * інлайн у розмову як `tool_reference`. Префікс не змінюється → prompt-cache
 * виживає. Саморобне «підкидати tools по модулю» так НЕ вміє: `tools`
 * рендеряться на позиції 0, і будь-яка зміна набору вбиває всі breakpoint-и.
 *
 * Джерело: platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool
 * (GA на Claude API, beta-хедер не потрібен).
 *
 * AI-DANGER: три обмеження, кожне з яких дає 400 або тиху втрату кешу.
 *   1. Сам `tool_search_tool_*` НЕ можна деферити, і хоча б один інструмент
 *      має лишитись не-деференим — інакше
 *      `At least one tool must have defer_loading=false`.
 *   2. Tool із `defer_loading: true` НЕ може нести `cache_control` — 400.
 *      Тому breakpoint ставиться на останній НЕ-деференний tool
 *      (`promptCache.ts::applyToolsCacheBreakpoint`).
 *   3. Не всі моделі підтримують tool search (Opus 4.1 і старіші — ні).
 *      `CHAT_MODEL_*` env-керовані, тож перевіряємо модель у ран-таймі й
 *      тихо відкочуємось на legacy-payload замість 400 у проді.
 */
import type { AnthropicTool } from "./toolDefs/types.js";

/**
 * Серверний tool-search. Regex-варіант (а не BM25): наші імена інструментів
 * мають стабільні префікси доменів (`query_*`, `log_*`, `habit_*`), тож
 * один патерн ловить цілу групу. BM25 виграв би на природномовних описах,
 * але наші описи українською, а модель пише запити англійською — regex по
 * іменах тут передбачуваніший.
 */
export const TOOL_SEARCH_TOOL = {
  type: "tool_search_tool_regex_20251119",
  name: "tool_search_tool_regex",
} as const;

/**
 * Моделі з підтримкою tool search. Список звужений до тих, що реально можуть
 * потрапити в `CHAT_MODEL_FIRST_TURN` / `CHAT_MODEL_SYNTHESIS` /
 * `AI_PRO_*_CHAT_MODEL`. Матчимо по префіксу, бо env може нести дато-суфікс
 * (`claude-haiku-4-5-20251001`).
 *
 * Свідомо allowlist, а не denylist: невідома модель → legacy-payload. Ціна
 * помилки асиметрична — зайвий legacy-запит коштує токенів, а 400 на
 * непідтриманій моделі кладе весь чат.
 */
const TOOL_SEARCH_MODEL_PREFIXES = [
  "claude-opus-4-5",
  "claude-opus-4-6",
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-opus-5",
  "claude-sonnet-4-5",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-fable-5",
  "claude-mythos-5",
] as const;

export function modelSupportsToolSearch(model: string): boolean {
  return TOOL_SEARCH_MODEL_PREFIXES.some((p) => model.startsWith(p));
}

/**
 * «Гарячий» кістяк — інструменти, що лишаються в контексті завжди, без
 * пошуку. Anthropic радить тримати не-деференими 3-5 найчастіших.
 *
 * AI-CONTEXT: цей набір — ГІПОТЕЗА, виведена зі структури системного
 * промпта, а не з проду. Обґрунтування кожного:
 *   - `remember` / `recall_memory` — `SYSTEM_PREFIX` прямо наказує
 *     «АВТОМАТИЧНО використай remember … Не питай дозволу», а блок
 *     [Профіль користувача] треба вміти дотягнути. Змушувати модель шукати
 *     інструмент, який промпт наказує викликати рефлекторно — прямий шлях до
 *     того, що вона його не викличе.
 *   - `morning_briefing` — єдина крос-модульна точка входу «що в мене
 *     сьогодні»; найімовірніше перше повідомлення сесії.
 *   - `get_daily_series` — крос-модульний робочий кінь аналітики (v12);
 *     обслуговує весь клас питань «чи повʼязано X з Y».
 *   - `find_transaction` — Фінік основний модуль, і майже кожна фінансова
 *     дія починається з пошуку транзакції.
 *
 * Валідується постфактум по `chat_tool_invocations_total{outcome="proposed"}`:
 * якщо в топі опиняться інші імена — правити треба ЦЕЙ список, а не
 * вимикати tool search. Поки прод-даних немає, чесніше назвати це гіпотезою,
 * ніж вдавати вимір.
 */
export const HOT_TOOL_NAMES: readonly string[] = [
  "remember",
  "recall_memory",
  "morning_briefing",
  "get_daily_series",
  "find_transaction",
];

const HOT = new Set(HOT_TOOL_NAMES);

/** Tool-дефініція з прапорцем відкладеного завантаження. */
export type DeferrableTool = AnthropicTool & { defer_loading?: boolean };

/**
 * Усе, що може лежати в `tools[]` payload-у: наші дефініції або серверний
 * tool-search (у нього немає ані `description`, ані `input_schema` — це
 * Anthropic-hosted tool, який ідентифікується самим `type`).
 */
export type ChatPayloadTool = DeferrableTool | typeof TOOL_SEARCH_TOOL;

/**
 * Розкладає `tools` у payload для tool search:
 * `[tool_search_tool, ...гарячі (без defer), ...решта (defer_loading: true)]`.
 *
 * Порядок навмисний. Deferred-tools API виключає з префікса, тож кешований
 * префікс = search-tool + гарячі + `SYSTEM_PREFIX`. Тримаємо гарячі ЗВЕРХУ,
 * щоб `cache_control` міг сісти на останній із них (див. обмеження #2 у
 * докстрінгу файлу) і закрити суцільний блок.
 *
 * Наслідок, який варто знати наперед: гарячий блок + `SYSTEM_PREFIX` — це
 * ~2.5k токенів, а мінімальний кешований префікс Haiku 4.5 — 4096. Тобто на
 * першому турі кеш просто ПЕРЕСТАНЕ створюватись (тихо, без помилки:
 * `cache_creation_input_tokens: 0`). Це не регресія — платити 1× за 2.5k
 * дешевше, ніж 1.25× за 21k, — але не чекай cache-hit-ів у метриках Haiku.
 */
export function buildToolSearchPayload<T extends { name: string }>(
  tools: readonly T[],
): Array<(T & { defer_loading?: boolean }) | typeof TOOL_SEARCH_TOOL> {
  const hot: Array<T & { defer_loading?: boolean }> = [];
  const deferred: Array<T & { defer_loading?: boolean }> = [];
  for (const tool of tools) {
    if (HOT.has(tool.name)) hot.push(tool);
    else deferred.push({ ...tool, defer_loading: true });
  }
  // Обмеження #1: якщо гарячий набір розійшовся з реєстром (перейменували
  // інструмент і забули цей список) — деферити ВСЕ не можна. Реєстр-тест
  // ловить дрейф на CI, але в проді краще віддати перший інструмент
  // не-деференим, ніж отримати 400 на кожному /api/chat.
  if (hot.length === 0 && deferred.length > 0) {
    const [first, ...rest] = deferred;
    const { defer_loading: _drop, ...undeferred } = first!;
    return [TOOL_SEARCH_TOOL, undeferred as T, ...rest];
  }
  return [TOOL_SEARCH_TOOL, ...hot, ...deferred];
}

/**
 * `true`, якщо на tool можна вішати `cache_control`. Deferred-tools не можна
 * (обмеження #2); серверний tool-search технічно можна, але він завжди
 * перший у масиві, тож breakpoint на ньому не закрив би гарячий блок.
 */
export function isCacheable(tool: { defer_loading?: unknown }): boolean {
  return tool.defer_loading !== true;
}
