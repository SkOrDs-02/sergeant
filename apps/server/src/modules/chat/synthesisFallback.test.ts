import { describe, it, expect } from "vitest";
import {
  deterministicSynthesisFallback,
  GENERIC_ACTION_DONE_FALLBACK,
} from "./synthesisFallback.js";

describe("deterministicSynthesisFallback", () => {
  it("знімає огорожу й id з результату remember", () => {
    expect(
      deterministicSynthesisFallback([
        '<tool_output tool="remember">Запамʼятав: Не їсть глютен (Алергії, id:mem_ab12)</tool_output>',
      ]),
    ).toBe("Запамʼятав: Не їсть глютен (Алергії)");
  });

  it("багаторядковий або довгий результат не переказує, а чесно каже «виконано»", () => {
    expect(deterministicSynthesisFallback(["Профіль (2):\n  - a\n  - b"])).toBe(
      GENERIC_ACTION_DONE_FALLBACK,
    );
    expect(deterministicSynthesisFallback(["x".repeat(400)])).toBe(
      GENERIC_ACTION_DONE_FALLBACK,
    );
  });

  it("JSON і порожнє не показує", () => {
    expect(deterministicSynthesisFallback(['{"a":1}', ""])).toBe(
      GENERIC_ACTION_DONE_FALLBACK,
    );
    expect(deterministicSynthesisFallback([])).toBe(
      GENERIC_ACTION_DONE_FALLBACK,
    );
  });
});
