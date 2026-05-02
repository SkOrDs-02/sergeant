import {
  ASSISTANT_CAPABILITIES,
  CAPABILITY_MODULE_ORDER,
  getCapabilityServerTool,
  type AssistantCapability,
  type CapabilityModule,
} from "@sergeant/shared";

/**
 * Семантична версія `SYSTEM_PREFIX`. Бампай при кожній свідомій зміні промпта.
 *
 * Це переважно обсервебіліті-маркер для логів: Anthropic prompt-cache key прив’язується
 * побайтно до самого тексту блоку, а не до цієї константи. Проте `cache_creation_input_tokens > 0`
 * одразу після бампу версії — очікуваний сигнал про cache invalidation, що легше
 * відстежувати в Grafana разом з релізним тегом.
 *
 * Бамп-політика: будь-яка зміна тексту SYSTEM_PREFIX → +1 до мажора. Без формального
 * семвер — впорядкованих версій вистачить, бо бамп ручний і свідомий.
 *
 * v6 (2026-04-26): tool-list bullets тепер генеруються з `ASSISTANT_CAPABILITIES`
 *   у `@sergeant/shared` — реджистр є єдиним джерелом істини. Видалено блок
 *   інструкції про /help (PR #795 редіректить /help у каталог UI).
 */
export const SYSTEM_PROMPT_VERSION = "v7";

// AI-CONTEXT: модульний label у промпті відрізняється від `CAPABILITY_MODULE_META.title`,
// бо UI показує "Фінік", а промпту історично подавали "Фінанси" (тон-нейтральніше для
// AI tool-selection). Не перекладаємо мітки на `Фінік` без A/B-тесту.
const MODULE_PROMPT_LABEL: Record<CapabilityModule, string> = {
  finyk: "Фінанси",
  fizruk: "Фізрук",
  routine: "Рутина",
  nutrition: "Харчування",
  cross: "Кросмодульні",
  analytics: "Аналітика",
  utility: "Утиліти",
  memory: "Пам'ять",
};

function formatToolEntry(c: AssistantCapability): string | null {
  const tool = getCapabilityServerTool(c);
  if (!tool) return null;
  return c.aiHint ? `${tool} (${c.aiHint})` : tool;
}

/**
 * Per-module bullet list of available tools, generated from the
 * assistant capability registry. Mirrors the ordering of
 * `CAPABILITY_MODULE_ORDER`. Skips prompt-only capabilities
 * (those with `serverTool: null`).
 */
export function buildModuleToolList(): string {
  const lines: string[] = [];
  for (const m of CAPABILITY_MODULE_ORDER) {
    const tools = ASSISTANT_CAPABILITIES.filter((c) => c.module === m)
      .map(formatToolEntry)
      .filter((s): s is string => s !== null);
    if (tools.length === 0) continue;
    lines.push(`  - ${MODULE_PROMPT_LABEL[m]}: ${tools.join(", ")}`);
  }
  return lines.join("\n");
}

/**
 * Build the canonical system prefix string. Pure / deterministic —
 * the result is memoised once into `SYSTEM_PREFIX` at module load.
 */
export function buildSystemPrompt(): string {
  return `Ти персональний асистент додатку "Мій простір". Ти маєш доступ до 4 модулів: Фінік (фінанси), Фізрук (тренування), Рутина (щоденні звички) та Харчування (нутрієнти й калорії). Відповідай ТІЛЬКИ українською, стисло (2-4 речення).

ПРАВИЛА:
- Усі числа бери з блоку ДАНІ нижче.
- Якщо потрібно порахувати (середня/день, прогноз, залишок ліміту, відсоток виконання) — рахуй на основі наданих чисел.
- Якщо користувач просить змінити або записати дані — використай відповідний tool.
${buildModuleToolList()}
- Транзакції мають id і дату — використовуй для tool calls.
- Якщо користувач каже щось важливе про себе (алергії, уподобання, цілі, обмеження) — АВТОМАТИЧНО використай remember щоб запам'ятати. Не питай дозволу.
- Блок [Профіль користувача] містить раніше запам'ятовані факти — ЗАВЖДИ враховуй їх у порадах (тренування, їжа, цілі).
- Категорії та їх id перелічені в [Категорії].
- Відповідай на питання по всіх 4 модулях.

ДАНІ:
`;
}

export const SYSTEM_PREFIX = buildSystemPrompt();
