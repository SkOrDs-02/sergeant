import { boolFromProcessEnv } from "./envHelpers.js";

/**
 * Дефолт прапорця `CHAT_VIA_OPENROUTER` — ЄДИНЕ джерело істини.
 *
 * Той самий константний вираз читають обидві сторони: zod-поле
 * `envSchema.CHAT_VIA_OPENROUTER` (`boolFromEnv(...)` у `env.ts`) і
 * ран-таймний `chatViaOpenRouter()` нижче. Доти, доки число стояло у двох
 * місцях, воно там і розійшлося (див. докстрінг функції).
 */
export const CHAT_VIA_OPENROUTER_DEFAULT = true;

/**
 * Чи ходить `/api/chat` через Anthropic-сумісний Messages API OpenRouter-а.
 *
 * Читаємо `process.env` напряму (а не через `env`), бо від цього прапорця
 * залежать ДЕФОЛТИ інших полів цієї ж схеми — на момент їх обчислення
 * `env` ще не існує. Це також дає `aiQuota.ts` спільне джерело істини:
 * той модуль свідомо читає `process.env`, щоб тести перемикали тиринг у
 * ран-таймі без ре-імпорту. Ця властивість збережена — `boolFromProcessEnv`
 * читає змінну на КОЖНОМУ виклику, як і раніше.
 *
 * ЩО ЗМІНИЛОСЬ (і чому). Тут стояло `if (v !== "true" && v !== "1") return
 * false` — тобто ВІДСУТНЯ змінна читалась як OFF, тоді як схема оголошує
 * `boolFromEnv(true)`, а `assertStartupEnv()` друкує попередження, написане
 * з припущення «прапорець типово ON». Два джерела істини про один прапорець
 * розходились мовчки: з виставленим `OPENROUTER_API_KEY` і без явного
 * `CHAT_VIA_OPENROUTER` чат тихо йшов на прямий Anthropic — з
 * OpenRouter-івськими дефолтами моделей — і кожен запит падав
 * `anthropic upstream 401`. Тепер відсутнє значення резолвиться у
 * `CHAT_VIA_OPENROUTER_DEFAULT`, тобто рівно в те, що каже схема; явні
 * `true|1|false|0` працюють як і працювали.
 */
export function chatViaOpenRouter(): boolean {
  if (!boolFromProcessEnv("CHAT_VIA_OPENROUTER", CHAT_VIA_OPENROUTER_DEFAULT)) {
    return false;
  }
  // Ключ — частина умови, а не окрема перевірка. Інакше відкат половинчастий:
  // `pickTransport` без ключа тихо повертається на Anthropic, а
  // дефолти моделей лишаються OpenRouter-івськими — і кожен чат-запит
  // отримує 404 на неіснуючий для Anthropic `openai/gpt-5.1`. Одне джерело
  // істини для обох рішень робить проміжний стан неможливим.
  return Boolean(process.env["OPENROUTER_API_KEY"]);
}

type ChatModelSlot = "firstTurn" | "synthesis" | "standard" | "floor";

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
 *
 * ПЕРШИЙ ТУР — окрема історія, і початковий висновок був хибний.
 *
 * Payload першого туру — ~10.5k незмінних токенів (77 схем інструментів +
 * `SYSTEM_PREFIX`), і прямий Anthropic кешує їх із TTL=1h. Звідси й бралася
 * рекомендація «лишити на Anthropic»: OpenRouter кешу не дає взагалі
 * (виміряно — `cache_read` = 0 навіть із явним `cache_control`).
 *
 * Арифметика мовчки припускала, що альтернатива коштує порівнянно. Не коштує.
 * Кешований haiku-4.5: $5.60/1k на сесії з 5 повідомлень, $3.60 на 10, $2.60
 * на 20. `deepseek-v4-flash` БЕЗ кешу — $1.51/1k, тобто дешевший на будь-якій
 * довжині сесії. Прогін `eval:tools` на v15 (12 кейсів × 2): deepseek 22/24 і
 * НУЛЬ вигаданих id, haiku 21/24 і два вигаданих. Вигаданий `habit_id` доїжджає
 * до клієнтського виконавця й пише фантомний запис — це не косметика.
 */
const CHAT_MODEL_DEFAULTS: Record<
  ChatModelSlot,
  { openrouter: string; anthropic: string }
> = {
  firstTurn: {
    openrouter: "deepseek/deepseek-v4-flash",
    anthropic: "claude-haiku-4-5-20251001",
  },
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
