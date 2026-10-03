import { describe, expect, it } from "vitest";

import { createMemoryKVStore } from "../test-utils";
import {
  ONBOARDING_COMPLETED_FIRED_KEY,
  ONBOARDING_DONE_KEY,
  isOnboardingCompletedFired,
  isOnboardingDone,
  markOnboardingCompletedFired,
  markOnboardingDone,
} from "./onboarding";
import { ONBOARDING_GOALS_KEY } from "./onboardingGoals";
import { recordHintShown } from "./hints";
import { markChecklistStepDone } from "./moduleChecklist";
import { resetOnboardingState } from "./onboardingReset";
import {
  FIRST_ACTION_PENDING_KEY,
  FIRST_ACTION_STARTED_AT_KEY,
  FIRST_REAL_ENTRY_KEY,
  SOFT_AUTH_DISMISSED_KEY,
  TTV_MS_KEY,
  VIBE_PICKS_KEY,
  markFirstActionPending,
  saveVibePicks,
} from "./vibePicks";

describe("resetOnboardingState", () => {
  it("clears onboarding, FTUX, hint, and checklist state without touching unrelated keys", () => {
    const store = createMemoryKVStore({ user_data_key: "keep" });
    markOnboardingDone(store);
    markOnboardingCompletedFired(store);
    saveVibePicks(store, ["finyk", "routine"]);
    store.setString(ONBOARDING_GOALS_KEY, JSON.stringify(["focus"]));
    markFirstActionPending(store);
    store.setString(FIRST_ACTION_STARTED_AT_KEY, "1700000000000");
    store.setString(FIRST_REAL_ENTRY_KEY, "1");
    store.setString(TTV_MS_KEY, "4200");
    store.setString(SOFT_AUTH_DISMISSED_KEY, "1");
    recordHintShown(store, "settings_restart_onboarding", () => 1700000000000);
    markChecklistStepDone(store, "finyk", "add_expense");
    markChecklistStepDone(store, "routine", "create_habit");

    resetOnboardingState(store);

    expect(isOnboardingDone(store)).toBe(false);
    expect(isOnboardingCompletedFired(store)).toBe(false);
    for (const key of [
      ONBOARDING_DONE_KEY,
      ONBOARDING_COMPLETED_FIRED_KEY,
      VIBE_PICKS_KEY,
      ONBOARDING_GOALS_KEY,
      FIRST_ACTION_PENDING_KEY,
      FIRST_ACTION_STARTED_AT_KEY,
      FIRST_REAL_ENTRY_KEY,
      TTV_MS_KEY,
      SOFT_AUTH_DISMISSED_KEY,
      "hub_hints_v1",
      "finyk_checklist_v1",
      "routine_checklist_v1",
    ]) {
      expect(store.getString(key)).toBeNull();
    }
    expect(store.getString("user_data_key")).toBe("keep");
  });
});
