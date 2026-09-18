import { describe, it, expect } from "vitest";
import { evaluateActivationV2, type ActivationInput } from "./activation.js";

const HOUR_MS = 60 * 60 * 1000;

function makeInput(overrides: Partial<ActivationInput> = {}): ActivationInput {
  return {
    signedUpAt: 0,
    evaluatedAt: 24 * HOUR_MS, // 24h after signup by default
    monoAccountsConnected: 1,
    categorizedTransactions: 5,
    budgetsCreated: 1,
    ...overrides,
  };
}

describe("evaluateActivationV2", () => {
  it("returns activated=true when all conditions met within 72h", () => {
    const result = evaluateActivationV2(makeInput());
    expect(result.activated).toBe(true);
    expect(result.conditions.monoConnected).toBe(true);
    expect(result.conditions.transactionsCategorized).toBe(true);
    expect(result.conditions.budgetCreated).toBe(true);
    expect(result.conditions.withinWindow).toBe(true);
  });

  it("returns activated=false when evaluated exactly at 72h+1ms (outside window)", () => {
    const result = evaluateActivationV2(
      makeInput({ evaluatedAt: 72 * HOUR_MS + 1 }),
    );
    expect(result.activated).toBe(false);
    expect(result.conditions.withinWindow).toBe(false);
  });

  it("returns activated=true when evaluated exactly at 72h (boundary inclusive)", () => {
    const result = evaluateActivationV2(
      makeInput({ evaluatedAt: 72 * HOUR_MS }),
    );
    expect(result.activated).toBe(true);
    expect(result.conditions.withinWindow).toBe(true);
  });

  it("returns activated=false when no Mono account connected", () => {
    const result = evaluateActivationV2(
      makeInput({ monoAccountsConnected: 0 }),
    );
    expect(result.activated).toBe(false);
    expect(result.conditions.monoConnected).toBe(false);
  });

  it("returns activated=false when fewer than 5 transactions categorized", () => {
    const result = evaluateActivationV2(
      makeInput({ categorizedTransactions: 4 }),
    );
    expect(result.activated).toBe(false);
    expect(result.conditions.transactionsCategorized).toBe(false);
  });

  it("returns activated=true with exactly 5 categorized transactions", () => {
    const result = evaluateActivationV2(
      makeInput({ categorizedTransactions: 5 }),
    );
    expect(result.activated).toBe(true);
  });

  it("returns activated=false when no budget created", () => {
    const result = evaluateActivationV2(makeInput({ budgetsCreated: 0 }));
    expect(result.activated).toBe(false);
    expect(result.conditions.budgetCreated).toBe(false);
  });

  it("calculates hoursElapsed correctly", () => {
    const result = evaluateActivationV2(
      makeInput({ evaluatedAt: 36 * HOUR_MS }),
    );
    expect(result.hoursElapsed).toBeCloseTo(36, 5);
  });

  it("returns activated=false when multiple conditions fail", () => {
    const result = evaluateActivationV2(
      makeInput({ monoAccountsConnected: 0, budgetsCreated: 0 }),
    );
    expect(result.activated).toBe(false);
    expect(result.conditions.monoConnected).toBe(false);
    expect(result.conditions.budgetCreated).toBe(false);
  });

  it("accepts multiple Mono accounts (≥1 required, more is fine)", () => {
    const result = evaluateActivationV2(
      makeInput({ monoAccountsConnected: 3 }),
    );
    expect(result.activated).toBe(true);
    expect(result.conditions.monoConnected).toBe(true);
  });
});
