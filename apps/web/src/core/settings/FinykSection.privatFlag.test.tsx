// @vitest-environment jsdom
/**
 * `PRIVAT_ENABLED` used to be a hardcoded `false` constant hiding the
 * finished PrivatBank section. It now reads `VITE_PRIVAT_ENABLED` (default
 * off) — same env-gate pattern as other web feature flags
 * (`VITE_POSTHOG_KEY`, `VITE_TARGET`).
 *
 * `PRIVAT_ENABLED` is computed once at module-eval time, so each case
 * `vi.stubEnv`s BEFORE a fresh `vi.resetModules()` + dynamic `import()` of
 * `FinykSection` rather than toggling the env after the module already
 * loaded.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const { privatBankMock } = vi.hoisted(() => ({
  privatBankMock: vi.fn((props: { enabled: boolean }) =>
    props.enabled ? <div data-testid="privat-section" /> : null,
  ),
}));

vi.mock("./FinykPrivatBankSection", () => ({
  FinykPrivatBankSection: privatBankMock,
}));
vi.mock("./FinykWebhookServiceSection", () => ({
  FinykWebhookServiceSection: () => null,
}));
vi.mock("@finyk/hooks/useStorage", () => ({
  useStorage: () => ({
    customCategories: [],
    addCustomCategory: vi.fn(),
    removeCustomCategory: vi.fn(),
  }),
}));

function renderWithProviders(Component: React.ComponentType) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Component />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  privatBankMock.mockClear();
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("FinykSection — PRIVAT_ENABLED env gate", () => {
  it("defaults to disabled when VITE_PRIVAT_ENABLED is unset", async () => {
    vi.unstubAllEnvs();
    const { FinykSection } = await import("./FinykSection");
    renderWithProviders(FinykSection);

    expect(privatBankMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
      expect.anything(),
    );
  });

  it("stays disabled for any value other than the literal string 'true'", async () => {
    vi.stubEnv("VITE_PRIVAT_ENABLED", "1");
    const { FinykSection } = await import("./FinykSection");
    renderWithProviders(FinykSection);

    expect(privatBankMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
      expect.anything(),
    );
  });

  it("enables the PrivatBank section when VITE_PRIVAT_ENABLED='true'", async () => {
    vi.stubEnv("VITE_PRIVAT_ENABLED", "true");
    const { FinykSection } = await import("./FinykSection");
    renderWithProviders(FinykSection);

    expect(privatBankMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
      expect.anything(),
    );
  });
});
