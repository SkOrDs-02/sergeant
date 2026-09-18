// @vitest-environment jsdom
/**
 * Tests for StrategyPage (PR-34 skeleton UI).
 *
 * `internalFetch` short-circuits to a synthetic 403 when
 * `VITE_INTERNAL_API_KEY` is unset (test env). We mock the module so tests
 * can control success/error responses without setting the env var.
 *
 * Kyiv weekStart:
 *   Frozen to Thursday 2026-06-04 12:00 EEST (UTC 09:00).
 *   ISO week = Mon 2026-06-01..Sun 2026-06-07 → weekStart = "2026-06-01".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { messages } from "../../shared/i18n/uk";

// Mock internalFetch BEFORE importing StrategyPage so the module is
// intercepted at load time.
vi.mock("@shared/lib/api/internalFetch", () => ({
  internalFetch: vi.fn(),
}));

// Import after mock is registered.
import { internalFetch } from "@shared/lib/api/internalFetch";
import { StrategyPage } from "./StrategyPage";

const mockFetch = internalFetch as ReturnType<typeof vi.fn>;

// ── helpers ────────────────────────────────────────────────────────────────────

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

const TEST_FOUNDER_ID = "founder_test_123";

function renderPage() {
  const Wrapper = makeWrapper();
  return render(
    <Wrapper>
      <StrategyPage founderUserId={TEST_FOUNDER_ID} />
    </Wrapper>,
  );
}

const MOCK_GOAL = {
  id: 1,
  persona: "finyk" as const,
  founderUserId: TEST_FOUNDER_ID,
  weekStart: "2026-06-01",
  goalText: "Скоротити кавові витрати на 30%",
  status: "active" as const,
  createdAt: "2026-06-01T09:00:00Z",
  updatedAt: "2026-06-01T09:00:00Z",
};

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe("StrategyPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: list query returns empty goals
    mockFetch.mockResolvedValue(makeJsonResponse({ ok: true, goals: [] }));
  });

  afterEach(cleanup);

  describe("static rendering", () => {
    it("renders the page title", () => {
      renderPage();
      expect(screen.getByText(messages.strategy.title)).toBeInTheDocument();
    });

    it("renders the 'add goal' heading", () => {
      renderPage();
      expect(
        screen.getByRole("heading", { name: messages.strategy.addGoal }),
      ).toBeInTheDocument();
    });

    it("renders the persona select with all 4 options", () => {
      renderPage();
      const select = screen.getByRole("combobox");
      expect(select).toBeInTheDocument();
      const options = screen.getAllByRole("option");
      expect(options).toHaveLength(4);
    });

    it("renders the goal text textarea", () => {
      renderPage();
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });

    it("renders the submit button with 'add goal' label", () => {
      renderPage();
      expect(
        screen.getByRole("button", { name: messages.strategy.addGoal }),
      ).toBeInTheDocument();
    });

    it("shows the weekStart in the header subtitle as a YYYY-MM-DD date", () => {
      renderPage();
      const header = screen.getByRole("banner");
      expect(header.textContent).toMatch(/\d{4}-\d{2}-\d{2}/);
    });
  });

  describe("empty-state (goals list empty)", () => {
    it("shows loading state then empty state copy", async () => {
      renderPage();
      expect(screen.queryByText(messages.strategy.loading)).toBeInTheDocument();
      await waitFor(() => {
        expect(
          screen.getByText(messages.strategy.emptyStatePrefix, {
            exact: false,
          }),
        ).toBeInTheDocument();
      });
    });
  });

  describe("goals list rendering", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(
        makeJsonResponse({ ok: true, goals: [MOCK_GOAL] }),
      );
    });

    it("renders goal text after data loads", async () => {
      renderPage();
      await waitFor(() => {
        expect(
          screen.getByText("Скоротити кавові витрати на 30%"),
        ).toBeInTheDocument();
      });
    });

    it("renders a persona section heading for finyk", async () => {
      renderPage();
      await waitFor(() => {
        // "Фінік (фінанси)" is the PERSONA_LABELS entry for "finyk"
        expect(screen.getByText("Фінік (фінанси)")).toBeInTheDocument();
      });
    });

    it("renders goal id and status badge", async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/#1 · active/)).toBeInTheDocument();
      });
    });
  });

  describe("form validation", () => {
    it("shows validation error when submitting with empty goal text", async () => {
      renderPage();
      await waitFor(() => {
        expect(
          screen.getByText(messages.strategy.emptyStatePrefix, {
            exact: false,
          }),
        ).toBeInTheDocument();
      });
      act(() => {
        fireEvent.click(
          screen.getByRole("button", { name: messages.strategy.addGoal }),
        );
      });
      expect(
        screen.getByText(messages.strategy.goalTextRequired),
      ).toBeInTheDocument();
    });

    it("error message has role='alert' for accessibility", async () => {
      renderPage();
      await waitFor(() => {
        expect(
          screen.getByText(messages.strategy.emptyStatePrefix, {
            exact: false,
          }),
        ).toBeInTheDocument();
      });
      act(() => {
        fireEvent.click(
          screen.getByRole("button", { name: messages.strategy.addGoal }),
        );
      });
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  describe("create goal mutation (success path)", () => {
    beforeEach(() => {
      // First call (list query) returns empty; second call (create mutation) returns the new goal
      mockFetch
        .mockResolvedValueOnce(makeJsonResponse({ ok: true, goals: [] }))
        .mockResolvedValueOnce(makeJsonResponse({ ok: true, goal: MOCK_GOAL }))
        // Subsequent list invalidation returns goal
        .mockResolvedValue(makeJsonResponse({ ok: true, goals: [MOCK_GOAL] }));
    });

    it("clears the textarea after a successful submission", async () => {
      renderPage();
      await waitFor(() => {
        expect(
          screen.getByText(messages.strategy.emptyStatePrefix, {
            exact: false,
          }),
        ).toBeInTheDocument();
      });
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Новий тест" } });
      expect(textarea.value).toBe("Новий тест");

      fireEvent.click(
        screen.getByRole("button", { name: messages.strategy.addGoal }),
      );

      await waitFor(() => {
        expect(textarea.value).toBe("");
      });
    });
  });

  describe("create goal mutation (error path)", () => {
    beforeEach(() => {
      mockFetch
        .mockResolvedValueOnce(makeJsonResponse({ ok: true, goals: [] }))
        .mockResolvedValueOnce(
          makeJsonResponse({ ok: false, error: "server_error" }, 500),
        );
    });

    it("shows a generic error message after server 500", async () => {
      renderPage();
      await waitFor(() => {
        expect(
          screen.getByText(messages.strategy.emptyStatePrefix, {
            exact: false,
          }),
        ).toBeInTheDocument();
      });
      const textarea = screen.getByRole("textbox");
      fireEvent.change(textarea, { target: { value: "Fail test" } });
      fireEvent.click(
        screen.getByRole("button", { name: messages.strategy.addGoal }),
      );
      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });
    });
  });

  describe("kyiv week boundary", () => {
    beforeEach(() => {
      // Freeze system clock to Kyiv Thu 2026-06-04 12:00 EEST (UTC 09:00).
      // ISO week Mon 2026-06-01..Sun 2026-06-07 → weekStart = "2026-06-01".
      vi.setSystemTime(new Date("2026-06-04T09:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("weekStart rendered in <code> is a Monday", async () => {
      renderPage();
      await waitFor(() => {
        expect(
          screen.getByText(messages.strategy.emptyStatePrefix, {
            exact: false,
          }),
        ).toBeInTheDocument();
      });
      const code = document.querySelector("code");
      expect(code).not.toBeNull();
      const dateStr = code!.textContent ?? "";
      expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Verify it is a Monday (getDay() === 1)
      const d = new Date(`${dateStr}T12:00:00Z`);
      expect(d.getDay()).toBe(1);
    });
  });
});
