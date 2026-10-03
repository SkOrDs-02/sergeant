/**
 * Last validated: 2026-09-13
 * Status: Active
 */
import { describe, expect, it } from "vitest";
import { createMemoryKVStore } from "../test-utils";
import {
  CELEBRATED_STREAK_MILESTONES,
  TRACKED_STREAK_MILESTONES,
  claimStreakMilestone,
  highestMilestoneCrossed,
} from "./streakMilestones";

const memoryStore = createMemoryKVStore;

describe("highestMilestoneCrossed", () => {
  it("бере найвищу перетнуту, а не найнижчу", () => {
    expect(highestMilestoneCrossed(100, 5)).toBe(100);
  });

  it("повернення до того самого числа перетином не є", () => {
    expect(highestMilestoneCrossed(30, 30)).toBeNull();
    expect(highestMilestoneCrossed(30, 45)).toBeNull();
  });

  it("поважає переданий набір порогів", () => {
    // 14 є у tracked і немає у celebrated — саме та різниця, заради якої
    // набори лишаються двома.
    expect(highestMilestoneCrossed(14, 6, TRACKED_STREAK_MILESTONES)).toBe(14);
    expect(highestMilestoneCrossed(14, 6, CELEBRATED_STREAK_MILESTONES)).toBe(
      7,
    );
  });
});

describe("claimStreakMilestone", () => {
  it("перший запуск ЗАСІВАЄ і не святкує вже пройдене", () => {
    const store = memoryStore();
    // Людина зі стріком 45 на момент релізу: 7 і 30 позаду.
    expect(claimStreakMilestone(store, "routine", 45)).toBeNull();
    // І далі теж — вони зайняті засівом.
    expect(claimStreakMilestone(store, "routine", 45)).toBeNull();
    expect(claimStreakMilestone(store, "routine", 60)).toBeNull();
    // А от наступна віха святкується.
    expect(claimStreakMilestone(store, "routine", 100)).toBe(100);
  });

  it("новачок отримує кожну віху рівно один раз", () => {
    const store = memoryStore();
    expect(claimStreakMilestone(store, "routine", 0)).toBeNull(); // засів
    expect(claimStreakMilestone(store, "routine", 6)).toBeNull();
    expect(claimStreakMilestone(store, "routine", 7)).toBe(7);
    expect(claimStreakMilestone(store, "routine", 7)).toBeNull();
    expect(claimStreakMilestone(store, "routine", 29)).toBeNull();
    expect(claimStreakMilestone(store, "routine", 30)).toBe(30);
    expect(claimStreakMilestone(store, "routine", 30)).toBeNull();
  });

  // Регресія: grace-бюджет і skip можуть повернути стрік до того самого
  // числа, а холодний старт — стрибнути 0 → N за один рендер. Обидва
  // ламали б порівняння з попереднім значенням, але не зайняття.
  it("падіння і повернення до тієї самої віхи не святкується двічі", () => {
    const store = memoryStore();
    claimStreakMilestone(store, "routine", 0);
    expect(claimStreakMilestone(store, "routine", 7)).toBe(7);
    expect(claimStreakMilestone(store, "routine", 5)).toBeNull();
    expect(claimStreakMilestone(store, "routine", 7)).toBeNull();
  });

  it("стрибок через кілька віх гасить нижчі, щоб вони не вистрелили потім", () => {
    const store = memoryStore();
    claimStreakMilestone(store, "routine", 0);
    expect(claimStreakMilestone(store, "routine", 45)).toBe(30);
    // 7 зайнята разом із 30 — інакше вона вистрелила б наступним рендером.
    expect(claimStreakMilestone(store, "routine", 45)).toBeNull();
  });

  it("scope розділяє модулі", () => {
    const store = memoryStore();
    claimStreakMilestone(store, "routine", 0);
    claimStreakMilestone(store, "nutrition", 0);
    expect(claimStreakMilestone(store, "routine", 7)).toBe(7);
    // Їжа свою сімку ще не брала.
    expect(claimStreakMilestone(store, "nutrition", 7)).toBe(7);
  });
});
