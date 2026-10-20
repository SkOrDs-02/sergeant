/**
 * Last validated: 2026-10-20
 * Status: Active
 *
 * Що реально виходить за периметр на шляху автокатегоризації Monobank
 * (аудит 2026-10-01, `priv-10`). Публічна політика приватності
 * (`apps/web/src/core/legal/privacyDocument.ts`, «Передача даних за кордон»)
 * мусить обіцяти рівно те, що тут зафіксовано.
 *
 * Реальні модулі: `categorizeTransaction` → `invokeLLM` → `maskGenerateOpts` →
 * `maskPii`. Мокається лише транспорт (`getLLMProvider` повертає заглушку,
 * яка ловить payload).
 *
 * AI-CONTEXT: `categorizeTransaction` і `batchEnrichmentWorker` не передають
 * `userId`, тож клас Б (імена контрагентів із `counter_name`) тут НЕ діє,
 * а `maskPii` імен не маскує. Якщо цей тест почне падати на «імʼя лишилось у
 * payload» у бік маскування, оновіть і політику, і цей тест разом.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateMock } = vi.hoisted(() => ({
  generateMock: vi.fn(),
}));

vi.mock("../../lib/llm/provider.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../lib/llm/provider.js")>();
  return {
    ...actual,
    getLLMProvider: vi.fn(() => ({ name: "stub", generate: generateMock })),
  };
});

describe("categorizeTransaction: що маскується перед відправкою в LLM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateMock.mockResolvedValue({
      ok: true,
      text: '{"category":"other","confidence":0.5}',
    });
  });

  it("маскує пошту, телефон, картку, IBAN та ІПН у описі", async () => {
    const { categorizeTransaction } = await import("./categorize.js");

    await categorizeTransaction(
      {
        description:
          "ivan@example.com +380501112233 4141-1111-1111-1111 UA123456789012345678901234567 1234567890",
        amount: -10000,
        mcc: 0,
      },
      "test-key",
    );

    const payload = JSON.stringify(generateMock.mock.calls[0]?.[0]);
    for (const [label, raw] of [
      ["[email]", "ivan@example.com"],
      ["[phone]", "+380501112233"],
      ["[card]", "4141-1111-1111-1111"],
      ["[iban]", "UA123456789012345678901234567"],
      ["[taxid]", "1234567890"],
    ] as const) {
      expect(payload).toContain(label);
      expect(payload).not.toContain(raw);
    }
  });

  it("імена фізосіб в описі (невідомий MCC) НЕ маскуються: політика цього не обіцяє", async () => {
    const { categorizeTransaction } = await import("./categorize.js");

    await categorizeTransaction(
      { description: "Від: Олена Ш.", amount: 50000, mcc: 0 },
      "test-key",
    );

    expect(generateMock).toHaveBeenCalledTimes(1);
    const opts = generateMock.mock.calls[0]?.[0] as {
      userId?: string;
      messages: { content: string }[];
    };
    // Без userId `maskGenerateOpts` не знає імен контрагентів (клас Б).
    expect(opts.userId).toBeUndefined();
    expect(opts.messages.map((m) => m.content).join("\n")).toContain(
      "Олена Ш.",
    );
  });
});
