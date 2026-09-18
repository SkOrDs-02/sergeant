// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ReEngagementCard } from "./ReEngagementCard";
import { HubBannerBudgetProvider, useHubBannerSlot } from "../hub/bannerBudget";

vi.mock("../observability/analytics", async () => {
  const actual = await vi.importActual<
    typeof import("../observability/analytics")
  >("../observability/analytics");
  return {
    ...actual,
    trackEvent: vi.fn(),
  };
});

describe("ReEngagementCard — voice consistency (S6.2 audit-guard)", () => {
  // The repo's vitest setup does not auto-cleanup RTL renders.
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
  });

  it("uses neutral status copy «Тебе не було N днів» — not active «Ти був відсутній»", () => {
    render(
      <ReEngagementCard
        daysInactive={3}
        onContinue={() => {}}
        onDismiss={() => {}}
      />,
    );
    // Status line is neutral, not blame-y.
    expect(screen.getByText(/Тебе не було\s+3\s+дні\./)).toBeTruthy();
    // Audit-guard: the «Ти був відсутній» phrasing must never come back.
    // (Active-voice on a passive event reads as a soft accusation.)
    expect(document.body.textContent ?? "").not.toMatch(/Ти був відсутн/i);
  });

  it("keeps the CTA imperative («Продовжити») while status stays neutral", () => {
    render(
      <ReEngagementCard
        daysInactive={1}
        onContinue={() => {}}
        onDismiss={() => {}}
      />,
    );
    // CTA — imperative (action user takes).
    expect(screen.getByRole("button", { name: /Продовжити/ })).toBeTruthy();
    // Status — neutral (state user is in).
    expect(screen.getByText(/Тебе не було\s+1\s+день\./)).toBeTruthy();
  });

  it("pluralises «день / дні / днів» correctly with the new phrasing", () => {
    const cases: Array<[number, RegExp]> = [
      [1, /Тебе не було\s+1\s+день\./],
      [2, /Тебе не було\s+2\s+дні\./],
      [4, /Тебе не було\s+4\s+дні\./],
      [5, /Тебе не було\s+5\s+днів\./],
      [11, /Тебе не було\s+11\s+днів\./],
    ];
    for (const [days, pattern] of cases) {
      cleanup();
      render(
        <ReEngagementCard
          daysInactive={days}
          onContinue={() => {}}
          onDismiss={() => {}}
        />,
      );
      expect(screen.getByText(pattern), `daysInactive=${days}`).toBeTruthy();
    }
  });
});

describe("ReEngagementCard — hero не порожній (PR-H1 audit-guard)", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
  });

  // Стенд-іни для двох банерів, чиї реальні пріоритети (0 і 3) стоять ВИЩЕ
  // за колишній пріоритет `reengagement` (5) при бюджеті 2 — саме так до
  // фіксу `ReEngagementCard` рендерила `null`, і hero-смуга хаба лишалась
  // порожньою для анонімного юзера з увімкненим блокуванням застосунку, який
  // повернувся після паузи. Використовуємо `useHubBannerSlot` напряму, а не
  // самі `LocalOnlyDataBanner`/`PrivacyLockBanner` — вони живуть поза
  // дозволеним для цієї задачі набором файлів, а тут важливий саме факт
  // «обидва слоти бюджету зайняті», не їхня внутрішня реалізація.
  function LocalOnlyStandIn() {
    const visible = useHubBannerSlot("localOnlyData");
    return visible ? <div>local-only-banner</div> : null;
  }
  function PrivacyLockStandIn() {
    const visible = useHubBannerSlot("privacyLock");
    return visible ? <div>privacy-lock-banner</div> : null;
  }

  it("рендериться навіть коли бюджет банерів повністю зайнятий вищими за пріоритетом банерами", () => {
    render(
      <HubBannerBudgetProvider>
        <LocalOnlyStandIn />
        <PrivacyLockStandIn />
        <ReEngagementCard
          daysInactive={5}
          onContinue={() => {}}
          onDismiss={() => {}}
        />
      </HubBannerBudgetProvider>,
    );

    // Обидва слоти бюджету (max=2) зайняті — точно сценарій анонім +
    // privacyLock + localOnlyData з аудиту.
    expect(screen.getByText("local-only-banner")).toBeInTheDocument();
    expect(screen.getByText("privacy-lock-banner")).toBeInTheDocument();

    // ...і все одно hero не порожній: заголовок і CTA картки на екрані.
    expect(screen.getByText("Давно не бачились!")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Продовжити/ }),
    ).toBeInTheDocument();
  });
});
