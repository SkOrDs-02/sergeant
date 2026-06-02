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

  // ── @sergeant/api-client canonical lowercase codes ──────────────────

  it("мапить validation_error (lowercase) у людську копію", () => {
    expect(
      mapApiErrorToUserCopy({ code: "validation_error", status: 422 }),
    ).toBe("Деякі поля заповнені некоректно. Перевір введені дані.");
  });

  it("мапить unauthenticated (lowercase) у людську копію", () => {
    expect(
      mapApiErrorToUserCopy({ code: "unauthenticated", status: 401 }),
    ).toBe("Доступ заборонено. Увійди ще раз.");
  });

  it("мапить forbidden (lowercase) у людську копію", () => {
    expect(mapApiErrorToUserCopy({ code: "forbidden", status: 403 })).toBe(
      "Недостатньо прав для цієї дії.",
    );
  });

  it("мапить rate_limited (lowercase) у людську копію", () => {
    expect(mapApiErrorToUserCopy({ code: "rate_limited", status: 429 })).toBe(
      "Забагато запитів. Спробуй через хвилину.",
    );
  });

  it("мапить network_error (lowercase) у людську копію", () => {
    expect(mapApiErrorToUserCopy({ code: "network_error" })).toBe(
      "Немає зʼєднання з сервером. Перевір мережу.",
    );
  });

  it("мапить conflict (lowercase) у людську копію", () => {
    expect(mapApiErrorToUserCopy({ code: "conflict", status: 409 })).toBe(
      "Дані змінено іншим пристроєм. Онови сторінку і спробуй ще раз.",
    );
  });

  it("мапить not_found (lowercase) у людську копію", () => {
    expect(mapApiErrorToUserCopy({ code: "not_found", status: 404 })).toBe(
      "Ресурс не знайдено.",
    );
  });

  it("мапить server_error (lowercase) у людську копію", () => {
    expect(mapApiErrorToUserCopy({ code: "server_error", status: 500 })).toBe(
      "Помилка сервера. Спробуй ще раз пізніше.",
    );
  });

  // ── Better Auth BASE_ERROR_CODES — повний перебір решти гілок ──────────

  it("мапить INVALID_EMAIL у людську копію", () => {
    expect(mapApiErrorToUserCopy({ code: "INVALID_EMAIL", status: 400 })).toBe(
      "Невірний формат email.",
    );
  });

  it("мапить INVALID_EMAIL_OR_PASSWORD у людську копію", () => {
    expect(
      mapApiErrorToUserCopy({ code: "INVALID_EMAIL_OR_PASSWORD", status: 400 }),
    ).toBe("Невірний email або пароль.");
  });

  it("мапить PASSWORD_TOO_SHORT у людську копію", () => {
    expect(
      mapApiErrorToUserCopy({ code: "PASSWORD_TOO_SHORT", status: 400 }),
    ).toBe("Пароль занадто короткий. Мінімум 10 символів.");
  });

  it("мапить PASSWORD_TOO_LONG у людську копію", () => {
    expect(
      mapApiErrorToUserCopy({ code: "PASSWORD_TOO_LONG", status: 400 }),
    ).toBe("Пароль занадто довгий. Максимум 128 символів.");
  });

  it("мапить USER_NOT_FOUND у людську копію", () => {
    expect(mapApiErrorToUserCopy({ code: "USER_NOT_FOUND", status: 404 })).toBe(
      "Користувача не знайдено.",
    );
  });

  it("мапить USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL у людську копію", () => {
    expect(
      mapApiErrorToUserCopy({
        code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
        status: 422,
      }),
    ).toBe("Користувач з таким email вже існує. Використай інший.");
  });

  it("мапить EMAIL_ALREADY_VERIFIED у людську копію", () => {
    expect(
      mapApiErrorToUserCopy({ code: "EMAIL_ALREADY_VERIFIED", status: 400 }),
    ).toBe("Email уже підтверджено.");
  });

  it("мапить EMAIL_NOT_VERIFIED у людську копію", () => {
    expect(
      mapApiErrorToUserCopy({ code: "EMAIL_NOT_VERIFIED", status: 403 }),
    ).toBe("Email ще не підтверджено.");
  });

  it("мапить CREDENTIAL_ACCOUNT_NOT_FOUND у людську копію", () => {
    expect(
      mapApiErrorToUserCopy({
        code: "CREDENTIAL_ACCOUNT_NOT_FOUND",
        status: 400,
      }),
    ).toBe("Для цього акаунту немає пароля — увійди через соцмережу.");
  });

  it("мапить SESSION_NOT_FRESH у людську копію", () => {
    expect(
      mapApiErrorToUserCopy({ code: "SESSION_NOT_FRESH", status: 403 }),
    ).toBe("Для цієї дії потрібен свіжий вхід. Увійди ще раз.");
  });

  it("мапить INVALID_TOKEN у людську копію", () => {
    expect(mapApiErrorToUserCopy({ code: "INVALID_TOKEN", status: 400 })).toBe(
      "Посилання недійсне або застаріле.",
    );
  });

  it("мапить TOKEN_EXPIRED у людську копію", () => {
    expect(mapApiErrorToUserCopy({ code: "TOKEN_EXPIRED", status: 400 })).toBe(
      "Посилання застаріло. Спробуй ще раз.",
    );
  });

  it("мапить MISSING_FIELD у людську копію", () => {
    expect(mapApiErrorToUserCopy({ code: "MISSING_FIELD", status: 400 })).toBe(
      "Заповни всі обовʼязкові поля.",
    );
  });

  it("мапить FAILED_TO_UPDATE_USER у людську копію", () => {
    expect(
      mapApiErrorToUserCopy({ code: "FAILED_TO_UPDATE_USER", status: 500 }),
    ).toBe("Не вдалося оновити дані. Спробуй ще раз.");
  });

  it("мапить FAILED_TO_CREATE_USER у людську копію", () => {
    expect(
      mapApiErrorToUserCopy({ code: "FAILED_TO_CREATE_USER", status: 500 }),
    ).toBe("Не вдалося створити акаунт. Спробуй ще раз.");
  });
});
