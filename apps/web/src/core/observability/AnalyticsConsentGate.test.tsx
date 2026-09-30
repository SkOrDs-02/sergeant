// @vitest-environment jsdom
import { vi } from "vitest";

const { mockUseAuth, mockUpdatePreferences } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUpdatePreferences: vi.fn(),
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: mockUseAuth }));
vi.mock("@shared/api", () => ({
  meApi: { updatePreferences: mockUpdatePreferences },
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { AnalyticsConsentGate } from "./AnalyticsConsentGate";
import {
  __resetAnalyticsConsentForTests,
  getAnalyticsConsent,
  getAnalyticsDecision,
  hydrateAnalyticsConsent,
} from "./analyticsConsent";

const BANNER = "analytics-consent-banner";
// Банер ліниво імпортується; холодна трансформація модуля може бути повільною.
const LAZY_WAIT = { timeout: 15_000 };

function renderGate() {
  return render(
    <MemoryRouter>
      <AnalyticsConsentGate />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUseAuth
    .mockReset()
    .mockReturnValue({ status: "unauthenticated", user: null });
  mockUpdatePreferences.mockReset().mockResolvedValue({});
  localStorage.clear();
  __resetAnalyticsConsentForTests();
});

describe("AnalyticsConsentGate", () => {
  it("показує банер, доки рішення немає", async () => {
    renderGate();
    expect(
      await screen.findByTestId(BANNER, {}, LAZY_WAIT),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Дозволити" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ні, дякую" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Про приватність" }),
    ).toBeInTheDocument();
  });

  it("«Дозволити» вмикає згоду, знімає банер і не повертає його", async () => {
    const user = userEvent.setup();
    const { unmount } = renderGate();
    await user.click(
      await screen.findByRole("button", { name: "Дозволити" }, LAZY_WAIT),
    );

    expect(getAnalyticsConsent()).toBe(true);
    expect(getAnalyticsDecision()).toBe("granted");
    await waitFor(() => expect(screen.queryByTestId(BANNER)).toBeNull());
    // Гість: на сервер нічого не шлемо.
    expect(mockUpdatePreferences).not.toHaveBeenCalled();

    unmount();
    renderGate();
    expect(screen.queryByTestId(BANNER)).toBeNull();
  });

  it("«Ні, дякую» лишає згоду вимкненою, знімає банер і не повертає його", async () => {
    const user = userEvent.setup();
    const { unmount } = renderGate();
    await user.click(
      await screen.findByRole("button", { name: "Ні, дякую" }, LAZY_WAIT),
    );

    expect(getAnalyticsConsent()).toBe(false);
    expect(getAnalyticsDecision()).toBe("denied");
    await waitFor(() => expect(screen.queryByTestId(BANNER)).toBeNull());

    unmount();
    renderGate();
    expect(screen.queryByTestId(BANNER)).toBeNull();
  });

  it("залогіненому дублює вибір на сервер (те саме сховище, що й тумблер)", async () => {
    mockUseAuth.mockReturnValue({
      status: "authenticated",
      user: { id: "u1" },
    });
    hydrateAnalyticsConsent(false);
    const user = userEvent.setup();
    renderGate();
    await user.click(
      await screen.findByRole("button", { name: "Дозволити" }, LAZY_WAIT),
    );

    expect(mockUpdatePreferences).toHaveBeenCalledWith({ analytics: true });
  });

  it("залогіненому не блимає, доки серверна гідрація не завершилась", () => {
    mockUseAuth.mockReturnValue({
      status: "authenticated",
      user: { id: "u1" },
    });
    renderGate();
    expect(screen.queryByTestId(BANNER)).toBeNull();
  });

  it("не показує банер тому, хто вже погодився на іншому пристрої", () => {
    mockUseAuth.mockReturnValue({
      status: "authenticated",
      user: { id: "u1" },
    });
    hydrateAnalyticsConsent(true);
    renderGate();
    expect(screen.queryByTestId(BANNER)).toBeNull();
  });
});
