/** @vitest-environment jsdom */
/**
 * priv-18 (аудит 2026-10-01): гість (GET /me/preferences → 401) мусить мати
 * локальний тумблер аналітики, щоб відкликати згоду (GDPR ст. 7(3)), а не
 * «Увійди в акаунт» і марне «Спробувати ще».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@shared/api", () => ({
  meApi: {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
    clearAiMemory: vi.fn(),
  },
}));
vi.mock("../legal/LegalLinks", () => ({ LegalLinks: () => null }));
vi.mock("../app/HubShellContext", () => ({
  useOptionalHubShell: () => null,
}));

import { meApi } from "@shared/api";
import { ApiError } from "@sergeant/api-client";
import {
  __resetAnalyticsConsentForTests,
  getAnalyticsConsent,
  getAnalyticsDecision,
  getPendingAnalyticsSync,
  setAnalyticsConsent,
} from "../observability/analyticsConsent";
import { PrivacySection } from "./PrivacySection";

const unauthorized = () =>
  new ApiError({
    kind: "http",
    status: 401,
    message: "Unauthorized",
    url: "/api/me/preferences",
  });

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<PrivacySection />, { wrapper });
}

async function openSection() {
  fireEvent.click(
    await screen.findByRole("button", { name: /Дані та приватність/i }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(meApi.getPreferences).mockRejectedValue(unauthorized());
  localStorage.clear();
  __resetAnalyticsConsentForTests();
});

afterEach(() => {
  cleanup();
  __resetAnalyticsConsentForTests();
});

describe("PrivacySection — гість (priv-18)", () => {
  it("показує локальний тумблер аналітики замість «Увійди» і «Спробувати ще»", async () => {
    renderSection();
    await openSection();

    const toggle = await screen.findByRole("switch", {
      name: /Аналітика продукту/i,
    });
    expect(toggle).toBeInTheDocument();
    expect(screen.queryByText(/Увійди в акаунт/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Спробувати ще" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("серверні тумблери памʼяті й здоровʼя сховано з поясненням", async () => {
    renderSection();
    await openSection();

    await screen.findByRole("switch", { name: /Аналітика продукту/i });
    expect(
      screen.queryByRole("switch", { name: /Памʼять для Сержанта/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: /Дані про здоровʼя/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/після входу/i);
  });

  it("тумблер показує поточну згоду гостя, а перемикання її змінює без серверного запису", async () => {
    setAnalyticsConsent(true, { pendingServerSync: true });
    renderSection();
    await openSection();

    const toggle = await screen.findByRole("switch", {
      name: /Аналітика продукту/i,
    });
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(getAnalyticsConsent()).toBe(false);
    expect(getAnalyticsDecision()).toBe("denied");
    // Рішення чекає синку після входу (див. useAnalyticsConsentBoot).
    expect(getPendingAnalyticsSync()).toBe("denied");
    expect(meApi.updatePreferences).not.toHaveBeenCalled();

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(getAnalyticsConsent()).toBe(true);
    expect(getPendingAnalyticsSync()).toBe("granted");
  });

  it("без рішення тумблер вимкнений (fail-closed)", async () => {
    renderSection();
    await openSection();

    const toggle = await screen.findByRole("switch", {
      name: /Аналітика продукту/i,
    });
    expect(toggle).not.toBeChecked();
  });
});
