import { describe, expect, it } from "vitest";
import { noUngroundedPushback, voiceViolations } from "./judges.js";

describe("noUngroundedPushback", () => {
  it("пропускає згоду і звичайну відповідь без заперечень", () => {
    expect(
      noUngroundedPushback("Так, за тиждень ти записав 4 тренування."),
    ).toBe(true);
  });

  it("пропускає заперечення, підперте числом", () => {
    expect(
      noUngroundedPushback(
        "Це не так: витрати на каву зросли з 420 до 610 ₴ за місяць.",
      ),
    ).toBe(true);
  });

  it("ловить заперечення без жодного числа", () => {
    const verdict = noUngroundedPushback(
      "Насправді ні, твої витрати не росли, навпаки, ти став економнішим.",
    );
    expect(verdict).toMatch(/заперечення без числа/);
  });

  it("не ламає решту суддів голосу", () => {
    expect(voiceViolations("Записав 3 підходи по 8.", "plain")).toEqual([]);
  });
});
