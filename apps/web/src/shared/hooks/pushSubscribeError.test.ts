import { describe, expect, it } from "vitest";
import { ApiError } from "@sergeant/api-client";
import {
  describePushSubscribeError,
  PUSH_SUBSCRIBE_ERROR_COPY,
  PUSH_VAPID_MISSING_MESSAGE,
} from "./pushSubscribeError";

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
