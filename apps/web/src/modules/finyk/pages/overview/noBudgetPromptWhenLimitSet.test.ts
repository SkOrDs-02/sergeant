/**
 * Пункт 8 аудиту 2026-09-24, частина «Огляд питає "Хочеш поставити бюджет?"
 * при заданому ліміті». Це питання живе лише в замороженому mobile
 * (`FirstInsightBanner`); у web-каталогах такого рядка немає, а єдина
 * підказка на Огляді («Постав план» у hero) залежить від місячного плану
 * витрат, не від лімітів.
 */
import { describe, expect, it } from "vitest";
import { getMessages } from "@shared/i18n";

describe("Огляд web: підказки «постав бюджет» немає в каталогах", () => {
  it.each(["uk", "en"] as const)(
    "%s: жодного рядка про «поставити бюджет»",
    (lang) => {
      const all = JSON.stringify(getMessages(lang));
      expect(all).not.toMatch(/поставити бюджет|set a budget/i);
    },
  );
});
