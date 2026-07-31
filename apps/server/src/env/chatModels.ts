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
 * WHY два набори: `openai/gpt-5.1` і `google/gemini-2.5-flash-lite` існують
 * лише в каталозі OpenRouter — прямий Anthropic на такий id віддає 404.
 * Тому один прапорець перемикає і транспорт, і сімейство id-шок; відкат
 * лишається однією змінною, а проміжного стану «нові моделі у старий шлюз»
 * не існує. Явний env-override перекриває обидва набори.
 */
const CHAT_MODEL_DEFAULTS: Record<
  ChatModelSlot,
  { openrouter: string; anthropic: string }
> = {
  synthesis: { openrouter: "openai/gpt-5.1", anthropic: "claude-sonnet-4-6" },
  standard: {
    openrouter: "google/gemini-2.5-flash-lite",
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
