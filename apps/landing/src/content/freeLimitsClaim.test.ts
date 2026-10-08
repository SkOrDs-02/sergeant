import { FEATURES } from "@sergeant/shared";
import { describe, expect, it } from "vitest";
import { FREE_LIMITS } from "./freeLimitsClaim";

describe("ліміти безкоштовного плану на сайті", () => {
  it("збігаються з реєстром доступу", () => {
    expect(FEATURES["ai.actions"].free).toEqual({
      perWeek: FREE_LIMITS.aiActions,
    });
    expect(FEATURES["ai.photo"].free).toEqual({
      perWeek: FREE_LIMITS.aiPhoto,
    });
    expect(FEATURES["ai.finykVision"].free).toEqual({
      perWeek: FREE_LIMITS.finykVision,
    });
  });
});
