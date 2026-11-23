import { describe, expect, it } from "vitest";
import { ApiError } from "@sergeant/api-client";
import {
  describePushSubscribeError,
  PUSH_VAPID_MISSING_MESSAGE,
} from "./pushSubscribeError";
import { coreMessages } from "@shared/i18n/uk.core";

const PUSH_SUBSCRIBE_ERROR_COPY = coreMessages.pushSubscribe;

const url = "/api/v1/push/register";

describe("describePushSubscribeError", () => {
  it("503 від сервера — сповіщення тимчасово недоступні", () => {
    const err = new ApiError({ kind: "http", status: 503, message: "x", url });
    expect(describePushSubscribeError(err)).toBe(
      PUSH_SUBSCRIBE_ERROR_COPY.unavailable,
    );
  });

  it("200 без publicKey — той самий стан, що й 503", () => {
    expect(
      describePushSubscribeError(new Error(PUSH_VAPID_MISSING_MESSAGE)),
    ).toBe(PUSH_SUBSCRIBE_ERROR_COPY.unavailable);
  });

  it("мережева помилка — просимо перевірити зʼєднання", () => {
    const err = new ApiError({ kind: "network", message: "x", url });
    expect(describePushSubscribeError(err)).toBe(
      PUSH_SUBSCRIBE_ERROR_COPY.network,
    );
  });

  it("інший HTTP-збій — сервер не відповідає", () => {
    const err = new ApiError({ kind: "http", status: 500, message: "x", url });
    expect(describePushSubscribeError(err)).toBe(
      PUSH_SUBSCRIBE_ERROR_COPY.server,
    );
  });

  it("не-API помилка — збій браузера", () => {
    const err = new DOMException("push service error", "AbortError");
    expect(describePushSubscribeError(err)).toBe(
      PUSH_SUBSCRIBE_ERROR_COPY.browser,
    );
  });
});

describe("pushSubscribeError copy", () => {
  it("тексти тосту живуть у каталозі, а не в модулі хелпера", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      new URL("./pushSubscribeError.ts", import.meta.url),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(src).not.toMatch(/[А-Яа-яЄєІіЇїҐґ]/);
    expect(coreMessages.pushSubscribe.retry).toBe("Повторити");
  });
});
