import { describe, expect, it } from "vitest";
import { apiMutationKeys, apiQueryKeys } from "./queryKeys";

describe("api-client react query keys", () => {
  it("exposes stable query keys for shared hooks", () => {
    expect(apiQueryKeys.me.current()).toEqual(["me", "current"]);
    expect(apiQueryKeys.coach.all).toEqual(["coach"]);
    expect(apiQueryKeys.coach.memory()).toEqual(["coach", "memory"]);
    expect(apiQueryKeys.coach.insight("2026-07-21")).toEqual([
      "coach",
      "insight",
      "2026-07-21",
    ]);
    expect(apiQueryKeys.weeklyDigest.byWeek("2026-W30")).toEqual([
      "weekly-digest",
      "2026-W30",
    ]);
    expect(apiQueryKeys.weeklyDigest.history).toEqual([
      "weekly-digest",
      "history",
    ]);
    expect(apiQueryKeys.push.vapidPublic()).toEqual(["push", "vapid-public"]);
    expect(apiQueryKeys.foodSearch.query("banana")).toEqual([
      "food-search",
      "banana",
    ]);
    expect(apiQueryKeys.barcode.lookup("4820000000000")).toEqual([
      "barcode",
      "4820000000000",
    ]);
    expect(apiQueryKeys.privat.balanceFinal("merchant-1")).toEqual([
      "privat",
      "balance-final",
      "merchant-1",
    ]);
  });

  it("exposes stable mutation keys", () => {
    expect(apiMutationKeys.push.register()).toEqual(["push", "register"]);
    expect(apiMutationKeys.push.test()).toEqual(["push", "test"]);
    expect(apiMutationKeys.push.unregister()).toEqual(["push", "unregister"]);
    expect(apiMutationKeys.nutrition.recommendRecipes()).toEqual([
      "nutrition",
      "recommend-recipes",
    ]);
  });
});
