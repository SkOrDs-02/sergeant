// @vitest-environment jsdom
import { vi } from "vitest";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ status: "unauthenticated", user: null }),
}));
vi.mock("@shared/api", () => ({ meApi: { updatePreferences: vi.fn() } }));

import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { CornerAction } from "@shared/components/ui/CornerAction";
import { CONSENT_BANNER_INSET_VAR } from "@shared/hooks/useBottomInsetVar";
import AnalyticsConsentBanner from "./AnalyticsConsentBanner";

describe("AnalyticsConsentBanner + CornerAction", () => {
  it("банер публікує інсет, а кнопка дії піднімається над ним", () => {
    const { container, unmount } = render(
      <MemoryRouter>
        <CornerAction label="Додати" plus onClick={() => {}} />
        <AnalyticsConsentBanner />
      </MemoryRouter>,
    );

    expect(
      document.documentElement.style.getPropertyValue(CONSENT_BANNER_INSET_VAR),
    ).not.toBe("");
    const fab = container.querySelector(
      "[data-testid='corner-action']",
    ) as HTMLElement;
    expect(fab.className).toContain(`var(${CONSENT_BANNER_INSET_VAR}`);

    unmount();
    expect(
      document.documentElement.style.getPropertyValue(CONSENT_BANNER_INSET_VAR),
    ).toBe("");
  });
});
