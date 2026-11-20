/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Гейт на хибні твердження про потоки даних у політиці приватності
 * (аудит 2026-10-01, `priv-10`).
 *
 * Речення «Дані Monobank залишаються в Україні» суперечило решті того ж
 * документа: бекенд і БД з транзакціями стоять у Hetzner (ЄС), а
 * категоризацію транзакцій роблять AI-провайдери в США. Тест тримає саме
 * цю суперечність, а не весь текст політики.
 */
import { describe, expect, it } from "vitest";

import { AI_PROCESSORS, INFRA_PROCESSORS } from "./legalShared";
import { privacyDocument } from "./privacyDocument";

const lines = privacyDocument.sections.flatMap((section) => section.body);

describe("privacyDocument: потоки даних Monobank", () => {
  it("не стверджує, що дані Monobank лишаються в Україні", () => {
    expect(lines.join("\n")).not.toMatch(/Monobank[^.]*залишаються в Україні/);
  });

  it("називає ЄС як місце зберігання і США як напрям AI-обробки", () => {
    const monoSentence = lines.find((line) => line.startsWith("Дані Monobank"));
    expect(monoSentence).toBeDefined();
    expect(monoSentence).toContain("ЄС");
    expect(monoSentence).toContain("США");
  });

  it("не обіцяє маскування імен на шляху автокатегоризації", () => {
    // Автокатегоризація (enrichmentWorker / batchEnrichmentWorker → categorize)
    // йде без userId, тож `maskGenerateOpts` не підтягує імена контрагентів,
    // а `maskPii` імен не маскує (apps/server/src/lib/pii-mask.ts). Обіцяти
    // тут маскування імен не можна, доки це не зміниться в коді.
    const monoSentence = lines.find((line) => line.startsWith("Дані Monobank"));
    expect(monoSentence).toBeDefined();
    expect(monoSentence).not.toMatch(/імен|контрагент|фізосіб/i);
  });

  it("не обіцяє маскування імен контрагентів у розділі про AI", () => {
    // Рішення власника 2026-10-23 (priv-10): автокатегоризація й далі йде без
    // userId, тож клас Б (імена контрагентів-фізосіб) діє не на всіх шляхах.
    // Публічна політика цього не обіцяє, опис реалізації лишається в
    // docs/governance/security/llm-subprocessors.md.
    const aiSection = privacyDocument.sections.find((section) =>
      section.title.startsWith("AI: що саме виходить"),
    );
    expect(aiSection).toBeDefined();
    const masking = aiSection?.body.find((line) =>
      line.startsWith("Перед відправкою ми маскуємо"),
    );
    expect(masking).toBeDefined();
    expect(masking).not.toMatch(/контрагент|фізосіб/i);
  });

  it("називає саме те, що маскує maskPii: пошта, телефон, картка, IBAN, ІПН", () => {
    const monoSentence = lines.find((line) => line.startsWith("Дані Monobank"));
    for (const word of ["пошту", "телефони", "карток", "IBAN", "ІПН"]) {
      expect(monoSentence).toContain(word);
    }
  });

  it("місце зберігання з речення збігається з регіоном Hetzner у переліку", () => {
    const hetzner = INFRA_PROCESSORS.find((p) => p.name === "Hetzner");
    expect(hetzner?.region).toContain("ЄС");
  });
});

describe("privacyDocument: чеки й скриншоти виписок ідуть до OpenAI", () => {
  // Рішення власника 2026-11-19: скан чека й імпорт скриншота банківської
  // виписки за замовчуванням ідуть через OpenRouter до `openai/gpt-6-luna`
  // (`OPENROUTER_RECEIPT_MODEL`, docs/governance/security/llm-subprocessors.md
  // примітка ²). Публічний перелік обробників мусить це називати.
  it("роль OpenRouter називає OpenAI і розпізнавання чеків і виписок", () => {
    const openRouter = AI_PROCESSORS.find((p) => p.name === "OpenRouter");
    expect(openRouter).toBeDefined();
    expect(openRouter?.role).toContain("OpenAI");
    expect(openRouter?.role).toContain(
      "розпізнавання чеків і скриншотів банківських виписок",
    );
  });

  it("розділ про AI каже, що кадр чека чи виписки їде цілком і не маскується", () => {
    const aiSection = privacyDocument.sections.find((section) =>
      section.title.startsWith("AI: що саме виходить"),
    );
    const receipt = aiSection?.body.find((line) =>
      line.startsWith("Фото чека чи скриншот банківської виписки"),
    );
    expect(receipt).toBeDefined();
    expect(receipt).toContain("OpenRouter");
    expect(receipt).toContain("OpenAI");
    expect(receipt).toContain("не маскується");
  });
});
