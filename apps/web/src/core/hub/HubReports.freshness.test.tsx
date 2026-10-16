// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { HubReports } from "./HubReports";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../../modules/fizruk/lib/sqliteReader";
import { notifyFizrukSqliteCacheRefresh } from "../../modules/fizruk/lib/sqliteReadGate";

// Billing is unrelated to the local hydration path; all report data stays real.
vi.mock("../billing", () => ({
  PaywallModal: () => null,
  useFeatureGate: () => ({ requireAccess: () => true }),
}));

beforeEach(() => {
  localStorage.clear();
  clearFizrukSqliteCache();
});
afterEach(() => {
  cleanup();
  clearFizrukSqliteCache();
});

it("shows insights hydrated after opening reports, without revisiting a module", async () => {
  render(<HubReports />);
  const title = "Найпродуктивніший день для тренувань";
  expect(screen.queryByText(title)).not.toBeInTheDocument();
  act(() => {
    __setFizrukSqliteCacheForTests({
      workouts: Array.from({ length: 22 }, (_, i) => ({
        id: `w${i}`,
        startedAt: new Date(Date.UTC(2026, 0, 5 + 7 * i, 10)).toISOString(),
        endedAt: new Date(Date.UTC(2026, 0, 5 + 7 * i, 11)).toISOString(),
        items: [],
        groups: [],
        warmup: null,
        cooldown: null,
        note: "",
      })),
    });
    notifyFizrukSqliteCacheRefresh();
  });
  expect(await screen.findByText(title)).toBeInTheDocument();
  act(() => {
    clearFizrukSqliteCache();
    notifyFizrukSqliteCacheRefresh();
  });
  expect(screen.queryByText(title)).not.toBeInTheDocument();
});
