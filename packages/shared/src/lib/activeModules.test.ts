import { describe, expect, it } from "vitest";

import { createMemoryKVStore } from "./kvStore";
import {
  HIDE_INACTIVE_MODULES_KEY,
  getActiveModules,
  getHideInactiveModules,
  isActiveModule,
  setActiveModules,
  setHideInactiveModules,
  toggleHideInactiveModules,
} from "./activeModules";
import { ALL_MODULES, VIBE_PICKS_KEY, saveVibePicks } from "./vibePicks";

describe("activeModules — getActiveModules", () => {
  it("falls back to ALL_MODULES on a fresh store", () => {
    const store = createMemoryKVStore();
    expect(getActiveModules(store)).toEqual([...ALL_MODULES]);
  });

  it("returns the saved subset when the user picked modules", () => {
    const store = createMemoryKVStore();
    saveVibePicks(store, ["finyk", "routine"]);
    expect(getActiveModules(store)).toEqual(["finyk", "routine"]);
  });

  it("falls back to ALL_MODULES when stored picks are empty", () => {
    const store = createMemoryKVStore();
    saveVibePicks(store, []);
    expect(getActiveModules(store)).toEqual([...ALL_MODULES]);
  });

  it("filters unknown ids out via sanitization", () => {
    const store = createMemoryKVStore();
    store.setString(VIBE_PICKS_KEY, JSON.stringify(["finyk", "bogus"]));
    expect(getActiveModules(store)).toEqual(["finyk"]);
  });
});

describe("activeModules — setActiveModules", () => {
  it("persists the selection", () => {
    const store = createMemoryKVStore();
    setActiveModules(store, ["fizruk"]);
    expect(getActiveModules(store)).toEqual(["fizruk"]);
  });

  it("an empty selection falls back to ALL_MODULES on read", () => {
    const store = createMemoryKVStore();
    setActiveModules(store, ["finyk"]);
    setActiveModules(store, []);
    expect(getActiveModules(store)).toEqual([...ALL_MODULES]);
  });
});

describe("activeModules — isActiveModule", () => {
  it("returns true when the id is in the active list", () => {
    expect(isActiveModule(["finyk", "routine"], "finyk")).toBe(true);
  });

  it("returns false when the id is missing", () => {
    expect(isActiveModule(["finyk", "routine"], "fizruk")).toBe(false);
  });
});

describe("activeModules — hide-inactive toggle", () => {
  it("defaults to false", () => {
    const store = createMemoryKVStore();
    expect(getHideInactiveModules(store)).toBe(false);
  });

  it("setHideInactiveModules(true) persists '1'", () => {
    const store = createMemoryKVStore();
    setHideInactiveModules(store, true);
    expect(store.getString(HIDE_INACTIVE_MODULES_KEY)).toBe("1");
    expect(getHideInactiveModules(store)).toBe(true);
  });

  it("setHideInactiveModules(false) removes the key", () => {
    const store = createMemoryKVStore();
    setHideInactiveModules(store, true);
    setHideInactiveModules(store, false);
    expect(store.getString(HIDE_INACTIVE_MODULES_KEY)).toBeNull();
    expect(getHideInactiveModules(store)).toBe(false);
  });

  it("toggleHideInactiveModules flips the flag and returns the new value", () => {
    const store = createMemoryKVStore();
    expect(toggleHideInactiveModules(store)).toBe(true);
    expect(getHideInactiveModules(store)).toBe(true);
    expect(toggleHideInactiveModules(store)).toBe(false);
    expect(getHideInactiveModules(store)).toBe(false);
  });
});
