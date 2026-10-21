import { describe, expect, it } from "vitest";
import { categoryIs } from "./judges.js";

const unknown = categoryIs(["other"], { maxConfidence: 0.6 });
describe("fallback прод-парсера не є успіхом категоризації моделі", () => {
  it.each([
    "",
    "не JSON",
    "{}",
    '{"category":"other","confidence":0}{"category":"health","confidence":0.2}',
    '{"category":"invented","confidence":0}',
    '{"category":"other"}',
    '{"category":"other","confidence":"0.2"}',
    '{"category":"other","confidence":-1}',
    '{"category":"other","confidence":2}',
    '{"category":"other","confidence":null}',
  ])("не зараховує сміття як чесне other: %s", (text) => {
    expect(unknown(text)).toBe(false);
  });
  it("зараховує явно невпевнену відповідь other", () => {
    expect(unknown('{"category":"other","confidence":0}')).toBe(true);
  });
  it("зберігає підтримку code fence та пояснення навколо JSON", () => {
    expect(
      unknown(
        'Відповідь:\n```json\n{"category":"other","confidence":0.2}\n```',
      ),
    ).toBe(true);
  });
  it("не плутає валідну категорію з очікуваною", () => {
    expect(unknown('{"category":"health","confidence":0.2}')).toBe(false);
  });
});
