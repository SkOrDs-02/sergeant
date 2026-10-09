// @vitest-environment jsdom
import { vi } from "vitest";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ status: "unauthenticated", user: null }),
}));
vi.mock("@shared/api", () => ({ meApi: { updatePreferences: vi.fn() } }));

import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AddActionBar } from "@shared/components/ui/AddActionBar";
import { CONSENT_BANNER_INSET_VAR } from "@shared/hooks/useBottomInsetVar";
import AnalyticsConsentBanner from "./AnalyticsConsentBanner";

describe("AnalyticsConsentBanner + AddActionBar", () => {
  it("банер публікує інсет, а кнопка дії піднімається над ним", () => {
    const { container, unmount } = render(
      <MemoryRouter>
        <AddActionBar label="Додати" onClick={() => {}} />
        <AnalyticsConsentBanner />
      </MemoryRouter>,
    );

    expect(
      document.documentElement.style.getPropertyValue(CONSENT_BANNER_INSET_VAR),
    ).not.toBe("");
    const fab = container.querySelector(
      "[data-testid='add-action-bar']",
    ) as HTMLElement;
    expect(fab.className).toContain(`var(${CONSENT_BANNER_INSET_VAR}`);

    unmount();
    expect(
      document.documentElement.style.getPropertyValue(CONSENT_BANNER_INSET_VAR),
    ).toBe("");
  });
});
