/**
 * Last validated: 2026-10-19
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

import { INFRA_PROCESSORS } from "./legalShared";
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

  it("місце зберігання з речення збігається з регіоном Hetzner у переліку", () => {
    const hetzner = INFRA_PROCESSORS.find((p) => p.name === "Hetzner");
    expect(hetzner?.region).toContain("ЄС");
  });
});
