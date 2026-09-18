/**
 * Render tests for `<AIDigestSection>`.
 *
 * Covers:
 *  - collapsed-by-default header with the "AI Звіт тижня" title;
 *  - expanding reveals the week-range, кнопка «Згенерувати дайджест
 *    зараз», і тумблер понеділка;
 *  - toggling "Автогенерація щопонеділка" persists `"1"` under
 *    `STORAGE_KEYS.WEEKLY_DIGEST_MONDAY_AUTO` (same key + value web
 *    writes, so the CloudSync envelope stays identical);
 *  - the week-range helper follows the web `getWeekRange` contract
 *    (Mon–Sun for the date's ISO week).
 */

import { fireEvent, render } from "@testing-library/react-native";
import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance } from "@/lib/storage";

import { AIDigestSection, getWeekRange } from "./AIDigestSection";

jest.mock("../dashboard/useWeeklyDigest", () => ({
  useWeeklyDigest: () => ({
    generate: jest.fn(),
    loading: false,
    error: null,
  }),
}));

beforeEach(() => {
  _getMMKVInstance().clearAll();
});

describe("AIDigestSection", () => {
  it("renders the collapsed group header", () => {
    const { getByText, queryByText } = render(<AIDigestSection />);
    expect(getByText("AI Звіт тижня")).toBeTruthy();
    expect(queryByText("Поточний тиждень")).toBeNull();
  });

  it("expands to reveal the week-range card, generate CTA, and monday toggle", () => {
    const { getByText, getByTestId } = render(<AIDigestSection />);

    fireEvent.press(getByText("AI Звіт тижня"));

    expect(getByText("Поточний тиждень")).toBeTruthy();
    expect(getByTestId("aidigest-week-range")).toBeTruthy();
    expect(getByTestId("aidigest-generate-now")).toBeTruthy();
    expect(getByText("Автогенерація щопонеділка")).toBeTruthy();
  });

  it("persists the monday-auto toggle as '1' / '0' in the shared slice", () => {
    const { getByText, getByTestId } = render(<AIDigestSection />);
    fireEvent.press(getByText("AI Звіт тижня"));

    fireEvent(getByTestId("aidigest-monday-auto-toggle"), "valueChange", true);

    // `useLocalStorage` with a `string` slot writes strings verbatim
    // (no JSON.stringify), so the raw MMKV value is literally "1"/"0".
    const raw = _getMMKVInstance().getString(
      STORAGE_KEYS.WEEKLY_DIGEST_MONDAY_AUTO,
    );
    expect(raw).toBe("1");

    fireEvent(getByTestId("aidigest-monday-auto-toggle"), "valueChange", false);
    const raw2 = _getMMKVInstance().getString(
      STORAGE_KEYS.WEEKLY_DIGEST_MONDAY_AUTO,
    );
    expect(raw2).toBe("0");
  });
});

describe("getWeekRange", () => {
  it("returns a Mon–Sun range anchored on the ISO week of the input", () => {
    // 2024-04-17 is a Wednesday → week is Mon 15 kvi → Nd 21 kvi.
    const range = getWeekRange(new Date("2024-04-17T12:00:00Z"));
    expect(range).toMatch(/15/);
    expect(range).toMatch(/21/);
  });

  it("handles a Sunday input by anchoring to the Monday that starts the week", () => {
    // 2024-04-21 is a Sunday → Monday is 15 kvi.
    const range = getWeekRange(new Date("2024-04-21T12:00:00Z"));
    expect(range).toMatch(/15/);
    expect(range).toMatch(/21/);
  });
});
