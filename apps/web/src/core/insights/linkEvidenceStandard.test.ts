import { describe, it, expect } from "vitest";
import { CORRELATION_MIN_N, CORRELATION_NOTABLE_R } from "@sergeant/shared";
import { MIN_N as TOOL_MIN_N } from "../lib/chatActions/crossActions/dailySeries";
import { MIN_N as DIGEST_MIN_N, NOTABLE_R } from "./digestCorrelations";
import { messages } from "@shared/i18n/uk";

/**
 * Гейти спеки `docs/work/specs/link-evidence-standard.md` (ADR-0097), які
 * ловлять регресію раніше за очі: розходження порогів між поверхнями і
 * повернення слова «звʼязок» у стан малих даних.
 */

// Корінь навмисно без закінчення: ловить і «звʼязок», і «звʼязку», і
// «звʼязків». Апостроф - той самий символ, що в каталозі копії.
const LINK_WORD_STEM = "звʼязк";

describe("один стандарт доказу на всіх поверхнях", () => {
  it("чат-тул і дайджест беруть ОДИН поріг спільних днів", () => {
    expect(TOOL_MIN_N).toBe(DIGEST_MIN_N);
    expect(TOOL_MIN_N).toBe(CORRELATION_MIN_N);
  });

  it("поріг помітності теж один", () => {
    expect(NOTABLE_R).toBe(CORRELATION_NOTABLE_R);
  });

  it("поріг не сповзає нижче десяти спільних днів", () => {
    // До 2026-09-22 тул мав власне число 4. Це не стилістика: на чотирьох
    // точках |r| = 0.4 трапляється на випадкових даних майже завжди.
    expect(CORRELATION_MIN_N).toBeGreaterThanOrEqual(10);
  });
});

describe("стан малих даних мовчить про звʼязки", () => {
  const { smallDataTitle, smallDataBody, smallDataEmpty, smallDataDaysNote } =
    messages.crossModuleLink;

  it("жоден рядок стану малих даних не вимовляє слова «звʼязок»", () => {
    for (const line of [
      smallDataTitle,
      smallDataBody,
      smallDataEmpty,
      smallDataDaysNote,
    ]) {
      expect(line.toLowerCase()).not.toContain(LINK_WORD_STEM);
    }
  });

  it("стан мовчання при достатніх даних, навпаки, називає річ своїм імʼям", () => {
    // Контрольний кейс: заборона стосується САМЕ малих даних. Якби вона
    // поширилась на всю секцію, продукт перестав би називати те, що вміє
    // довести, і тест вище був би зеленим із хибної причини.
    expect(messages.crossModuleLink.silentTitle.toLowerCase()).toContain(
      LINK_WORD_STEM,
    );
  });
});
