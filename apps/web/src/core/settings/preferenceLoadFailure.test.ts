/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * PR-S2: «Увійди в акаунт» має звучати ЛИШЕ тоді, коли сервер справді сказав
 * 401/403. Доти обидва споживачі серверних налаштувань ковтали помилку через
 * `.catch(() => …)` і на будь-який збій GET стверджували, що людина не
 * залогінена — тобто робили неправдиве твердження про стан акаунта і гнали її
 * перелогінюватись (знахідка огляду 2026-09-13).
 *
 * Тести тут пінують саме МЕЖІ класифікації, а не копію: копія може
 * змінитись, а правило «auth лише на позитивний auth-сигнал» змінитись не
 * повинно.
 */
import { describe, it, expect } from "vitest";
import { ApiError } from "@sergeant/api-client";

import {
  classifyPreferenceLoadFailure,
  PREFERENCE_LOAD_FAILURE_COPY,
} from "./preferenceLoadFailure";

const at = (init: Partial<ConstructorParameters<typeof ApiError>[0]>) =>
  new ApiError({
    kind: "http",
    message: "boom",
    url: "/api/me/preferences",
    ...init,
  });

describe("classifyPreferenceLoadFailure", () => {
  it("каже auth лише на 401 і 403", () => {
    expect(classifyPreferenceLoadFailure(at({ status: 401 }))).toBe("auth");
    expect(classifyPreferenceLoadFailure(at({ status: 403 }))).toBe("auth");
  });

  // Серцевина знахідки: залогінена людина в метро.
  it("каже offline, коли fetch не достукався до сервера", () => {
    expect(
      classifyPreferenceLoadFailure(at({ kind: "network", status: 0 })),
    ).toBe("offline");
  });

  // Другий бік тієї ж брехні: 500 не має ставати «ти не залогінений».
  it.each([500, 502, 503, 504, 429, 400])(
    "каже failure на HTTP %i, а не auth",
    (status) => {
      expect(classifyPreferenceLoadFailure(at({ status }))).toBe("failure");
    },
  );

  it("каже failure на зіпсуту відповідь", () => {
    expect(
      classifyPreferenceLoadFailure(at({ kind: "parse", status: 200 })),
    ).toBe("failure");
  });

  // Асиметрія навмисна: помилитись у бік «спробуй ще» дешево, у бік «ти не
  // залогінений» — дорого. Тож усе незнайоме падає в failure, не в auth.
  it.each([
    ["звичайна Error", new Error("nope")],
    ["рядок", "nope"],
    ["null", null],
    ["undefined", undefined],
  ])("каже failure на не-ApiError (%s)", (_label, err) => {
    expect(classifyPreferenceLoadFailure(err)).toBe("failure");
  });

  // `ApiError.isOffline` і `useOnlineStatus` тут НЕ використовуються, бо
  // обидва впираються в `navigator.onLine`, а він залипає на iOS/Capacitor.
  // Цей тест ловить спробу повернутись до нього: при `onLine === true`
  // мережева помилка все одно має читатись як offline.
  it("не залежить від navigator.onLine", () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "onLine");
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
    try {
      expect(
        classifyPreferenceLoadFailure(at({ kind: "network", status: 0 })),
      ).toBe("offline");
    } finally {
      if (original) Object.defineProperty(navigator, "onLine", original);
    }
  });
});

describe("PREFERENCE_LOAD_FAILURE_COPY", () => {
  // Правило канону копії: помилка закінчується дією, а не діагнозом.
  it.each(["offline", "failure"] as const)(
    "%s закінчується підказкою, що робити",
    (kind) => {
      // Регістр не фіксуємо: «Перевір інтернет і спробуй ще раз» пишеться з
      // малої після сполучника, і це правильна українська, а не розбіжність.
      expect(PREFERENCE_LOAD_FAILURE_COPY[kind]).toMatch(
        /[Сс]пробуй ще раз\.$/,
      );
    },
  );

  it("жодна з не-auth копій не згадує вхід в акаунт", () => {
    for (const text of Object.values(PREFERENCE_LOAD_FAILURE_COPY)) {
      expect(text).not.toMatch(/[Уу]війди|акаунт/);
    }
  });
});
