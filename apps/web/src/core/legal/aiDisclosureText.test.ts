/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Блок «Куди їдуть дані для AI» у Налаштуваннях (`PrivacySection`).
 *
 * Рішення власника 2026-11-19: блок називає рівно тих, кого називає реєстр
 * `docs/governance/security/llm-subprocessors.md`, і бере назви з
 * `legalShared.ts`, а не з окремого рядка каталогу. Обіцянку вирізати імена
 * з банківських переказів прибрано: на шляху автокатегоризації імена не
 * маскуються (рішення 2026-10-23, `priv-10`).
 */
import { describe, expect, it } from "vitest";

import { messagesEn } from "@shared/i18n/en";
import { dataDisclosureMessages } from "@shared/i18n/uk.dataDisclosure";

import {
  AI_GATEWAY_VENDORS,
  AI_PROCESSORS,
  fillAiProcessorNames,
} from "./legalShared";

const filled = {
  uk: fillAiProcessorNames(dataDisclosureMessages.subprocessors.body),
  en: fillAiProcessorNames(messagesEn.dataDisclosure!.subprocessors.body),
};

describe("блок «Куди їдуть дані для AI»", () => {
  it.each(Object.entries(filled))(
    "%s: називає всіх обробників і постачальників моделей з legalShared",
    (_lang, body) => {
      for (const p of AI_PROCESSORS) expect(body).toContain(p.registryName);
      for (const v of AI_GATEWAY_VENDORS) expect(body).toContain(v.name);
      expect(body).not.toMatch(/[{}]/);
    },
  );

  it("не обіцяє вирізати імена людей з банківських переказів", () => {
    expect(filled.uk).not.toMatch(/імена людей|переказ/);
    expect(filled.en).not.toMatch(/names from bank transfers/);
  });

  it("кидає на невідомому плейсхолдері, а не рендерить його", () => {
    expect(() => fillAiProcessorNames("до {nobody}")).toThrow(/\{nobody\}/);
  });
});
