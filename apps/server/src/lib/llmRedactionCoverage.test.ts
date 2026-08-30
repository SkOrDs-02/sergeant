/**
 * Last validated: 2026-07-26
 * Status: Active
 *
 * Гейт покриття маскуванням.
 *
 * AI-CONTEXT: **чесно про силу цього тесту.** Він НЕ перевіряє, що
 * маскування працює — це роблять `llmRedaction.test.ts` і тести
 * конкретних шляхів. Він перевіряє рівно одне: що ніхто не додав нового
 * виходу за периметр, не подивившись у цей список.
 *
 * Це і є справжня причина, чому маскування розсипається в кодових базах.
 * Не тому, що регексп поганий, а тому, що маску ставлять на два шляхи,
 * потім додають шість нових — і кожен окремо виглядає невинно. Реєстр
 * нижче робить таке додавання видимим: новий файл із викликом Anthropic
 * чи Voyage валить цей тест, і автор мусить свідомо вписати рядок.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SERVER_SRC = join(import.meta.dirname, "..");

/**
 * Маркери, за якими впізнаємо вихід за периметр до LLM-провайдера.
 * `anthropicMessages` покриває і non-stream, і stream-варіант.
 */
const EXIT_MARKERS = [
  "api.anthropic.com",
  "api.voyageai.com",
  "anthropicMessages(",
  "anthropicMessagesStream(",
];

/**
 * Реєстр відомих виходів. Ключ — шлях від `apps/server/src`, значення —
 * як саме цей шлях замаскований. Рядок `"неможливо"` дозволений і
 * навмисний: він фіксує чесний факт, а не приховує його.
 */
const KNOWN_EXITS: Record<string, string> = {
  "lib/anthropic.ts": "транспорт — маскують ті, хто будує payload",
  "lib/llm/provider.ts": "маскує сам (maskGenerateOpts) для всіх invokeLLM",
  // Не вихід, а будівник промпту: згадка в docstring-у. Лишаємо в
  // реєстрі свідомо — краще один зайвий рядок, ніж послаблений маркер,
  // який перестане ловити справжні виходи.
  "lib/mcc/batchPrompt.ts": "не викликає нічого; промпт іде через invokeLLM",
  "modules/ai-memory/embeddings.ts": "маскує сам (callVoyage)",
  "modules/chat/chat.ts": "маскує context / messages / tool_results",
  "modules/chat/chatStream.ts": "отримує вже замаскований payload із chat.ts",
  "modules/nutrition/analyze-photo.ts":
    "неможливо — фото; замість маски попередження в UI",
  "modules/nutrition/refine-photo.ts":
    "неможливо — фото; замість маски попередження в UI",
  "modules/finyk/receipts/visionClient.ts":
    "неможливо — фото чека (receipts/analyze); замість маски бейдж «розпізнано з фото, перевір суми» на review-екрані (той самий патерн, що nutrition analyze-photo.ts)",
  "modules/finyk/import/visionClient.ts":
    "неможливо — фото скріна банкінгу (import/screenshot/analyze, масове ведення Фаза 2а); замість маски той самий бейдж «розпізнано з фото, перевір суми» на bulk-review, що receipts/visionClient.ts",
  // Не вихід, а докстрінг-згадка `anthropicMessages({allowOpenRouter:true})`
  // для контексту (LLM_RECEIPT_PROVIDER). Той самий випадок, що
  // lib/mcc/batchPrompt.ts вище — лишаємо в реєстрі свідомо.
  "env/aiRoutingEnv.ts":
    "не викликає нічого; docstring-згадка anthropicMessages()",
  // Третій випадок того самого класу: middleware-гейт наявності ключа.
  // Нічого нікуди не шле — `api.anthropic.com` згадано в докстрінгу
  // `requireChatUpstreamKey()`, який пояснює, ЧОМУ під шлюзом
  // Anthropic-ключ не потрібен. Рядок свідомий: послабити маркер, щоб
  // не ловити докстрінги, означало б перестати ловити справжні виходи.
  "http/requireAnthropicKey.ts":
    "не викликає нічого; docstring-згадка api.anthropic.com у requireChatUpstreamKey()",
  // Четвертий випадок того самого класу — і показовий: це РОУТЕР, який лише
  // розставляє middleware. Згадка `anthropicMessages()` у коментарі пояснює,
  // ЧОМУ зорові ендпоінти отримали інший гейт, ніж текстові.
  "routes/nutrition.ts":
    "не викликає нічого; docstring-згадка anthropicMessages() при поясненні розділення гейтів",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "test") continue;
      walk(full, out);
      continue;
    }
    if (!entry.endsWith(".ts")) continue;
    if (entry.includes(".test.")) continue;
    out.push(full);
  }
  return out;
}

describe("покриття маскуванням перед LLM", () => {
  it("кожен вихід за периметр присутній у реєстрі", () => {
    const found = walk(SERVER_SRC)
      .filter((file) => {
        const src = readFileSync(file, "utf8");
        return EXIT_MARKERS.some((marker) => src.includes(marker));
      })
      .map((file) => file.slice(SERVER_SRC.length + 1).replaceAll("\\", "/"))
      .sort();

    // Порівнюємо саме множини, а не «кожен знайдений є в реєстрі»:
    // інакше видалений шлях назавжди лишався б у реєстрі й тихо
    // перетворював його на архів замість опису дійсності.
    expect(found).toEqual(Object.keys(KNOWN_EXITS).sort());
  });

  it("реєстр не має порожніх пояснень", () => {
    for (const [path, how] of Object.entries(KNOWN_EXITS)) {
      expect(
        how.trim().length,
        `порожнє пояснення для ${path}`,
      ).toBeGreaterThan(0);
    }
  });
});
