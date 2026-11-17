// @vitest-environment jsdom
// Хвиля 5 продуктового реєстру (2026-11-17), PR-S5: Профіль існує лише для
// акаунта. Гостю `ProfilePage` рендерить `null`, а `useAppEffects` повертає
// `?tab=profile` на «Головну», тож хіт Профілю вів би гостя в нікуди.
// Окремий файл, бо `useSearchEngine.test.tsx` уже на межі vi.mock-храповика.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import type { Hit } from "./searchTypes";

const performSearch = vi.hoisted(() => vi.fn<(q: string) => Hit[]>(() => []));
const useAuthOptional = vi.hoisted(() =>
  vi.fn((): { user: unknown } | null => null),
);

vi.mock("./searchSources", () => ({ performSearch }));
vi.mock("../hubSearchEngine", () => ({
  getRecentQueries: () => [],
  pushRecentQuery: (q: string) => [q],
  clearRecentQueries: () => {},
}));
vi.mock("../../auth/AuthContext", () => ({ useAuthOptional }));
vi.mock("./useInlineAiRail", () => ({
  useInlineAiRail: () => ({
    state: { status: "idle" },
    ask: () => Promise.resolve(),
    reset: () => {},
    cancel: () => {},
  }),
}));

import { useSearchEngine } from "./useSearchEngine";

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function hit(
  partial: Partial<Hit> & Pick<Hit, "id" | "module" | "target">,
): Hit {
  return {
    moduleLabel: "",
    title: "",
    subtitle: "",
    icon: "",
    _score: 1,
    ...partial,
  } as Hit;
}

const PROFILE_HIT = hit({
  id: "profile_password",
  module: "profile",
  target: { kind: "profile" },
});
const SETTINGS_HIT = hit({
  id: "settings_privacy",
  module: "settings",
  target: { kind: "settings", sectionId: "privacy" },
});

function searchFor(q: string) {
  performSearch.mockReturnValue([PROFILE_HIT, SETTINGS_HIT]);
  const view = renderHook(
    () => useSearchEngine({ onClose: vi.fn(), onOpenModule: vi.fn() }),
    { wrapper },
  );
  act(() => {
    view.result.current.setQuery(q);
  });
  act(() => {
    vi.advanceTimersByTime(120);
  });
  return view.result.current;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useSearchEngine: хіти Профілю й акаунт", () => {
  it("гість не бачить хітів Профілю, решта лишається", () => {
    useAuthOptional.mockReturnValue({ user: null });
    const current = searchFor("пароль");
    expect(current.results.map((r) => r.id)).toEqual(["settings_privacy"]);
    expect(current.flat.map((r) => r.id)).toEqual(["settings_privacy"]);
  });

  it("залогінений бачить хіти Профілю", () => {
    useAuthOptional.mockReturnValue({ user: { id: "u1" } });
    const current = searchFor("пароль");
    expect(current.flat.map((r) => r.id)).toEqual([
      "settings_privacy",
      "profile_password",
    ]);
  });
});
