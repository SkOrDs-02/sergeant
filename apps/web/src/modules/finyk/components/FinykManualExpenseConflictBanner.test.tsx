// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { FinykManualExpenseConflictBanner } from "./FinykManualExpenseConflictBanner";
import {
  __resetFinykManualExpenseConflictsForTests,
  dismissAllFinykManualExpenseConflicts,
  type FinykManualExpenseConflict,
  recordFinykManualExpenseConflict,
} from "../lib/conflicts/store";

function seedConflict(
  overrides: Partial<FinykManualExpenseConflict> = {},
): FinykManualExpenseConflict {
  return {
    transactionId: "tx-001",
    reason: "lww_conflict",
    localDataJson: '{"amount":42}',
    attemptedClientTs: "2026-05-04T12:34:56.000Z",
    detectedAt: 1714831200000,
    ...overrides,
  };
}

describe("FinykManualExpenseConflictBanner", () => {
  // The repo's vitest setup (`src/test/setup.ts`) does not auto-cleanup
  // RTL renders, so each test mounts into the same JSDOM document.
  // Without an explicit cleanup the second `render()` finds duplicate
  // banners by role+name. Pattern matches NoBankBanner.test.tsx.
  afterEach(() => {
    cleanup();
    __resetFinykManualExpenseConflictsForTests();
  });

  it("renders nothing when there are no conflicts", () => {
    const { container } = render(<FinykManualExpenseConflictBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a polite live region when at least one conflict exists", () => {
    act(() => {
      recordFinykManualExpenseConflict(seedConflict());
    });

    render(<FinykManualExpenseConflictBanner />);

    const region = screen.getByRole("status", {
      name: /Конфлікти синхронізації витрат/i,
    });
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute(
      "data-testid",
      "finyk-manual-expense-conflict-banner",
    );
  });

  it("uses Ukrainian one/few/many plural forms for the count noun", () => {
    // Cyclomatic count of forms: 1 → «конфлікт», 2..4 → «конфлікти»,
    // 5..20+ → «конфліктів». 11..14 — few-form виняток за UA-grammar
    // (`Intl.PluralRules` обробляє це нативно, тому ми лише перевіряємо
    // граничні випадки 1/3/5/12).
    type Case = { count: number; expected: RegExp };
    const cases: Case[] = [
      { count: 1, expected: /1\s+конфлікт\s+синхронізації/i },
      { count: 3, expected: /3\s+конфлікти\s+синхронізації/i },
      { count: 5, expected: /5\s+конфліктів\s+синхронізації/i },
      { count: 12, expected: /12\s+конфліктів\s+синхронізації/i },
    ];

    for (const { count, expected } of cases) {
      __resetFinykManualExpenseConflictsForTests();
      act(() => {
        for (let i = 0; i < count; i++) {
          recordFinykManualExpenseConflict(
            seedConflict({ transactionId: `tx-${i}` }),
          );
        }
      });

      const { unmount } = render(<FinykManualExpenseConflictBanner />);
      expect(screen.getByRole("status")).toHaveTextContent(expected);
      unmount();
    }
  });

  it("dismiss-all click invokes the override prop without touching the store", () => {
    act(() => {
      recordFinykManualExpenseConflict(seedConflict({ transactionId: "tx-1" }));
      recordFinykManualExpenseConflict(seedConflict({ transactionId: "tx-2" }));
    });

    const onDismissAll = vi.fn();
    render(<FinykManualExpenseConflictBanner onDismissAll={onDismissAll} />);

    fireEvent.click(
      screen.getByRole("button", { name: /Відхилити попередження/i }),
    );

    expect(onDismissAll).toHaveBeenCalledTimes(1);
    // Override cuts off the default path — store must remain untouched
    // so callers who own conflict-resolution flow can sequence their
    // own side-effects (e.g. trigger pull-then-merge) before clearing.
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(/2\s+конфлікти/i);
  });

  it("dismiss-all click without override clears the store + unmounts banner", () => {
    act(() => {
      recordFinykManualExpenseConflict(seedConflict({ transactionId: "tx-1" }));
    });

    render(<FinykManualExpenseConflictBanner />);
    expect(screen.getByRole("status")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Відхилити попередження/i }),
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("re-renders when the store fan-outs an update to subscribers", () => {
    render(<FinykManualExpenseConflictBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => {
      recordFinykManualExpenseConflict(seedConflict({ transactionId: "tx-A" }));
    });

    expect(screen.getByRole("status")).toHaveTextContent(/1\s+конфлікт/i);

    act(() => {
      recordFinykManualExpenseConflict(seedConflict({ transactionId: "tx-B" }));
      recordFinykManualExpenseConflict(seedConflict({ transactionId: "tx-C" }));
    });

    expect(screen.getByRole("status")).toHaveTextContent(/3\s+конфлікти/i);

    act(() => {
      dismissAllFinykManualExpenseConflicts();
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
