/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Пін на розкриття авторства AI (EU AI Act ст. 50, чинна з 2026-08-02):
 * кожна поверхня, яка показує людині згенерований моделлю ТЕКСТ, мусить
 * поруч казати, що автор — AI.
 *
 * Чому пін окремим файлом, а не коментарем у поверхнях. Захистом уже був
 * коментар — у `weeklyDigestAiSignature` (`uk.sergeant.ts`) стоїть повний
 * розбір, чому бейдж «Припущення» не є розкриттям авторства: він про
 * СТУПІНЬ впевненості, а не про автора, і однаково стоятиме над текстом,
 * який написала людина. Коментар у файлі А не боронить файл Б: порада дня
 * жила без розкриття, маючи лише той бейдж (знахідка PR-A10, аудит
 * 2026-09-13). Той самий урок, що й у PR-A9 з «Pro» проти «Premium».
 *
 * AI-DANGER: список поверхонь нижче РУЧНИЙ, і це його межа — четверту
 * AI-текстову поверхню цей тест не побачить. Додаєш таку — додавай сюди
 * рядок разом із розкриттям. Автоматично відрізнити «текст від моделі» від
 * «текст, який порахував код» на рівні статики неможливо, і вдавати, що
 * гейт це вміє, було б гірше за чесну ручну мапу.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { sergeantMessages } from "@shared/i18n/uk.sergeant";
import { coreMessages } from "@shared/i18n/uk.core";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** поверхня → фрагмент, за яким видно розкриття у її джерелі. */
const SURFACES: readonly { file: string; needle: string; what: string }[] = [
  {
    file: "core/hub/chat/HubChatBody.tsx",
    needle: "chatEmptyAiDisclosure",
    what: "чат Сержанта",
  },
  {
    file: "core/insights/WeeklyDigestCard.tsx",
    needle: "weeklyDigestAiSignature",
    what: "тижневий звіт",
  },
  {
    file: "core/insights/AssistantAdviceCard.tsx",
    needle: "adviceAiSignature",
    what: "порада дня",
  },
];

describe("розкриття авторства AI", () => {
  it.each(SURFACES)("$what підписано автором", ({ file, needle }) => {
    const source = readFileSync(resolve(SRC, file), "utf8");
    expect(source).toContain(needle);
  });

  it("самі рядки розкриття називають AI, а не лише ступінь впевненості", () => {
    const disclosures = [
      sergeantMessages.adviceAiSignature,
      sergeantMessages.weeklyDigestAiSignature,
      coreMessages.hub.chatEmptyAiDisclosure,
    ];
    for (const line of disclosures) {
      expect(line).toMatch(/AI/);
    }
    // Бейдж впевненості — інша вісь; він не має підмінити собою розкриття.
    expect(sergeantMessages.insightAssumptionBadge).not.toMatch(/AI/);
  });
});
