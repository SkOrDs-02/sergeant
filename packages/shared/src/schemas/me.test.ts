import { describe, it, expect } from "vitest";
import {
  MeResponseSchema,
  UserSchema,
  UserProfilePayloadSchema,
  UserProfilePutBodySchema,
  UserProfileResponseSchema,
  USER_PROFILE_MAX_BYTES,
  USER_PROFILE_MAX_DEPTH,
} from "./api";

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

describe("UserProfilePayloadSchema — write-through profile blob", () => {
  it("приймає порожній об'єкт", () => {
    expect(UserProfilePayloadSchema.parse({})).toEqual({});
  });

  it("приймає плаский об'єкт (глибина 1)", () => {
    const value = { name: "Ada", heightCm: 170 };
    expect(UserProfilePayloadSchema.parse(value)).toEqual(value);
  });

  it("приймає вкладеність рівно 3 рівні", () => {
    const value = { biometrics: { history: [{ weightKg: 70 }] } };
    expect(UserProfilePayloadSchema.parse(value)).toEqual(value);
  });

  it("відхиляє вкладеність понад 3 рівні", () => {
    const tooDeep = { a: { b: { c: { d: 1 } } } };
    expect(UserProfilePayloadSchema.safeParse(tooDeep).success).toBe(false);
  });

  it(`відхиляє payload понад ${USER_PROFILE_MAX_BYTES} байт`, () => {
    const huge = { blob: "x".repeat(USER_PROFILE_MAX_BYTES) };
    expect(UserProfilePayloadSchema.safeParse(huge).success).toBe(false);
  });

  it("відхиляє масив на верхньому рівні (мусить бути об'єктом)", () => {
    expect(UserProfilePayloadSchema.safeParse([1, 2, 3]).success).toBe(false);
  });

  it(`USER_PROFILE_MAX_DEPTH дорівнює 3`, () => {
    expect(USER_PROFILE_MAX_DEPTH).toBe(3);
  });
});

describe("UserProfilePutBodySchema / UserProfileResponseSchema", () => {
  it("вимагає поле profile у PUT body", () => {
    expect(() => UserProfilePutBodySchema.parse({})).toThrow();
  });

  it("парсить валідний PUT body", () => {
    const parsed = UserProfilePutBodySchema.parse({
      profile: { name: "Ada" },
    });
    expect(parsed.profile).toEqual({ name: "Ada" });
  });

  it("response дефолтить updatedAt у null", () => {
    const parsed = UserProfileResponseSchema.parse({
      profile: {},
      updatedAt: null,
    });
    expect(parsed).toEqual({ profile: {}, updatedAt: null });
  });
});
