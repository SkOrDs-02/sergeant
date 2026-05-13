import { describe, it, expect } from "vitest";
import { mapApiErrorToUserCopy } from "./mapApiErrorToUserCopy";

describe("mapApiErrorToUserCopy", () => {
  it("мапить INVALID_PASSWORD у людську копію", () => {
    expect(
      mapApiErrorToUserCopy({
        code: "INVALID_PASSWORD",
        message: "Invalid password",
        status: 400,
      }),
    ).toBe("Невірний поточний пароль.");
  });

  it("мапить USER_ALREADY_EXISTS у людську копію", () => {
    expect(
      mapApiErrorToUserCopy({
        code: "USER_ALREADY_EXISTS",
        message: "User already exists.",
        status: 422,
      }),
    ).toBe("Користувач з таким email вже існує.");
  });

  it("мапить SESSION_EXPIRED у людську копію (ігнорує navigator/status)", () => {
    expect(
      mapApiErrorToUserCopy({
        code: "SESSION_EXPIRED",
        status: 401,
      }),
    ).toBe("Сесія завершилась. Увійди ще раз.");
  });

  it("мапить VALIDATION_ERROR у людську копію", () => {
    expect(
      mapApiErrorToUserCopy({
        code: "VALIDATION_ERROR",
        message: "name too long",
        status: 400,
      }),
    ).toBe("Деякі поля заповнені некоректно. Перевір введені дані.");
  });

  it("мапить EMAIL_CAN_NOT_BE_UPDATED у людську копію", () => {
    expect(
      mapApiErrorToUserCopy({
        code: "EMAIL_CAN_NOT_BE_UPDATED",
        status: 400,
      }),
    ).toBe("Email не можна оновити для цього акаунту.");
  });

  it("unknown code → caller-fallback (а не сирий error.message)", () => {
    expect(
      mapApiErrorToUserCopy(
        {
          code: "TOTALLY_UNKNOWN_CODE",
          message: "validation_error: name too long",
          status: 400,
        },
        "Не вдалося оновити імʼя",
      ),
    ).toBe("Не вдалося оновити імʼя");
  });

  it("unknown code без caller-fallback → generic UX-копія", () => {
    expect(
      mapApiErrorToUserCopy({
        code: "TOTALLY_UNKNOWN_CODE",
        message: "TypeError: Cannot read property 'data' of undefined",
        status: 400,
      }),
    ).toBe("Не вдалося виконати запит");
  });

  it("без code → status fallback (401 → 'Доступ заборонено.')", () => {
    expect(
      mapApiErrorToUserCopy({
        message: "Unauthorized",
        status: 401,
      }),
    ).toBe("Доступ заборонено.");
  });

  it("без code → status fallback (429 → rate-limit копія)", () => {
    expect(
      mapApiErrorToUserCopy({
        status: 429,
      }),
    ).toBe("Забагато запитів. Спробуй через хвилину.");
  });

  it("без code, status = 500 → caller-fallback (не голий 'Помилка 500')", () => {
    expect(
      mapApiErrorToUserCopy({ status: 500 }, "Не вдалося оновити імʼя"),
    ).toBe("Не вдалося оновити імʼя");
  });

  it("без code і status → fallback", () => {
    expect(mapApiErrorToUserCopy({}, "Не вдалося оновити імʼя")).toBe(
      "Не вдалося оновити імʼя",
    );
  });

  it("null / undefined → fallback", () => {
    expect(mapApiErrorToUserCopy(null, "Не вдалося оновити імʼя")).toBe(
      "Не вдалося оновити імʼя",
    );
    expect(mapApiErrorToUserCopy(undefined, "Не вдалося оновити імʼя")).toBe(
      "Не вдалося оновити імʼя",
    );
  });

  it("без аргумента fallback → дефолтний generic-string", () => {
    expect(mapApiErrorToUserCopy(null)).toBe("Не вдалося виконати запит");
  });
});
