import { describe, it, expect } from "vitest";
import { signedDeltaClass, transactionAmountClass } from "./amountTone";

describe("signedDeltaClass", () => {
  it("позитивна дельта → success-strong зі світлим dark-варіантом", () => {
    expect(signedDeltaClass(1)).toBe("text-success-strong dark:text-success");
    expect(signedDeltaClass(0.5)).toBe("text-success-strong dark:text-success");
    expect(signedDeltaClass(Number.MAX_SAFE_INTEGER)).toBe(
      "text-success-strong dark:text-success",
    );
  });

  // Регресія ux-42: голий `text-danger` (red-500) на білому дає 3.76:1,
  // нижче WCAG AA 4.5:1 — і саме ним малювались відʼємні баланси Фініка.
  it("відʼємна дельта → danger-strong зі світлим dark-варіантом", () => {
    expect(signedDeltaClass(-1)).toBe("text-danger-strong dark:text-danger");
    expect(signedDeltaClass(-0.0001)).toBe(
      "text-danger-strong dark:text-danger",
    );
    expect(signedDeltaClass(Number.MIN_SAFE_INTEGER)).toBe(
      "text-danger-strong dark:text-danger",
    );
  });

  it("у світлій темі жодна знакова гілка не віддає голий базовий тон", () => {
    for (const value of [1, -1]) {
      const classes = signedDeltaClass(value).split(" ");
      expect(classes.filter((c) => !c.startsWith("dark:"))).toEqual([
        expect.stringMatching(/-strong$/),
      ]);
    }
  });

  it("нуль → muted (нейтрально)", () => {
    expect(signedDeltaClass(0)).toBe("text-muted");
  });

  it("−0 трактує як нуль (тут це навмисно — IEEE-754 -0 === 0)", () => {
    // Це задокументована поведінка: ні `> 0`, ні `< 0` не спрацює,
    // тому −0 потрапляє у нейтральну гілку.
    expect(signedDeltaClass(-0)).toBe("text-muted");
  });

  it("NaN — не позитивне і не відʼємне → muted (fallback гілка)", () => {
    // Жоден з порівнянь у NaN не true, тож хелпер чесно віддає muted.
    expect(signedDeltaClass(Number.NaN)).toBe("text-muted");
  });

  it("Infinity → success, -Infinity → danger", () => {
    expect(signedDeltaClass(Number.POSITIVE_INFINITY)).toBe(
      "text-success-strong dark:text-success",
    );
    expect(signedDeltaClass(Number.NEGATIVE_INFINITY)).toBe(
      "text-danger-strong dark:text-danger",
    );
  });
});

describe("transactionAmountClass", () => {
  it("дохід (>0) → success-strong зі світлим dark-варіантом", () => {
    expect(transactionAmountClass(0.01)).toBe(
      "text-success-strong dark:text-success",
    );
    expect(transactionAmountClass(1_000_000)).toBe(
      "text-success-strong dark:text-success",
    );
  });

  it("витрата (<0) → нейтральний text-text (не danger)", () => {
    // Sergeant philosophy: expense ≠ alarm. Лишаємо нейтральним.
    expect(transactionAmountClass(-0.01)).toBe("text-text");
    expect(transactionAmountClass(-50_000)).toBe("text-text");
  });

  it("нульова сума → text-text (не виділяємо)", () => {
    expect(transactionAmountClass(0)).toBe("text-text");
    expect(transactionAmountClass(-0)).toBe("text-text");
  });

  it("NaN → text-text (fallback гілка, не падає)", () => {
    expect(transactionAmountClass(Number.NaN)).toBe("text-text");
  });

  it("Infinity → success, -Infinity → text-text", () => {
    expect(transactionAmountClass(Number.POSITIVE_INFINITY)).toBe(
      "text-success-strong dark:text-success",
    );
    expect(transactionAmountClass(Number.NEGATIVE_INFINITY)).toBe("text-text");
  });
});
