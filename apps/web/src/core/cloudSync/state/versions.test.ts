// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SYNC_VERSION_KEY } from "../config";
import { getModuleVersion, setModuleVersion } from "./versions";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

describe("setModuleVersion / getModuleVersion", () => {
  it("returns 0 when no version is recorded", () => {
    expect(getModuleVersion("u1", "finyk")).toBe(0);
  });

  it("round-trips a single version", () => {
    setModuleVersion("u1", "finyk", 7);
    expect(getModuleVersion("u1", "finyk")).toBe(7);
  });

  it("isolates versions per user", () => {
    setModuleVersion("u1", "finyk", 3);
    setModuleVersion("u2", "finyk", 9);
    expect(getModuleVersion("u1", "finyk")).toBe(3);
    expect(getModuleVersion("u2", "finyk")).toBe(9);
  });

  it("isolates versions per module within the same user", () => {
    // PR #030 retired `fizruk` and PR #034 retired `nutrition` from
    // SYNC_MODULES; use `profile` as the second valid module here.
    setModuleVersion("u1", "finyk", 3);
    setModuleVersion("u1", "profile", 11);
    expect(getModuleVersion("u1", "finyk")).toBe(3);
    expect(getModuleVersion("u1", "profile")).toBe(11);
  });

  it("overwrites the previous version on update", () => {
    setModuleVersion("u1", "finyk", 1);
    setModuleVersion("u1", "finyk", 5);
    expect(getModuleVersion("u1", "finyk")).toBe(5);
  });

  it("persists the nested map under SYNC_VERSION_KEY", () => {
    setModuleVersion("u1", "finyk", 4);
    setModuleVersion("u1", "profile", 6);
    setModuleVersion("u2", "finyk", 8);
    const raw = localStorage.getItem(SYNC_VERSION_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({
      u1: { finyk: 4, profile: 6 },
      u2: { finyk: 8 },
    });
  });

  it("tolerates corrupted SYNC_VERSION_KEY", () => {
    localStorage.setItem(SYNC_VERSION_KEY, "{not-json");
    expect(getModuleVersion("u1", "finyk")).toBe(0);
    setModuleVersion("u1", "finyk", 2);
    expect(getModuleVersion("u1", "finyk")).toBe(2);
  });
});
