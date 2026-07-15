// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KVStore } from "@sergeant/shared";

const sqliteValues = new Map<string, string>();
const sqliteStore: KVStore = {
  getString: (key) => sqliteValues.get(key) ?? null,
  setString: (key, value) => {
    sqliteValues.set(key, value);
  },
  remove: (key) => {
    sqliteValues.delete(key);
  },
  listKeys: () => [...sqliteValues.keys()],
  onChange: () => () => undefined,
};

vi.mock("../db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => sqliteStore,
}));

import {
  isOnboardingDone,
  markOnboardingDone,
  shouldShowOnboarding,
} from "./onboardingGate";
import { getVibePicks, saveVibePicks } from "./vibePicks";

beforeEach(() => {
  sqliteValues.clear();
  localStorage.clear();
});

describe("onboarding gate durable reload marker", () => {
  it("mirrors completion to physical localStorage while SQLite is active", () => {
    markOnboardingDone();

    expect(sqliteValues.get("hub_onboarding_done_v1")).toBe("1");
    expect(localStorage.getItem("hub_onboarding_done_v1")).toBe("1");
  });

  it("recognizes the durable marker even when the SQLite cache is empty", () => {
    localStorage.setItem("hub_onboarding_done_v1", "1");

    expect(isOnboardingDone()).toBe(true);
    expect(shouldShowOnboarding()).toBe(false);
  });

  it("restores selected modules from the durable mirror after SQLite cache loss", () => {
    saveVibePicks(["finyk", "routine"]);
    sqliteValues.clear();

    expect(getVibePicks()).toEqual(["finyk", "routine"]);
  });
});
