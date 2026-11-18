// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// `vi.mock` is hoisted above any plain `const`, so we use `vi.hoisted` to
// share fresh `vi.fn()` instances between the mock factory and the tests.
const { useWeeklyDigestMock, useDigestHistoryMock, autoPendingMock } =
  vi.hoisted(() => ({
    useWeeklyDigestMock: vi.fn(),
    useDigestHistoryMock: vi.fn(),
    autoPendingMock: vi.fn((weekKey: string) => {
      void weekKey;
      return false;
    }),
  }));

// Stub the digest-history overlay (irrelevant to the 4-state contract).
vi.mock("./WeeklyDigestStories", () => ({
  WeeklyDigestStories: () => null,
}));

vi.mock("./useWeeklyDigest", () => ({
  useWeeklyDigest: (...args: unknown[]) => useWeeklyDigestMock(...args),
  useDigestHistory: (...args: unknown[]) => useDigestHistoryMock(...args),
  useAutoDigestPending: (weekKey: string) => autoPendingMock(weekKey),
  // Без аргументу — поточний тиждень, з датою — минулий (картка рахує його
  // як «поточний мінус 7 днів»).
  getWeekKey: (d?: Date) => (d ? "2025-11-03" : "2025-11-10"),
  // Картка читає coverage окремо від тіла звіту (аудит nutrition § E-4):
  // `summary` пише модель, а «залоговано N/7» мусить лишитись фактом.
  aggregateNutrition: () => null,
}));

import { WeeklyDigestCard } from "./WeeklyDigestCard";

describe("WeeklyDigestCard — DataState routing", () => {
  // `canGenerate` — частина контракту `useWeeklyDigest` з #935
  // (`isCurrentWeek || isPreviousWeek`). Мок мусить його віддавати: без
  // нього поле приходить `undefined`, картка ховає обидві кнопки
  // генерації, і тести падають із «Unable to find an accessible element
  // with the role button» — тобто симптом вказує на розмітку, а причина
  // в формі мока.
  beforeEach(() => {
    vi.clearAllMocks();
    useDigestHistoryMock.mockReturnValue({ data: [] });
    autoPendingMock.mockReturnValue(false);
  });

  // The shared apps/web vitest setup (src/test/setup.ts) does not register
  // RTL's auto-cleanup, so two `render()` calls would otherwise stack their
  // DOM trees and leak state between tests.
  afterEach(() => {
    cleanup();
  });

  it("renders the loading skeleton (`aria-busy`) while a digest is generating", () => {
    useWeeklyDigestMock.mockReturnValue({
      digest: null,
      loading: true,
      error: null,
      weekRange: "10 — 16 листоп.",
      generate: vi.fn(),
      isCurrentWeek: true,
      canGenerate: true,
    });

    render(<WeeklyDigestCard />);

    expect(screen.getByLabelText(/генерую звіт тижня/i)).toBeInTheDocument();
    // No empty/error/content affordances while skeleton is up.
    expect(
      screen.queryByRole("button", { name: /згенерувати звіт/i }),
    ).toBeNull();
  });

  // Рішення власника 2026-09-03: звіт створює лише понеділкова
  // автогенерація, кнопки «Згенерувати звіт» у порожньому стані немає.
  it("renders the empty slot WITHOUT a generate button on the current week when there is no digest", () => {
    useWeeklyDigestMock.mockReturnValue({
      digest: null,
      loading: false,
      error: null,
      weekRange: "10 — 16 листоп.",
      generate: vi.fn(),
      isCurrentWeek: true,
      canGenerate: true,
    });

    render(<WeeklyDigestCard />);

    expect(
      screen.queryByRole("button", { name: /згенерувати звіт/i }),
    ).toBeNull();
    // С-3 (а), рішення власника 2026-11-18: звіт догенеровується при першому
    // відкритті головної після завершення тижня, а не лише в понеділок.
    expect(
      screen.getByText(
        "Звіт зʼявиться сам, коли тиждень завершиться і ти вперше відкриєш головну.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/у понеділок/i)).toBeNull();
    expect(screen.queryByLabelText(/генерую звіт тижня/i)).toBeNull();
  });

  // С-3 (а), рішення власника 2026-11-18: автогенерація чи читання серверної
  // копії звіту за минулий тиждень у польоті — картка каже, що звіт
  // збирається, а не показує порожній стан, ніби нічого не відбувається.
  it("while last week's auto report is in flight, the card says it is being prepared", () => {
    autoPendingMock.mockReturnValue(true);
    useWeeklyDigestMock.mockReturnValue({
      digest: null,
      loading: false,
      error: null,
      weekRange: "10 — 16 листоп.",
      generate: vi.fn(),
      isCurrentWeek: true,
      canGenerate: true,
    });

    render(<WeeklyDigestCard />);

    expect(autoPendingMock).toHaveBeenCalledWith("2025-11-03");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Збираю звіт за минулий тиждень…",
    );
    expect(screen.queryByText(/коли тиждень завершиться/i)).toBeNull();
  });

  it("after the auto report settles without a report (insufficient data or error), the honest empty state returns", () => {
    autoPendingMock.mockReturnValue(false);
    useWeeklyDigestMock.mockReturnValue({
      digest: null,
      loading: false,
      error: null,
      weekRange: "10 — 16 листоп.",
      generate: vi.fn(),
      isCurrentWeek: true,
      canGenerate: true,
    });

    render(<WeeklyDigestCard />);

    expect(
      screen.getByText(
        "Звіт зʼявиться сам, коли тиждень завершиться і ти вперше відкриєш головну.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Збираю звіт/)).toBeNull();
  });

  it("empty slot for the finished week does not promise a Monday that already passed", () => {
    useWeeklyDigestMock.mockReturnValue({
      digest: null,
      loading: false,
      error: null,
      weekRange: "03 — 09 листоп.",
      generate: vi.fn(),
      isCurrentWeek: false,
      canGenerate: true,
    });

    render(<WeeklyDigestCard />);

    expect(
      screen.getByText("Звіт за цей тиждень ще не зібрано."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/коли тиждень завершиться/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /згенерувати звіт/i }),
    ).toBeNull();
  });

  it("opens on last week's digest when the new week has none yet (Monday auto-report)", () => {
    useDigestHistoryMock.mockReturnValue({
      data: [{ weekKey: "2025-11-03", weekRange: "03 — 09 листоп." }],
    });
    useWeeklyDigestMock.mockReturnValue({
      digest: null,
      loading: true,
      error: null,
      weekRange: "03 — 09 листоп.",
      generate: vi.fn(),
      isCurrentWeek: false,
      canGenerate: true,
    });

    render(<WeeklyDigestCard />);

    expect(useWeeklyDigestMock).toHaveBeenLastCalledWith("2025-11-03");
  });

  // Перевірка першої хвилі 2026-11-18: «Поточний тиждень» був кнопкою, що
  // виглядала як звичайний підпис, і без зони дотику 44 px на coarse.
  it("на минулому тижні «Поточний тиждень» — видима дія з шевроном і зоною 44 px", () => {
    useDigestHistoryMock.mockReturnValue({
      data: [{ weekKey: "2025-11-03", weekRange: "03 — 09 листоп." }],
    });
    useWeeklyDigestMock.mockReturnValue({
      digest: null,
      loading: true,
      error: null,
      weekRange: "03 — 09 листоп.",
      generate: vi.fn(),
      isCurrentWeek: false,
      canGenerate: true,
    });

    render(<WeeklyDigestCard />);

    const button = screen.getByRole("button", { name: "Поточний тиждень" });
    expect(button.querySelector("svg")).not.toBeNull();
    expect(button.className).toContain("min-h-[44px]");
  });

  it("stays on the current week once it has its own digest", () => {
    useDigestHistoryMock.mockReturnValue({
      data: [
        { weekKey: "2025-11-10", weekRange: "10 — 16 листоп." },
        { weekKey: "2025-11-03", weekRange: "03 — 09 листоп." },
      ],
    });
    useWeeklyDigestMock.mockReturnValue({
      digest: null,
      loading: true,
      error: null,
      weekRange: "10 — 16 листоп.",
      generate: vi.fn(),
      isCurrentWeek: true,
      canGenerate: true,
    });

    render(<WeeklyDigestCard />);

    expect(useWeeklyDigestMock).toHaveBeenLastCalledWith("2025-11-10");
  });

  it("renders the empty slot with a 'not stored' message on a past week", () => {
    useWeeklyDigestMock.mockReturnValue({
      digest: null,
      loading: false,
      error: null,
      weekRange: "03 — 09 листоп.",
      generate: vi.fn(),
      isCurrentWeek: false,
      canGenerate: false,
    });

    render(<WeeklyDigestCard />);

    expect(
      screen.getByText(/звіт за цей тиждень не збережено/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /згенерувати звіт/i }),
    ).toBeNull();
  });

  it("renders the error slot (with retry on current week) when the mutation reports an error and loading has settled", () => {
    useWeeklyDigestMock.mockReturnValue({
      digest: null,
      loading: false,
      error: "Не вдалося згенерувати",
      weekRange: "10 — 16 листоп.",
      generate: vi.fn(),
      isCurrentWeek: true,
      canGenerate: true,
    });

    render(<WeeklyDigestCard />);

    expect(screen.getByText(/не вдалося згенерувати/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /спробувати знову/i }),
    ).toBeInTheDocument();
  });

  it("renders digest content (stories button) when at least one module has data", () => {
    useWeeklyDigestMock.mockReturnValue({
      digest: {
        generatedAt: "2025-11-16T08:00:00Z",
        finyk: {
          summary: "Витрати в нормі",
          comment: null,
          recommendations: [],
        },
      },
      loading: false,
      error: null,
      weekRange: "10 — 16 листоп.",
      generate: vi.fn(),
      isCurrentWeek: true,
      canGenerate: true,
    });

    render(<WeeklyDigestCard />);

    expect(
      screen.getByRole("button", { name: /переглянути як сторіс/i }),
    ).toBeInTheDocument();
    // Empty/error affordances are not on screen.
    expect(
      screen.queryByRole("button", { name: /згенерувати звіт/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /спробувати знову/i }),
    ).toBeNull();
  });
});
