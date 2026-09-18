// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupDemoLeftoversOnce } from "./demoLeftoverCleanup";

/**
 * Гейт прибирання — несуча деталь, не стиль. Список ключів містить
 * `hub_onboarding_done_v1`, `hub_first_real_entry_v1` і
 * `finyk_manual_only_v1`, тобто справжній стан користувача. Зняти гейт =
 * показати splash-онбординг усім наявним користувачам, тож перший тест
 * тут саме про пристрій БЕЗ демо.
 */
describe("cleanupDemoLeftoversOnce", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("не чіпає НІЧОГО на пристрої, який не стояв у демо", () => {
    window.localStorage.setItem("hub_onboarding_done_v1", "1");
    window.localStorage.setItem("hub_first_real_entry_v1", "1");
    window.localStorage.setItem("finyk_manual_only_v1", "1");
    window.localStorage.setItem("finyk_manual_expenses_v1", '[{"id":"real"}]');

    cleanupDemoLeftoversOnce();

    expect(window.localStorage.getItem("hub_onboarding_done_v1")).toBe("1");
    expect(window.localStorage.getItem("hub_first_real_entry_v1")).toBe("1");
    expect(window.localStorage.getItem("finyk_manual_only_v1")).toBe("1");
    expect(window.localStorage.getItem("finyk_manual_expenses_v1")).toBe(
      '[{"id":"real"}]',
    );
  });

  it("стирає демо-payload на пристрої з демо-прапорцем", () => {
    window.localStorage.setItem("hub_demo_seeded_social_v1", "1");
    window.localStorage.setItem("hub_onboarding_done_v1", "1");
    window.localStorage.setItem("finyk_manual_expenses_v1", '[{"id":"demo"}]');
    window.localStorage.setItem("nutrition_water_v1", "{}");
    window.localStorage.setItem("routine_quick_stats", "{}");

    cleanupDemoLeftoversOnce();

    expect(window.localStorage.getItem("hub_demo_seeded_social_v1")).toBeNull();
    expect(window.localStorage.getItem("hub_onboarding_done_v1")).toBeNull();
    expect(window.localStorage.getItem("finyk_manual_expenses_v1")).toBeNull();
    expect(window.localStorage.getItem("nutrition_water_v1")).toBeNull();
    expect(window.localStorage.getItem("routine_quick_stats")).toBeNull();
  });

  it("самозавершальне: другий виклик уже не має що робити, чужі ключі цілі", () => {
    window.localStorage.setItem("hub_demo_seeded_social_v1", "1");
    window.localStorage.setItem("finyk_manual_expenses_v1", '[{"id":"demo"}]');

    cleanupDemoLeftoversOnce();

    // Між прогонами користувач устиг завести справжній запис і пройти
    // онбординг наново — другий виклик не має права їх забрати.
    window.localStorage.setItem("finyk_manual_expenses_v1", '[{"id":"real"}]');
    window.localStorage.setItem("hub_onboarding_done_v1", "1");

    cleanupDemoLeftoversOnce();

    expect(window.localStorage.getItem("finyk_manual_expenses_v1")).toBe(
      '[{"id":"real"}]',
    );
    expect(window.localStorage.getItem("hub_onboarding_done_v1")).toBe("1");
  });
});
