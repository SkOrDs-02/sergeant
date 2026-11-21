import { describe, expect, it } from "vitest";
import { pricingMessages } from "@shared/i18n/uk.pricing";
import { buildTiers } from "./pricingTiers";

/**
 * sec-32: «Памʼять Сержанта» на Free не «не входить», а урізана до стелі
 * реєстру доступу (`ai.memoryRecall.freeItems`), Premium має повну.
 */
describe("buildTiers: памʼять Сержанта", () => {
  const [free, premium] = buildTiers(pricingMessages);
  const row = (tier: typeof free) =>
    tier?.features.find((f) => f.label === "Памʼять Сержанта");

  it("Free: рядок входить із підписом стелі", () => {
    expect(row(free)).toEqual({
      label: "Памʼять Сержанта",
      limit: "до 3 спогадів у чаті",
    });
  });

  it("Premium: повна памʼять", () => {
    expect(row(premium)).toEqual({
      label: "Памʼять Сержанта",
      limit: "повна, і пошук на запит",
    });
  });

  it("закриті на Free фічі без стелі лишаються «не входить»", () => {
    expect(free?.features.find((f) => f.label === "Голосовий ввід")).toEqual({
      label: "Голосовий ввід",
      included: false,
    });
  });
});
