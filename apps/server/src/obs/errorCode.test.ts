import { describe, expect, it } from "vitest";
import { toPublicErrorCode } from "./errorCode.js";

/**
 * Гейт на класифікатор помилки для публічної відповіді.
 *
 * Цінність тесту не в тому, що він перевіряє happy-path (`ECONNREFUSED` на
 * вхід — `ECONNREFUSED` на вихід), а в тому, що він фіксує ВІДМОВУ: жоден
 * шлях не має повернути назовні рядок, у якому міг би сховатись хост, порт,
 * імʼя користувача чи цитата з повідомлення. Саме такі рядки анонім
 * отримував з `/healthz` і `/health/workers` до цієї правки.
 */
describe("toPublicErrorCode", () => {
  it("пропускає короткий код-ідентифікатор як є", () => {
    expect(
      toPublicErrorCode(
        Object.assign(new Error("connect ECONNREFUSED 10.0.0.12:6379"), {
          code: "ECONNREFUSED",
        }),
      ),
    ).toBe("ECONNREFUSED");

    // SQLSTATE від `pg` — цифро-літерний, теж ідентифікатор.
    expect(
      toPublicErrorCode(
        Object.assign(
          new Error('password authentication failed for user "sergeant_app"'),
          { code: "28P01" },
        ),
      ),
    ).toBe("28P01");
  });

  it("НЕ пропускає повідомлення, що приїхало у полі `code`", () => {
    // `code` не зарезервоване: обгортки над HTTP-клієнтами кладуть туди що
    // завгодно, інколи повний текст. Allowlist має відсікти це навіть тоді,
    // коли викликач нічого не підозрює.
    for (const leaky of [
      "connect ECONNREFUSED 10.0.0.12:6379",
      'password authentication failed for user "sergeant_app"',
      "getaddrinfo ENOTFOUND postgres-abc123",
      "10.0.0.12:5432",
      "ECONNREFUSED ",
    ]) {
      const out = toPublicErrorCode(
        Object.assign(new Error("x"), { code: leaky }),
      );
      expect(out).toBe("Error");
      expect(out).not.toContain("10.0.0.12");
      expect(out).not.toContain("sergeant_app");
    }
  });

  it("відкидає задовгий `code` (>40 символів)", () => {
    expect(
      toPublicErrorCode(
        Object.assign(new Error("x"), { code: "A".repeat(41) }),
      ),
    ).toBe("Error");
    expect(
      toPublicErrorCode(
        Object.assign(new Error("x"), { code: "A".repeat(40) }),
      ),
    ).toBe("A".repeat(40));
  });

  it("падає на `name` конструктора, коли коду немає", () => {
    expect(toPublicErrorCode(new TypeError("boom"))).toBe("TypeError");
    expect(toPublicErrorCode(new Error("boom"))).toBe("Error");
  });

  it("числовий errno стає рядком", () => {
    expect(
      toPublicErrorCode(Object.assign(new Error("x"), { code: -111 })),
    ).toBe("-111");
    // NaN/Infinity — не код, а сміття.
    expect(
      toPublicErrorCode(Object.assign(new Error("x"), { code: NaN })),
    ).toBe("Error");
  });

  it("не-обʼєкти і порожні значення дають 'unknown'", () => {
    // Сирий рядок як «помилка» — найпростіший спосіб протягти повідомлення
    // назовні, тож він теж має колапсувати в `unknown`, а не в себе самого.
    for (const v of [
      null,
      undefined,
      "connect ECONNREFUSED 10.0.0.12:6379",
      42,
      true,
    ]) {
      expect(toPublicErrorCode(v)).toBe("unknown");
    }
  });

  it("ніколи не бере текст із `message`", () => {
    // Навіть коротке повідомлення без коду не має просочитись: довжина
    // тексту не корелює з його чутливістю.
    const err = { message: "sergeant_app" };
    expect(toPublicErrorCode(err)).toBe("unknown");
  });
});
