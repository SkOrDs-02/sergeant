import { describe, it, expect } from "vitest";
import {
  ACCESS_COOKIE_NAME,
  buildAccessCookie,
  decideAccess,
} from "./accessGate";

const TOKEN = "s3rgeant-private-token";

describe("decideAccess", () => {
  it("пропускає всіх, поки токен не налаштований", () => {
    expect(
      decideAccess({
        url: "https://app.sergeant.com.ua/finyk",
        cookieHeader: null,
        token: undefined,
      }),
    ).toEqual({ kind: "pass" });
  });

  it("блокує запит без куки й без параметра", () => {
    expect(
      decideAccess({
        url: "https://app.sergeant.com.ua/finyk",
        cookieHeader: "other=1",
        token: TOKEN,
      }),
    ).toEqual({ kind: "block" });
  });

  it("видає куку за секретним посиланням і прибирає токен з адреси", () => {
    expect(
      decideAccess({
        url: `https://app.sergeant.com.ua/finyk?tab=all&access=${TOKEN}`,
        cookieHeader: null,
        token: TOKEN,
      }),
    ).toEqual({ kind: "grant", redirectTo: "/finyk?tab=all" });
  });

  it("пропускає з валідною кукою серед інших", () => {
    expect(
      decideAccess({
        url: "https://app.sergeant.com.ua/",
        cookieHeader: `foo=bar; ${ACCESS_COOKIE_NAME}=${TOKEN}; baz=1`,
        token: TOKEN,
      }),
    ).toEqual({ kind: "pass" });
  });

  it("блокує чужу куку і чужий параметр", () => {
    expect(
      decideAccess({
        url: "https://app.sergeant.com.ua/?access=wrong-token-value",
        cookieHeader: `${ACCESS_COOKIE_NAME}=also-wrong`,
        token: TOKEN,
      }),
    ).toEqual({ kind: "block" });
  });
});

describe("buildAccessCookie", () => {
  it("ставить HttpOnly, Secure і SameSite", () => {
    const cookie = buildAccessCookie(TOKEN);
    expect(cookie).toContain(`${ACCESS_COOKIE_NAME}=${TOKEN}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });
});
