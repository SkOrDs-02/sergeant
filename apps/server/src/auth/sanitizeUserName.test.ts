import { describe, it, expect } from "vitest";
import {
  MAX_USER_NAME_LENGTH,
  guardUserName,
  sanitizeUserName,
} from "./sanitizeUserName.js";

describe("sanitizeUserName", () => {
  it("name відсутнє або undefined: без змін", () => {
    const a = { image: "x" };
    expect(sanitizeUserName(a, "reject")).toEqual({
      ok: true,
      data: a,
      truncated: false,
    });
    expect(sanitizeUserName({ name: undefined }, "reject").ok).toBe(true);
  });

  it("межа включна", () => {
    expect(
      sanitizeUserName({ name: "a".repeat(MAX_USER_NAME_LENGTH) }, "reject").ok,
    ).toBe(true);
    expect(
      sanitizeUserName(
        { name: "a".repeat(MAX_USER_NAME_LENGTH + 1) },
        "reject",
      ),
    ).toEqual({ ok: false, reason: "too_long" });
  });

  it("не-рядок відхиляється в обох режимах", () => {
    for (const mode of ["reject", "truncate"] as const) {
      for (const bad of [1, null, {}, [], false]) {
        expect(sanitizeUserName({ name: bad }, mode)).toEqual({
          ok: false,
          reason: "not_string",
        });
      }
    }
  });

  it("truncate не розрізає сурогатну пару", () => {
    const name = "a".repeat(MAX_USER_NAME_LENGTH - 1) + "😀😀";
    const res = sanitizeUserName({ name }, "truncate");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.truncated).toBe(true);
      expect(res.data.name).toBe("a".repeat(MAX_USER_NAME_LENGTH - 1));
      // Валідний UTF-16 без «висячого» сурогата.
      expect(() => encodeURIComponent(res.data.name as string)).not.toThrow();
    }
  });
});

describe("guardUserName", () => {
  const long = { name: "N".repeat(MAX_USER_NAME_LENGTH + 50) };

  it("запити людини відхиляються з 400 INVALID_NAME", () => {
    for (const [ctx, op] of [
      [{ path: "/sign-up/email" }, "create"],
      [{ path: "/update-user" }, "update"],
    ] as const) {
      expect(() => guardUserName(long, ctx, op)).toThrowError(
        expect.objectContaining({
          statusCode: 400,
          body: expect.objectContaining({ code: "INVALID_NAME" }),
        }),
      );
    }
  });

  it("не-користувацькі шляхи і відсутній context обрізають, а не валять вхід", () => {
    for (const [ctx, op] of [
      [{ path: "/callback/google" }, "create"],
      [null, "create"],
      [undefined, "update"],
      [{ path: "/link-social" }, "update"],
    ] as const) {
      expect(guardUserName(long, ctx, op).name).toBe(
        "N".repeat(MAX_USER_NAME_LENGTH),
      );
    }
  });
});
