import { describe, expect, it } from "vitest";
import { readNextParam, sanitizeNextPath } from "./safeNextPath";

describe("sanitizeNextPath", () => {
  it.each([
    ["/", "/"],
    ["/finyk/transactions", "/finyk/transactions"],
    ["/?tab=profile", "/?tab=profile"],
    ["/nutrition/log?d=2026-10-01#top", "/nutrition/log?d=2026-10-01#top"],
  ])("пропускає внутрішній шлях %s", (input, expected) => {
    expect(sanitizeNextPath(input)).toBe(expected);
  });

  it.each([
    "",
    "finyk",
    "//evil.example",
    "///evil.example",
    "/\\evil.example",
    "/a\\b",
    "https://evil.example",
    "javascript:alert(1)",
    "data:text/html,x",
    "/\u0000x",
    "/a\nb",
    "/sign-in",
    "/sign-in?next=/x",
    "/login",
    "/auth",
  ])("відкидає %j", (input) => {
    expect(sanitizeNextPath(input)).toBeNull();
  });

  it("відкидає null, undefined і надмірно довгі значення", () => {
    expect(sanitizeNextPath(null)).toBeNull();
    expect(sanitizeNextPath(undefined)).toBeNull();
    expect(sanitizeNextPath(`/${"a".repeat(3000)}`)).toBeNull();
  });
});

describe("readNextParam", () => {
  it("читає і санітизує next із search", () => {
    expect(readNextParam("?next=%2Ffizruk")).toBe("/fizruk");
    expect(readNextParam("?next=%2F%2Fevil.example")).toBeNull();
    expect(readNextParam("?other=1")).toBeNull();
    expect(readNextParam("")).toBeNull();
  });
});
