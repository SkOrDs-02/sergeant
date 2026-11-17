import { beforeEach, describe, expect, it } from "vitest";
import { APIError } from "better-auth/api";
import { authPasswordCheckFailuresTotal } from "../obs/metrics.js";
import {
  countChangePasswordFailureAfter,
  recordPasswordCheckFailure,
} from "./passwordCheckFailures.js";

// sec-10: алерт на серію INVALID_PASSWORD живиться цим лічильником. Тест
// стереже, що рахується рівно невірний пароль, а не будь-який 400.

async function count(route: string): Promise<number> {
  const { values } = await authPasswordCheckFailuresTotal.get();
  return values.find((v) => v.labels["route"] === route)?.value ?? 0;
}

function invalidPassword(): APIError {
  return new APIError("BAD_REQUEST", {
    code: "INVALID_PASSWORD",
    message: "Invalid password",
  });
}

beforeEach(() => {
  authPasswordCheckFailuresTotal.reset();
});

describe("countChangePasswordFailureAfter", () => {
  it("INVALID_PASSWORD на /change-password → +1 change_password", async () => {
    countChangePasswordFailureAfter({
      path: "/change-password",
      context: { returned: invalidPassword(), session: { user: { id: "u1" } } },
    });
    expect(await count("change_password")).toBe(1);
  });

  it("інший 400 (PASSWORD_TOO_SHORT) не рахується", async () => {
    countChangePasswordFailureAfter({
      path: "/change-password",
      context: {
        returned: new APIError("BAD_REQUEST", {
          code: "PASSWORD_TOO_SHORT",
          message: "Password too short",
        }),
      },
    });
    expect(await count("change_password")).toBe(0);
  });

  it("успішна зміна пароля не рахується", async () => {
    countChangePasswordFailureAfter({
      path: "/change-password",
      context: { returned: { token: null, user: { id: "u1" } } },
    });
    expect(await count("change_password")).toBe(0);
  });

  it("INVALID_PASSWORD на іншому шляху не рахується як change_password", async () => {
    countChangePasswordFailureAfter({
      path: "/sign-in/email",
      context: { returned: invalidPassword() },
    });
    expect(await count("change_password")).toBe(0);
  });
});

describe("recordPasswordCheckFailure", () => {
  it("рахує за route", async () => {
    recordPasswordCheckFailure("account_delete", "u1");
    recordPasswordCheckFailure("account_delete", null);
    expect(await count("account_delete")).toBe(2);
    expect(await count("change_password")).toBe(0);
  });
});
