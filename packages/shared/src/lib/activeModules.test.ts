import { describe, expect, it } from "vitest";

import { createMemoryKVStore } from "../test-utils";
import {
  HIDE_INACTIVE_MODULES_KEY,
  getActiveModules,
  getHideInactiveModules,
  isActiveModule,
  setActiveModules,
  setHideInactiveModules,
  toggleHideInactiveModules,
} from "./activeModules";
import { markOnboardingDone } from "./onboarding";
import { ALL_MODULES, VIBE_PICKS_KEY, saveVibePicks } from "./vibePicks";

describe("activeModules — getActiveModules", () => {
  // Аудит 2026-08-05 (знахідка B2): «немає збереженого вибору» тепер означає
  // «ми не знаємо, що людина обрала», а не «вона обрала нічого». Так буває
  // після прямої реєстрації через /sign-in (візарда не було) і при вході на
  // новому пристрої (вибір не синхронізується). Показувати там мертвий хаб
  // з «0 з 4» — гірше, ніж показати всі модулі.
  it("returns ALL_MODULES on a fresh store (нема вибору → показуємо все)", () => {
    const store = createMemoryKVStore();
    expect(getActiveModules(store)).toEqual([...ALL_MODULES]);
  });

  it("returns the saved subset when the user picked modules", () => {
    const store = createMemoryKVStore();
    saveVibePicks(store, ["finyk", "routine"]);
    expect(getActiveModules(store)).toEqual(["finyk", "routine"]);
  });

  it("legacy onboarding-done users with empty picks keep the ALL_MODULES fallback", () => {
    const store = createMemoryKVStore();
    markOnboardingDone(store);
    saveVibePicks(store, []);
    expect(getActiveModules(store)).toEqual([...ALL_MODULES]);
  });

  it("empty picks without onboarding also fall back to ALL_MODULES", () => {
    const store = createMemoryKVStore();
    saveVibePicks(store, []);
    expect(getActiveModules(store)).toEqual([...ALL_MODULES]);
  });

  // Інтент S6.1 не втрачено: хто ПРОХОДИТЬ візард, робить реальний вибір
  // (основна CTA вимкнена, поки нічого не обрано) і потрапляє сюди.
  it("a real selection always wins over the fallback", () => {
    const store = createMemoryKVStore();
    markOnboardingDone(store);
    saveVibePicks(store, ["nutrition"]);
    expect(getActiveModules(store)).toEqual(["nutrition"]);
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

  it("legacy onboarding-done user clearing all picks keeps ALL_MODULES on read", () => {
    const store = createMemoryKVStore();
    markOnboardingDone(store);
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
