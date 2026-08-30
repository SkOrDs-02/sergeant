/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { ChatUsageResponse } from "@sergeant/shared";

const { usageMock } = vi.hoisted(() => ({
  usageMock:
    vi.fn<(opts?: { signal?: AbortSignal }) => Promise<ChatUsageResponse>>(),
}));

vi.mock("@shared/api", () => ({
  chatApi: { usage: usageMock },
}));

import { ChatUsageCounter } from "./ChatUsageCounter";

function renderWithClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return render(<ChatUsageCounter />, { wrapper: Wrapper });
}

describe("ChatUsageCounter (PR-42 chat counter)", () => {
  beforeEach(() => {
    usageMock.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing while the usage query is in flight", () => {
    usageMock.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithClient();
    expect(screen.queryByTestId("chat-usage-counter")).not.toBeInTheDocument();
  });

  it("renders nothing for an unlimited Pro plan", async () => {
    usageMock.mockResolvedValue({ plan: "pro", limit: null, remaining: null });
    renderWithClient();
    await waitFor(() => expect(usageMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("chat-usage-counter")).not.toBeInTheDocument();
  });

  it("shows a used/limit pill for a Free plan with remaining quota", async () => {
    usageMock.mockResolvedValue({ plan: "free", limit: 5, remaining: 2 });
    renderWithClient();
    await waitFor(() =>
      expect(screen.getByTestId("chat-usage-counter")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("chat-usage-counter")).toHaveTextContent("3/5");
  });

  it("shows the exhausted CTA with a pricing link when remaining is 0", async () => {
    usageMock.mockResolvedValue({ plan: "free", limit: 5, remaining: 0 });
    renderWithClient();
    await waitFor(() => expect(screen.getByRole("link")).toBeInTheDocument());
    expect(screen.getByRole("link")).toHaveAttribute("href", "/pricing");
  });

  it("renders nothing when the request fails (401 anon / network error)", async () => {
    usageMock.mockRejectedValue(new Error("Unauthorized"));
    renderWithClient();
    await waitFor(() => expect(usageMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("chat-usage-counter")).not.toBeInTheDocument();
  });
});
