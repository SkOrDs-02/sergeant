// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    monoWebhookApi: {
      connect: vi.fn(),
      syncState: vi.fn(),
      accounts: vi.fn(),
      transactions: vi.fn(),
      disconnect: vi.fn(),
      backfill: vi.fn(),
    },
  };
});

vi.mock("../../../core/observability/analytics", () => ({
  trackEvent: vi.fn(),
  ANALYTICS_EVENTS: {
    MONO_TOKEN_MIGRATED: "mono_token_migrated",
  },
}));

vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

import { monoWebhookApi } from "@shared/api";
import { trackEvent } from "../../../core/observability/analytics";
import { useMonoTokenMigration } from "./useMonoTokenMigration";

const mockedConnect = monoWebhookApi.connect as unknown as ReturnType<
  typeof vi.fn
>;
const mockedTrackEvent = trackEvent as unknown as ReturnType<typeof vi.fn>;

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe("useMonoTokenMigration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("does nothing when user is not logged in", async () => {
    localStorage.setItem("finyk_token", "legacy-token");

    renderHook(() => useMonoTokenMigration(false), {
      wrapper: makeWrapper(),
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(mockedConnect).not.toHaveBeenCalled();
  });

  it("migrates legacy token to server when logged in", async () => {
    localStorage.setItem("finyk_token", "my-legacy-token");
    mockedConnect.mockResolvedValue({ status: "active", accountsCount: 1 });

    renderHook(() => useMonoTokenMigration(true), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(mockedConnect).toHaveBeenCalledWith(
        "my-legacy-token",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    // Legacy token keys should be removed
    expect(localStorage.getItem("finyk_token")).toBeNull();
    expect(sessionStorage.getItem("finyk_token")).toBeNull();
    expect(localStorage.getItem("finyk_token_remembered")).toBeNull();

    // Migration flag should be set
    expect(localStorage.getItem("finyk_mono_token_migrated")).toBe("1");

    // Analytics event fired
    expect(mockedTrackEvent).toHaveBeenCalledWith("mono_token_migrated", {
      source: "auto",
    });
  });

  it("migrates finyk_token_remembered if present", async () => {
    localStorage.setItem("finyk_token_remembered", "remembered-token");
    mockedConnect.mockResolvedValue({ status: "active", accountsCount: 2 });

    renderHook(() => useMonoTokenMigration(true), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(mockedConnect).toHaveBeenCalledWith(
        "remembered-token",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    expect(localStorage.getItem("finyk_token_remembered")).toBeNull();
  });

  it("does not re-migrate if already done", async () => {
    localStorage.setItem("finyk_token", "legacy-token");
    localStorage.setItem("finyk_mono_token_migrated", "1");

    renderHook(() => useMonoTokenMigration(true), {
      wrapper: makeWrapper(),
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(mockedConnect).not.toHaveBeenCalled();
  });

  it("does not remove token if connect fails", async () => {
    localStorage.setItem("finyk_token", "legacy-token");
    mockedConnect.mockRejectedValue(new Error("Server error"));

    renderHook(() => useMonoTokenMigration(true), {
      wrapper: makeWrapper(),
    });

    await new Promise((r) => setTimeout(r, 100));

    // Token should remain since migration failed
    expect(localStorage.getItem("finyk_token")).toBe("legacy-token");
    // Migration flag NOT set
    expect(localStorage.getItem("finyk_mono_token_migrated")).toBeNull();
  });
});
