/**
 * Smoke tests for `WeeklyDigestFooter` (HubDashboard PR-3).
 *
 * The shared pure helpers have full coverage in
 * `packages/shared/src/lib/weeklyDigest.test.ts`. What this file
 * asserts is specifically the mobile wiring:
 *   - visibility rules (Mon / Tue vs. rest of the week),
 *   - fresh-dot renders when the digest is live,
 *   - tapping the link opens the placeholder digest card.
 */

import { act, fireEvent, render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClientProvider } from "@sergeant/api-client/react";
import { STORAGE_KEYS } from "@sergeant/shared";

import { apiClient } from "@/api/apiClient";
import { _getMMKVInstance } from "@/lib/storage";

// `WeeklyDigestCard` (rendered as a closed `<Modal>` inside the
// footer) calls `useWeeklyDigest`, which subscribes to a TanStack
// Query that fires a `setState` on the next microtask. That update
// reaches the footer tree after the synchronous test assertion —
// surfacing as an "An update inside a test was not wrapped in act"
// warning, and on slower CI runners it pushes first-render past the
// default 5 s Jest timeout. The smoke tests below only care about
// the footer's visibility-rule + open/close behaviour, so we stub
// the hook the same way `HubDashboard.test.tsx` does.
jest.mock("./useWeeklyDigest", () => ({
  useWeeklyDigest: () => ({
    digest: null,
    loading: false,
    error: null,
    weekKey: "2026-01-01",
    weekRange: "",
    generate: jest.fn(),
    isCurrentWeek: true,
  }),
}));

import { WeeklyDigestFooter } from "./WeeklyDigestFooter";

const DIGEST_PREFIX = STORAGE_KEYS.WEEKLY_DIGEST_PREFIX;

function writeDigest(weekKey: string, record: unknown) {
  _getMMKVInstance().set(`${DIGEST_PREFIX}${weekKey}`, JSON.stringify(record));
}

function weekKeyFor(d: Date): string {
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(monday.getDate()).padStart(2, "0")}`;
}

function renderFooter(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </ApiClientProvider>,
  );
}

describe("WeeklyDigestFooter", () => {
  beforeEach(() => {
    _getMMKVInstance().clearAll();
  });
  afterEach(() => {
    _getMMKVInstance().clearAll();
  });

  it("renders on Monday even without a digest (ready-to-generate CTA)", () => {
    // 2026-04-20 is a Monday.
    const monday = new Date("2026-04-20T10:00:00");
    const { getByTestId, queryByTestId } = renderFooter(
      <WeeklyDigestFooter now={monday} />,
    );

    expect(getByTestId("weekly-digest-footer")).toBeTruthy();
    // Monday is live by definition so the CTA surfaces as fresh.
    expect(queryByTestId("weekly-digest-footer-fresh-dot")).toBeTruthy();
  });

  it("hides the footer on a quiet mid-week day with no digest", () => {
    // 2026-04-24 is a Friday.
    const friday = new Date("2026-04-24T10:00:00");
    const { queryByTestId } = renderFooter(<WeeklyDigestFooter now={friday} />);

    expect(queryByTestId("weekly-digest-footer")).toBeNull();
  });

  it("shows the fresh-dot + footer on a non-Mon day when the current digest exists", () => {
    const wed = new Date("2026-04-22T10:00:00");
    writeDigest(weekKeyFor(wed), { generatedAt: wed.toISOString() });

    const { getByTestId } = renderFooter(<WeeklyDigestFooter now={wed} />);

    expect(getByTestId("weekly-digest-footer")).toBeTruthy();
    expect(getByTestId("weekly-digest-footer-fresh-dot")).toBeTruthy();
  });

  it("opens the placeholder digest card when the link is pressed", () => {
    const mon = new Date("2026-04-20T10:00:00");
    const { getByTestId, queryByTestId } = renderFooter(
      <WeeklyDigestFooter now={mon} />,
    );

    // Placeholder card starts closed.
    expect(queryByTestId("weekly-digest-card")?.props.visible ?? false).toBe(
      false,
    );

    act(() => {
      fireEvent.press(getByTestId("weekly-digest-footer-link"));
    });

    expect(getByTestId("weekly-digest-card").props.visible).toBe(true);
  });
});
