import { describe, expect, it } from "vitest";
import { gatewayFacts } from "./run.js";

describe("gatewayFacts: хто відповів і скільки списано", () => {
  it("бере `provider` і `usage.cost` із сирої відповіді OpenRouter", () => {
    expect(
      gatewayFacts({ provider: "Relace", usage: { cost: 0.0012 } }),
    ).toEqual({ servedBy: "Relace", gatewayCostUsd: 0.0012 });
  });

  it("без полів дає null, а не 0 чи порожній рядок", () => {
    expect(gatewayFacts(undefined)).toEqual({
      servedBy: null,
      gatewayCostUsd: null,
    });
    expect(gatewayFacts({ usage: {} })).toEqual({
      servedBy: null,
      gatewayCostUsd: null,
    });
  });
});
