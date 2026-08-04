/**
 * Чи ходить `/api/chat` через Anthropic-сумісний Messages API OpenRouter-а.
 *
 * Читаємо `process.env` напряму (а не через `env`), бо від цього прапорця
 * залежать ДЕФОЛТИ інших полів цієї ж схеми — на момент їх обчислення
 * `env` ще не існує. Це також дає `aiQuota.ts` спільне джерело істини:
 * той модуль свідомо читає `process.env`, щоб тести перемикали тиринг у
 * ран-таймі без ре-імпорту.
 */
export function chatViaOpenRouter(): boolean {
  const v = process.env["CHAT_VIA_OPENROUTER"]?.toLowerCase();
  if (v !== "true" && v !== "1") return false;
  // Ключ — частина умови, а не окрема перевірка. Інакше відкат половинчастий:
  // `pickTransport` без ключа тихо повертається на Anthropic, а
  // дефолти моделей лишаються OpenRouter-івськими — і кожен чат-запит
  // отримує 404 на неіснуючий для Anthropic `openai/gpt-5.1`. Одне джерело
  // істини для обох рішень робить проміжний стан неможливим.
  return Boolean(process.env["OPENROUTER_API_KEY"]);
}

type ChatModelSlot = "synthesis" | "standard" | "floor";

/**
 * Дефолтні chat-моделі по слоту × шлюзу.
 *
 * WHY два набори: `z-ai/glm-5.2` і `deepseek/deepseek-v4-flash` існують лише
 * в каталозі OpenRouter — прямий Anthropic на такий id віддає 404. Тому один
 * прапорець перемикає і транспорт, і сімейство id-шок; відкат лишається
 * однією змінною, а проміжного стану «нові моделі у старий шлюз» не існує.
 * Явний env-override перекриває обидва набори.
 *
 * Вибір слотів — вимір на пастках глибини аналізу (8 пасток × 2 повтори,
 * 11 кандидатів, 2026-08-04):
 *   * synthesis `glm-5.2` — 16/16, $1.64/1k, 6.2 с. Удвічі дешевший за
 *     gpt-5.1 (13/16, $3.17) і єдиний, хто ловить розбіжність у сумах.
 *   * standard `deepseek-v4-flash` — 13/16 (рівно як gpt-5.1), чистий голос,
 *     3.8 с, $0.32/1k. Удесятеро дешевший за однакову якість.
 * `gemini-2.5-flash-lite` лишається на floor: 11/16, але 730 мс і $0.16 —
 * там, де тир свідомо знижений, швидкість важить більше за дві пастки.
 */
const CHAT_MODEL_DEFAULTS: Record<
  ChatModelSlot,
  { openrouter: string; anthropic: string }
> = {
  synthesis: { openrouter: "z-ai/glm-5.2", anthropic: "claude-sonnet-4-6" },
  standard: {
    openrouter: "deepseek/deepseek-v4-flash",
    anthropic: "claude-haiku-4-5-20251001",
  },
  floor: {
    openrouter: "google/gemini-2.5-flash-lite",
    anthropic: "claude-haiku-4-5-20251001",
  },
};

export function defaultChatModel(slot: ChatModelSlot): string {
  return CHAT_MODEL_DEFAULTS[slot][
    chatViaOpenRouter() ? "openrouter" : "anthropic"
  ];
}
