/**
 * Гейт тексту промптів, які пишуть прозу для людини: у самій інструкції
 * немає довгого тире.
 *
 * AI-CONTEXT: модель дзеркалить стиль промпта. Промпт дайджесту з дев'ятьма
 * «—» просив «без тире» і отримував тире (аудит анти-слопу 2026-09-23, P2-2).
 * Правило про тире цитує сам символ у «—», тож цитата не рахується.
 * Промпти беруться зі стенду: `evalPromptParity.test.ts` тримає їх байт у
 * байт із продовими білдерами, тож тут перевіряється саме те, що їде в модель.
 */

import { describe, expect, it } from "vitest";

import { PIPELINES } from "../../scripts/eval/pipelines.js";

/** Пайплайни, чий вихід людина читає як текст (не класифікатори й не MCC). */
const PROSE_PIPELINES = [
  "chat",
  "analysis",
  "digest",
  "coach-insight",
  "day-plan",
  "week-plan",
  "recommend-recipes",
  "shopping-list",
  "parse-pantry",
];

const longDashOutsideQuote = (text: string): number =>
  (text.replaceAll("«—»", "").match(/—/g) ?? []).length;

describe("промпти прози без довгого тире", () => {
  it("усі пайплайни зі списку є у стенді", () => {
    const keys = PIPELINES.map((p) => p.key);
    for (const key of PROSE_PIPELINES) expect(keys).toContain(key);
  });

  it.each(PROSE_PIPELINES)("%s", (key) => {
    const pipeline = PIPELINES.find((p) => p.key === key);
    const prompt = pipeline?.system ?? pipeline?.cases[0]?.user ?? "";
    expect(prompt.length).toBeGreaterThan(0);
    expect(longDashOutsideQuote(prompt)).toBe(0);
  });
});
