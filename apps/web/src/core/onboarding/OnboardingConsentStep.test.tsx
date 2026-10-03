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

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { messages } from "@shared/i18n/uk";
import { OnboardingConsentStep } from "./OnboardingConsentStep";
import {
  __resetAnalyticsConsentForTests,
  getAnalyticsConsent,
  getAnalyticsDecision,
} from "../observability/analyticsConsent";

const copy = messages.privacy.analyticsConsent;
// Політика ліниво імпортується; холодна трансформація модуля може бути повільною.
const LAZY_WAIT = { timeout: 15_000 };

beforeEach(() => {
  mockUseAuth
    .mockReset()
    .mockReturnValue({ status: "unauthenticated", user: null });
  mockUpdatePreferences.mockReset().mockResolvedValue({});
  localStorage.clear();
  __resetAnalyticsConsentForTests();
});

afterEach(cleanup);

describe("OnboardingConsentStep", () => {
  it("питає про аналітику тим самим текстом, що й запасний банер", () => {
    render(<OnboardingConsentStep onDecided={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: copy.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(copy.body)).toBeInTheDocument();
    expect(screen.getByText(copy.changeLater)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: copy.privacyLink }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: copy.accept }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: copy.decline }),
    ).toBeInTheDocument();
  });

  it("обидві відповіді однакові за виглядом: жодної виділеної (без темних патернів)", () => {
    render(<OnboardingConsentStep onDecided={vi.fn()} />);

    const accept = screen.getByRole("button", { name: copy.accept });
    const decline = screen.getByRole("button", { name: copy.decline });
    expect(accept.className).toBe(decline.className);
  });

  it("переносить фокус на питання, щоб скрінрідер його оголосив", () => {
    render(<OnboardingConsentStep onDecided={vi.fn()} />);

    expect(screen.getByRole("heading", { name: copy.title })).toHaveFocus();
  });

  it("«Дозволити» записує згоду тим самим сховищем і повідомляє хост після запису", async () => {
    const user = userEvent.setup();
    let consentWhenHostNotified: boolean | null = null;
    const onDecided = vi.fn(() => {
      consentWhenHostNotified = getAnalyticsConsent();
    });
    render(<OnboardingConsentStep onDecided={onDecided} />);

    await user.click(screen.getByRole("button", { name: copy.accept }));

    expect(getAnalyticsDecision()).toBe("granted");
    expect(getAnalyticsConsent()).toBe(true);
    expect(onDecided).toHaveBeenCalledTimes(1);
    expect(onDecided).toHaveBeenCalledWith(true);
    // Подія, яку хост шле у відповідь, уже бачить нове значення згоди.
    expect(consentWhenHostNotified).toBe(true);
    // Гість: на сервер нічого не шлемо.
    expect(mockUpdatePreferences).not.toHaveBeenCalled();
  });

  it("«Ні, дякую» записує відмову і теж пускає онбординг далі", async () => {
    const user = userEvent.setup();
    const onDecided = vi.fn();
    render(<OnboardingConsentStep onDecided={onDecided} />);

    await user.click(screen.getByRole("button", { name: copy.decline }));

    expect(getAnalyticsDecision()).toBe("denied");
    expect(getAnalyticsConsent()).toBe(false);
    expect(onDecided).toHaveBeenCalledWith(false);
  });

  it("другий тап по вже даній відповіді нічого не дублює", async () => {
    const user = userEvent.setup();
    const onDecided = vi.fn();
    render(<OnboardingConsentStep onDecided={onDecided} />);

    await user.click(screen.getByRole("button", { name: copy.accept }));
    await user.click(screen.getByRole("button", { name: copy.decline }));

    expect(onDecided).toHaveBeenCalledTimes(1);
    expect(getAnalyticsDecision()).toBe("granted");
  });

  it("залогіненому дублює вибір на сервер (той самий API, що й банер)", async () => {
    mockUseAuth.mockReturnValue({
      status: "authenticated",
      user: { id: "u1" },
    });
    const user = userEvent.setup();
    render(<OnboardingConsentStep onDecided={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: copy.decline }));

    expect(mockUpdatePreferences).toHaveBeenCalledWith({ analytics: false });
  });

  it("«Про приватність» відкриває політику в аркуші, а закриття повертає на крок без вибору", async () => {
    const user = userEvent.setup();
    const onDecided = vi.fn();
    render(<OnboardingConsentStep onDecided={onDecided} />);

    await user.click(screen.getByRole("button", { name: copy.privacyLink }));

    const dialog = await screen.findByRole(
      "dialog",
      { name: "Політика приватності" },
      LAZY_WAIT,
    );
    expect(dialog).toBeInTheDocument();
    // Відкриття політики — не відповідь: нічого не записано.
    expect(getAnalyticsDecision()).toBeNull();
    expect(onDecided).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Закрити" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Крок на місці: питання й обидві відповіді доступні, вибору немає.
    expect(
      screen.getByRole("heading", { name: copy.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.accept })).toBeEnabled();
    expect(screen.getByRole("button", { name: copy.decline })).toBeEnabled();
    expect(getAnalyticsDecision()).toBeNull();
  });
});
