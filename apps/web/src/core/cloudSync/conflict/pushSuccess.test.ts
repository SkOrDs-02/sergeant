import { describe, expect, it } from "vitest";
import { isModulePushSuccess } from "./pushSuccess";

describe("isModulePushSuccess", () => {
  it("returns true for plain success shape", () => {
    expect(isModulePushSuccess({ ok: true, version: 1 })).toBe(true);
  });

  it("returns true when no failure flags are set", () => {
    expect(isModulePushSuccess({})).toBe(true);
  });

  it("returns false on conflict", () => {
    expect(isModulePushSuccess({ conflict: true })).toBe(false);
  });

  it("returns false when error field is present", () => {
    expect(isModulePushSuccess({ error: "boom" })).toBe(false);
  });

  it("returns false when ok is explicitly false", () => {
    expect(isModulePushSuccess({ ok: false })).toBe(false);
  });

  it("returns false for non-object inputs", () => {
    expect(isModulePushSuccess(null)).toBe(false);
    expect(isModulePushSuccess(undefined)).toBe(false);
    expect(isModulePushSuccess("ok")).toBe(false);
    expect(isModulePushSuccess(42)).toBe(false);
    expect(isModulePushSuccess(true)).toBe(false);
  });

  it("conflict trumps ok:true", () => {
    expect(isModulePushSuccess({ ok: true, conflict: true })).toBe(false);
  });
});
