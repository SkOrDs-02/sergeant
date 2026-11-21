import { describe, expect, it } from "vitest";
import { FEATURES, type FeatureSpec } from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";
import { pricingMessages } from "@shared/i18n/uk.pricing";
import { PRICING_ROWS, buildTiers, premiumAdditions } from "./pricingTiers";

const t = messages.pricing;

// ux-30: описи планів мають збігатися з реєстром entitlements, а не з
// рукописним текстом.
describe("pricingTiers ↔ реєстр FEATURES", () => {
  it("Free-колонка: кожен рядок відкритий, квотний чи закритий рівно як у реєстрі", () => {
    const free = buildTiers(t).find((tier) => tier.id === "free")!;
    expect(free.features).toHaveLength(PRICING_ROWS.length);
    PRICING_ROWS.forEach(([id, key], i) => {
      const access = FEATURES[id].free;
      const cell = free.features[i]!;
      expect(cell.label).toBe(t.features[key]);
      if (typeof access === "object") {
        expect(cell.limit).toBe(`${access.perWeek}${t.limits.perWeek}`);
      } else if (
        access === false &&
        (FEATURES[id] as FeatureSpec).freeItems !== undefined
      ) {
        // Урізана Free-форма (sec-32): рядок входить зі стелею.
        expect(cell.limit).toContain(
          String((FEATURES[id] as FeatureSpec).freeItems),
        );
      } else {
        expect(cell.included ?? true).toBe(access);
      }
    });
  });

  it("Premium додає лише те, чого Free не має повністю, і все це є в Pro", () => {
    const expected = PRICING_ROWS.filter(([id]) => FEATURES[id].free !== true);
    const additions = premiumAdditions(t);
    expect(additions.map((f) => f.label)).toEqual(
      expected.map(([, key]) => t.features[key]),
    );
    for (const [id] of expected) expect(FEATURES[id].pro).toBe(true);
    // Відкриті на Free фічі Premium не продає.
    for (const key of ["cloudSync", "monoAutoSync", "csvExport"] as const) {
      expect(additions.map((f) => f.label)).not.toContain(t.features[key]);
    }
    expect(
      buildTiers(t).find((tier) => tier.id === "premium")!.features,
    ).toEqual(additions);
  });
});

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
