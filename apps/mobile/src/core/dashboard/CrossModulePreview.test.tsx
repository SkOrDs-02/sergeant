/**
 * Mobile parity for `apps/web/src/core/hub/CrossModulePreview.test.tsx`
 * (S6.4). Locks the audit-guard contract:
 *   - copy is keyed by `sourceModule` (no fallback to a generic copy)
 *   - title / body / CTA come from the shared lib (single source of truth)
 *   - dismiss-X persists `markCrossModulePreviewSeen` and triggers `onClose`
 *   - CTA persists `markCrossModulePreviewSeen` and triggers `onClose`
 *
 * We do NOT re-test analytics payload shape here — that contract is
 * enforced by the shared `analyticsEvents.ts` test stack. The mobile
 * component just forwards the events; if the payload drifts we'll
 * catch it in the shared / web suites.
 */

import { fireEvent, render } from "@testing-library/react-native";

import { CrossModulePreview } from "./CrossModulePreview";
import { _getMMKVInstance } from "@/lib/storage";

function resetStore() {
  _getMMKVInstance().clearAll();
}

const CROSS_MODULE_PREVIEW_SEEN_KEY = "hub_cross_module_preview_seen_v1";

describe("CrossModulePreview (mobile, S6.4 parity)", () => {
  beforeEach(() => {
    resetStore();
  });

  it("renders the finyk → nutrition copy when sourceModule = finyk", () => {
    const { getByText, getByTestId } = render(
      <CrossModulePreview sourceModule="finyk" onClose={jest.fn()} />,
    );

    expect(getByText("Що Sergeant покаже далі")).toBeTruthy();
    expect(getByText(/гроші × їжа/)).toBeTruthy();
    expect(getByTestId("cross-module-preview-cta")).toBeTruthy();
  });

  it("renders the nutrition → fizruk copy when sourceModule = nutrition", () => {
    const { getByText } = render(
      <CrossModulePreview sourceModule="nutrition" onClose={jest.fn()} />,
    );

    expect(getByText(/їжа × тренування/)).toBeTruthy();
  });

  it("CTA persists the seen-flag and calls onClose", () => {
    const onClose = jest.fn();
    const mmkv = _getMMKVInstance();
    const { getByTestId } = render(
      <CrossModulePreview sourceModule="routine" onClose={onClose} />,
    );

    fireEvent.press(getByTestId("cross-module-preview-cta"));

    expect(mmkv.getString(CROSS_MODULE_PREVIEW_SEEN_KEY)).toBe("1");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("dismiss-X persists the seen-flag and calls onClose", () => {
    const onClose = jest.fn();
    const mmkv = _getMMKVInstance();
    const { getByTestId } = render(
      <CrossModulePreview sourceModule="fizruk" onClose={onClose} />,
    );

    fireEvent.press(getByTestId("cross-module-preview-dismiss"));

    expect(mmkv.getString(CROSS_MODULE_PREVIEW_SEEN_KEY)).toBe("1");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("preserves the single-primary affordance: exactly one CTA + one dismiss", () => {
    const { getAllByRole } = render(
      <CrossModulePreview sourceModule="finyk" onClose={jest.fn()} />,
    );

    // CTA + dismiss-X are both Pressable buttons; nothing else inside the
    // card should expose role=button. This locks the same single-primary
    // affordance contract the web suite enforces.
    const buttons = getAllByRole("button");
    expect(buttons).toHaveLength(2);
  });
});
