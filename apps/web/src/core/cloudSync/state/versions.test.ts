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

// PR #030 retired `fizruk`, PR #034 retired `nutrition` and PR #039
// retired `finyk` from SYNC_MODULES (storage-roadmap Stage 4); only
// `profile` remains. The pure version-bookkeeping helpers don't
// validate against SYNC_MODULES, but using the post-retirement set
// (`profile`) keeps the fixture honest. Multi-module assertions use a
// synthetic `_legacy_finyk` placeholder that does NOT collide with any
// active SYNC_MODULES entry — the helpers accept any string.
describe("setModuleVersion / getModuleVersion", () => {
  it("returns 0 when no version is recorded", () => {
    expect(getModuleVersion("u1", "profile")).toBe(0);
  });

  it("round-trips a single version", () => {
    setModuleVersion("u1", "profile", 7);
    expect(getModuleVersion("u1", "profile")).toBe(7);
  });

  it("isolates versions per user", () => {
    setModuleVersion("u1", "profile", 3);
    setModuleVersion("u2", "profile", 9);
    expect(getModuleVersion("u1", "profile")).toBe(3);
    expect(getModuleVersion("u2", "profile")).toBe(9);
  });

  it("isolates versions per module within the same user", () => {
    setModuleVersion("u1", "profile", 3);
    setModuleVersion("u1", "_legacy_finyk", 11);
    expect(getModuleVersion("u1", "profile")).toBe(3);
    expect(getModuleVersion("u1", "_legacy_finyk")).toBe(11);
  });

  it("overwrites the previous version on update", () => {
    setModuleVersion("u1", "profile", 1);
    setModuleVersion("u1", "profile", 5);
    expect(getModuleVersion("u1", "profile")).toBe(5);
  });

  it("persists the nested map under SYNC_VERSION_KEY", () => {
    setModuleVersion("u1", "profile", 4);
    setModuleVersion("u1", "_legacy_finyk", 6);
    setModuleVersion("u2", "profile", 8);
    const raw = localStorage.getItem(SYNC_VERSION_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({
      u1: { profile: 4, _legacy_finyk: 6 },
      u2: { profile: 8 },
    });
  });

  it("tolerates corrupted SYNC_VERSION_KEY", () => {
    localStorage.setItem(SYNC_VERSION_KEY, "{not-json");
    expect(getModuleVersion("u1", "profile")).toBe(0);
    setModuleVersion("u1", "profile", 2);
    expect(getModuleVersion("u1", "profile")).toBe(2);
  });
});
