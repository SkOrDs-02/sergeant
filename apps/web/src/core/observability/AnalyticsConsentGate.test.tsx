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
import { Link, MemoryRouter, useNavigate } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  LEGAL_COOKIES_PATH,
  LEGAL_OFFER_PATH,
  LEGAL_PRIVACY_PATH,
  LEGAL_TERMS_PATH,
} from "../app/appPaths";
import { AnalyticsConsentGate } from "./AnalyticsConsentGate";
import {
  __resetAnalyticsConsentForTests,
  getAnalyticsConsent,
  getAnalyticsDecision,
  hydrateAnalyticsConsent,
  setAnalyticsConsent,
} from "./analyticsConsent";

const BANNER = "analytics-consent-banner";
// Банер ліниво імпортується; холодна трансформація модуля може бути повільною.
const LAZY_WAIT = { timeout: 15_000 };

function renderGate(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AnalyticsConsentGate />
    </MemoryRouter>,
  );
}

// Імітує вихід з онбордингу: маршрут міняється, а Gate лишається змонтованим,
// як у `RootLayout`.
function GoTo({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      go-to-{to}
    </button>
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

  it("обидві відповіді однакового вигляду: відмова не слабша за згоду", async () => {
    renderGate();
    const accept = await screen.findByRole(
      "button",
      { name: "Дозволити" },
      LAZY_WAIT,
    );
    const decline = screen.getByRole("button", { name: "Ні, дякую" });
    expect(decline.className).toBe(accept.className);
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

  describe("онбординг: згоду питає його крок, а не банер (2026-10-01)", () => {
    // Негативні перевірки («банера немає») мають сенс лише тоді, коли банер
    // зʼявився б одразу: прогріваємо ліниво імпортований модуль наперед.
    beforeAll(async () => {
      await import("./AnalyticsConsentBanner");
    });

    it.each(["/welcome", "/welcome/", "/onboarding", "/onboarding/anything"])(
      "не показує банер на %s",
      async (path) => {
        renderGate(path);
        // Банер ліниво імпортується: дайте шансу зʼявитись, перш ніж
        // стверджувати, що його немає.
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(screen.queryByTestId(BANNER)).toBeNull();
      },
    );

    it("не плутає схожі шляхи з онбордингом: банер лишається на /welcomes і /onboarding-x", async () => {
      const { unmount } = renderGate("/welcomes");
      expect(
        await screen.findByTestId(BANNER, {}, LAZY_WAIT),
      ).toBeInTheDocument();
      unmount();

      renderGate("/onboarding-x");
      expect(
        await screen.findByTestId(BANNER, {}, LAZY_WAIT),
      ).toBeInTheDocument();
    });

    it("запасний шлях: після онбордингу без рішення банер усе ж зʼявляється на хабі", async () => {
      renderGate("/finyk");
      expect(
        await screen.findByTestId(BANNER, {}, LAZY_WAIT),
      ).toBeInTheDocument();
    });

    it("людина вийшла з онбордингу, так і не відповівши: банер зʼявляється вже на хабі", async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={["/welcome"]}>
          <GoTo to="/" />
          <AnalyticsConsentGate />
        </MemoryRouter>,
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByTestId(BANNER)).toBeNull();

      await user.click(screen.getByRole("button", { name: "go-to-/" }));
      expect(
        await screen.findByTestId(BANNER, {}, LAZY_WAIT),
      ).toBeInTheDocument();
    });

    it.each([
      ["granted", true],
      ["denied", false],
    ] as const)(
      "рішення, прийняте кроком онбордингу (%s), банер на хабі не повертає",
      (decision, value) => {
        // Те, що робить `OnboardingConsentStep` через `useAnalyticsConsentChoice`.
        setAnalyticsConsent(value);
        expect(getAnalyticsDecision()).toBe(decision);

        renderGate("/");
        expect(screen.queryByTestId(BANNER)).toBeNull();
      },
    );
  });

  describe("юридичні сторінки", () => {
    it.each([
      LEGAL_PRIVACY_PATH,
      LEGAL_TERMS_PATH,
      LEGAL_COOKIES_PATH,
      LEGAL_OFFER_PATH,
    ])("не показує банер на %s, хоча рішення немає", async (path) => {
      renderGate(path);
      // Банер ліниво імпортується; даємо Suspense шанс відрендерити його,
      // якщо гейт помилково його монтує.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByTestId(BANNER)).toBeNull();
      expect(getAnalyticsDecision()).toBeNull();
    });

    it("показує банер після виходу з юридичної сторінки, поки рішення немає", async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={[LEGAL_PRIVACY_PATH]}>
          <AnalyticsConsentGate />
          <Link to="/">на головну</Link>
        </MemoryRouter>,
      );
      expect(screen.queryByTestId(BANNER)).toBeNull();

      await user.click(screen.getByRole("link", { name: "на головну" }));
      expect(
        await screen.findByTestId(BANNER, {}, LAZY_WAIT),
      ).toBeInTheDocument();
    });
  });
});
