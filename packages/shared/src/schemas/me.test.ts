import { describe, it, expect } from "vitest";
import { MeResponseSchema, UserSchema } from "./api";

describe("UserSchema", () => {
  it("парсить мінімально валідного користувача", () => {
    expect(
      UserSchema.parse({
        id: "u-1",
        email: "x@y.com",
        name: "Ім'я",
        image: null,
        emailVerified: true,
        createdAt: "2026-01-15T08:30:00.000Z",
      }),
    ).toEqual({
      id: "u-1",
      email: "x@y.com",
      name: "Ім'я",
      image: null,
      emailVerified: true,
      createdAt: "2026-01-15T08:30:00.000Z",
    });
  });

  it("дозволяє null у email/name/image", () => {
    expect(
      UserSchema.parse({
        id: "u-2",
        email: null,
        name: null,
        image: null,
        emailVerified: false,
        createdAt: null,
      }),
    ).toMatchObject({ email: null, name: null, image: null, createdAt: null });
  });

  it.each(["", " ", "bad-email"])("падає на невалідному email %p", (email) => {
    expect(() =>
      UserSchema.parse({
        id: "u-3",
        email,
        name: null,
        image: null,
        emailVerified: false,
        createdAt: null,
      }),
    ).toThrow();
  });

  it("падає на порожньому id", () => {
    expect(() =>
      UserSchema.parse({
        id: "",
        email: null,
        name: null,
        image: null,
        emailVerified: false,
        createdAt: null,
      }),
    ).toThrow();
  });

  it("падає на не-ISO createdAt", () => {
    expect(() =>
      UserSchema.parse({
        id: "u-5",
        email: null,
        name: null,
        image: null,
        emailVerified: false,
        createdAt: "yesterday",
      }),
    ).toThrow();
  });
});

describe("MeResponseSchema", () => {
  it("вимагає поле user", () => {
    expect(() => MeResponseSchema.parse({})).toThrow();
  });

  it("парсить повний response", () => {
    const parsed = MeResponseSchema.parse({
      user: {
        id: "u-4",
        email: "a@b.co",
        name: "A",
        image: "https://x.test/avatar.png",
        emailVerified: true,
        createdAt: "2026-01-15T08:30:00.000Z",
      },
    });
    expect(parsed.user.id).toBe("u-4");
    expect(parsed.user.createdAt).toBe("2026-01-15T08:30:00.000Z");
  });
});
