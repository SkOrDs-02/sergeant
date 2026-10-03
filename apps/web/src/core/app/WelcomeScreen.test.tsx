// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { fireEvent, render, cleanup, screen } from "@testing-library/react";
import { messages } from "@shared/i18n/uk";
import { WelcomeScreen } from "./WelcomeScreen";
import {
  __resetAnalyticsConsentForTests,
  getAnalyticsConsent,
  getAnalyticsDecision,
  setAnalyticsConsent,
} from "../observability/analyticsConsent";

// Крок згоди (`OnboardingConsentStep`) пише вибір через `useAnalyticsConsentChoice`,
// який читає сесію; на `/welcome` вона гостьова.
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ status: "unauthenticated", user: null }),
}));
vi.mock("@shared/api", () => ({
  meApi: { updatePreferences: vi.fn().mockResolvedValue({}) },
}));

// Знімаємо значення згоди У МОМЕНТ події: доказ, що воронка стартує після
// рішення (до нього PostHog-транспорт `trackEvent` не отримує подій).
const trackedEvents: Array<{ name: string; consentAtCall: boolean }> = [];
vi.mock("../observability/analytics", async () => {
  const actual = await vi.importActual<
    typeof import("../observability/analytics")
  >("../observability/analytics");
  const consent = await vi.importActual<
    typeof import("../observability/analyticsConsent")
  >("../observability/analyticsConsent");
  return {
    ...actual,
    trackEvent: (name: string) => {
      trackedEvents.push({
        name,
        consentAtCall: consent.getAnalyticsConsent(),
      });
    },
  };
});

const markFirstActionPendingMock = vi.fn();
const markFirstActionStartedAtMock = vi.fn();
const markOnboardingDoneMock = vi.fn();
const saveVibePicksMock = vi.fn();
const markOnboardingCompletedFiredMock = vi.fn();

vi.mock("../onboarding/vibePicks", async () => {
  const actual = await vi.importActual<
    typeof import("../onboarding/vibePicks")
  >("../onboarding/vibePicks");
  return {
    ...actual,
    saveVibePicks: (...args: unknown[]) => saveVibePicksMock(...args),
    markFirstActionPending: (...args: unknown[]) =>
      markFirstActionPendingMock(...args),
    markFirstActionStartedAt: (...args: unknown[]) =>
      markFirstActionStartedAtMock(...args),
  };
});

vi.mock("../onboarding/onboardingGate", async () => {
  const actual = await vi.importActual<
    typeof import("../onboarding/onboardingGate")
  >("../onboarding/onboardingGate");
  return {
    ...actual,
    markOnboardingDone: (...args: unknown[]) => markOnboardingDoneMock(...args),
    markOnboardingCompletedFired: (...args: unknown[]) =>
      markOnboardingCompletedFiredMock(...args),
    isOnboardingCompletedFired: () => false,
  };
});

/**
 * Audit-guard for the 2026-05-08 fix on `/welcome`.
 *
 * Issue: коли користувач у `/welcome` тиснув «Що це за розділи?»,
 * splash-картка з модулями ставала вищою за viewport, а page-wrapper
 * був `min-h-dvh ... overflow-hidden` — і natural body-scroll уже
 * вимкнений у `apps/web/src/styles/base.css`. У результаті картку обрізало і
 * зверху (логотип), і знизу (CTA + «Згорнути»), без можливості
 * прокрутки.
 *
 * Контракт фіксу — структурний, тому пінимо саме структуру:
 *   - page-wrapper має бути scroll-контейнером (`overflow-y-auto`,
 *     `overscroll-contain`), а не `overflow-hidden`;
 *   - `PeekBackdrop` — `fixed inset-0` (живе у viewport, не їде з
 *     scroll-шаром), не `absolute inset-0`;
 *   - внутрішній flex-шар використовує `min-h-full` (відносно
 *     scroll-контейнера), щоб short-content центрувалось як раніше,
 *     а overflow прокручувався у зовнішньому шарі.
 *
 * Регресія легко повертається невинним рефактором тих самих утиліт,
 * тож фіксуємо її unit-тестом, а не лише коментарем.
 */
describe("WelcomeScreen — /welcome scroll-layer audit-guard", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("page-wrapper is the scroll container (overflow-y-auto + overscroll-contain), not overflow-hidden", () => {
    const { container } = render(
      <WelcomeScreen onDone={() => {}} onOpenAuth={() => {}} />,
    );
    const pageWrapper = container.firstElementChild as HTMLElement;
    expect(pageWrapper).not.toBeNull();
    // Scroll layer.
    expect(pageWrapper.className).toMatch(/\boverflow-y-auto\b/);
    // iOS body-bounce / overscroll-chain guard.
    expect(pageWrapper.className).toMatch(/\boverscroll-contain\b/);
    // The pre-fix class must NOT resurrect — `overflow-hidden` on the
    // page wrapper is the exact regression that caused the modules to
    // be cropped without any scroll affordance.
    expect(pageWrapper.className).not.toMatch(/\boverflow-hidden\b/);
    // The wrapper must own viewport height so its `overflow-y-auto`
    // has a finite scroll viewport. `h-app-dvh` (fixed height, not
    // `min-h-*`) is the contract — a min-height would let the wrapper
    // grow with content and defeat the inner scroll.
    expect(pageWrapper.className).toMatch(/\bh-app-dvh\b/);
    expect(pageWrapper.className).not.toMatch(/\bmin-h-dvh\b/);
    // A transform animation on a full-height shell expands the document's
    // scrollable overflow on iOS. The page owns inner scroll, so the shell
    // itself must stay geometrically fixed while the CTA is touched.
    expect(pageWrapper.className).not.toMatch(/\bpage-enter\b/);
  });

  it("PeekBackdrop is fixed inset-0 (decoupled from the scroll layer)", () => {
    const { container } = render(
      <WelcomeScreen onDone={() => {}} onOpenAuth={() => {}} />,
    );
    // The backdrop is the page-wrapper's first child with
    // `aria-hidden="true"` (decorative shapes + bento blur).
    const pageWrapper = container.firstElementChild as HTMLElement;
    const backdrop = pageWrapper.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    expect(backdrop?.className).toMatch(/\bfixed\b/);
    expect(backdrop?.className).toMatch(/\binset-0\b/);
    // Pre-fix it was `absolute inset-0` — pin against resurrection so
    // floating shapes don't re-couple to the scroll layer and drag
    // along when modules expand.
    expect(backdrop?.className).not.toMatch(/\babsolute\b/);
  });

  it("inner flex layer uses min-h-full so short content centres but tall content scrolls", () => {
    const { container } = render(
      <WelcomeScreen onDone={() => {}} onOpenAuth={() => {}} />,
    );
    const pageWrapper = container.firstElementChild as HTMLElement;
    // Inner flex layer is the page-wrapper's second child (sibling
    // after the fixed backdrop). Selecting via class avoids depending
    // on PeekBackdrop's internal DOM.
    const innerLayer = pageWrapper.querySelector(
      ":scope > .relative.min-h-full",
    );
    expect(innerLayer).not.toBeNull();
    expect((innerLayer as HTMLElement).className).toMatch(/\bflex\b/);
    expect((innerLayer as HTMLElement).className).toMatch(/\bitems-end\b/);
    expect((innerLayer as HTMLElement).className).toMatch(
      /\bsm:items-center\b/,
    );
  });
});

describe("WelcomeScreen — handlePicksComplete side-effects", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    markFirstActionPendingMock.mockClear();
    markFirstActionStartedAtMock.mockClear();
    markOnboardingDoneMock.mockClear();
    saveVibePicksMock.mockClear();
    markOnboardingCompletedFiredMock.mockClear();
    trackedEvents.length = 0;
    __resetAnalyticsConsentForTests();
  });

  it("превʼю дашборда не показує жодного вигаданого числа", () => {
    // Знахідка ради скептиків § G: картки малювали `−320 ₴`, `5 трен.`,
    // `7 днів`, `420 ккал`, а підпис «Це приклад» мав `hidden sm:flex` —
    // тобто на телефоні, основній платформі, новачок бачив чужі числа
    // без жодної ознаки, що вони несправжні.
    const { container } = render(
      <WelcomeScreen onDone={() => {}} onOpenAuth={() => {}} />,
    );

    const backdrop = container.querySelector('[role="presentation"]');
    expect(backdrop).not.toBeNull();
    const text = backdrop!.textContent ?? "";

    // Валюта, калорії, тренування, дні — усе, що читається як показник.
    expect(text).not.toMatch(/\d+\s*(₴|ккал|трен|дн)/i);
    // Узагалі жодної цифри: форму дашборда тримають скелетон-риски.
    expect(text).not.toMatch(/\d/);
    // А отже й дисклеймер більше не потрібен — нічого не вдає за дані.
    expect(text).not.toContain("Це приклад");
  });

  it("seeds the first-action timer and pending gate on submit", () => {
    // Рішення про аналітику вже є — крок згоди пропускається, і «Почати»
    // завершує онбординг одразу (так було до появи кроку).
    setAnalyticsConsent(false);
    const onDone = vi.fn();
    render(<WelcomeScreen onDone={onDone} onOpenAuth={() => {}} />);

    const cta = screen.getByRole("button", { name: "Почати" });
    fireEvent.click(cta);

    expect(saveVibePicksMock).toHaveBeenCalledTimes(1);
    expect(markOnboardingDoneMock).toHaveBeenCalledTimes(1);
    expect(markOnboardingCompletedFiredMock).toHaveBeenCalledTimes(1);
    expect(markFirstActionStartedAtMock).toHaveBeenCalledTimes(1);
    expect(markFirstActionPendingMock).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(null, {
      intent: "preset_picker",
      picks: expect.any(Array),
    });
  });

  // PR-H7 (design-audit 2026-09-13): this button used to call
  // `markOnboardingDone()` before even navigating — a mistaken tap
  // followed by "Поки що пропустити" on `/sign-in` then closed the FTUX
  // gate forever with no account ever created. The gate now closes in
  // exactly one place, once a session is confirmed (`StandaloneRoutes.tsx`
  // `SIGN_IN_PATH` entry) — this screen only navigates.
  it("does NOT mark onboarding done on tap — only navigates to sign-in", () => {
    const onOpenAuth = vi.fn();
    render(<WelcomeScreen onDone={() => {}} onOpenAuth={onOpenAuth} />);

    fireEvent.click(
      screen.getByRole("button", { name: "У мене вже є акаунт" }),
    );

    expect(onOpenAuth).toHaveBeenCalledTimes(1);
    expect(markOnboardingDoneMock).not.toHaveBeenCalled();
  });
});

describe("WelcomeScreen — крок згоди на аналітику після вибору модулів", () => {
  const consent = messages.privacy.analyticsConsent;

  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    markFirstActionPendingMock.mockClear();
    markFirstActionStartedAtMock.mockClear();
    markOnboardingDoneMock.mockClear();
    saveVibePicksMock.mockClear();
    markOnboardingCompletedFiredMock.mockClear();
    trackedEvents.length = 0;
    __resetAnalyticsConsentForTests();
  });

  it("«Почати» без рішення веде на крок згоди й нічого не завершує та не шле", () => {
    const onDone = vi.fn();
    render(<WelcomeScreen onDone={onDone} onOpenAuth={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Почати" }));

    expect(screen.getByTestId("onboarding-consent-step")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: consent.title }),
    ).toBeInTheDocument();
    // Екран модулів замінено кроком; сам онбординг ще не завершено.
    expect(screen.queryByRole("button", { name: "Почати" })).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    expect(saveVibePicksMock).not.toHaveBeenCalled();
    expect(markOnboardingDoneMock).not.toHaveBeenCalled();
    expect(trackedEvents).toEqual([]);
    expect(getAnalyticsDecision()).toBeNull();
  });

  it("«Дозволити» завершує онбординг з обраними модулями, а воронка стартує вже зі згодою", () => {
    const onDone = vi.fn();
    render(<WelcomeScreen onDone={onDone} onOpenAuth={() => {}} />);

    // Знімаємо один модуль: вибір має пережити крок згоди.
    fireEvent.click(screen.getByRole("button", { name: "Рутина" }));
    fireEvent.click(screen.getByRole("button", { name: "Почати" }));
    fireEvent.click(screen.getByRole("button", { name: consent.accept }));

    expect(getAnalyticsDecision()).toBe("granted");
    expect(getAnalyticsConsent()).toBe(true);
    expect(saveVibePicksMock).toHaveBeenCalledWith([
      "finyk",
      "fizruk",
      "nutrition",
    ]);
    expect(markOnboardingDoneMock).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(null, {
      intent: "preset_picker",
      picks: ["finyk", "fizruk", "nutrition"],
    });
    // Обидві події воронки — після рішення, тож PostHog їх не відкине.
    expect(trackedEvents.map((e) => e.name)).toEqual([
      "onboarding_vibe_picked",
      "onboarding_completed",
    ]);
    expect(trackedEvents.every((e) => e.consentAtCall)).toBe(true);
  });

  it("«Ні, дякую» теж завершує онбординг: відмова не блокує вхід, лише гасить аналітику", () => {
    const onDone = vi.fn();
    render(<WelcomeScreen onDone={onDone} onOpenAuth={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Почати" }));
    fireEvent.click(screen.getByRole("button", { name: consent.decline }));

    expect(getAnalyticsDecision()).toBe("denied");
    expect(getAnalyticsConsent()).toBe(false);
    expect(markOnboardingDoneMock).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(trackedEvents.every((e) => !e.consentAtCall)).toBe(true);
  });

  it("не питає вдруге, якщо рішення на пристрої вже є", () => {
    setAnalyticsConsent(true);
    const onDone = vi.fn();
    render(<WelcomeScreen onDone={onDone} onOpenAuth={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Почати" }));

    expect(screen.queryByTestId("onboarding-consent-step")).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("«У мене вже є акаунт» не вимагає згоди: веде одразу на вхід", () => {
    const onOpenAuth = vi.fn();
    render(<WelcomeScreen onDone={() => {}} onOpenAuth={onOpenAuth} />);

    fireEvent.click(
      screen.getByRole("button", { name: "У мене вже є акаунт" }),
    );

    expect(onOpenAuth).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("onboarding-consent-step")).toBeNull();
  });
});
