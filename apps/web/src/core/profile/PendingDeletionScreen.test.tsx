// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@shared/hooks/useToast";
import { ToastContainer } from "@shared/components/ui/Toast";
import { PendingDeletionScreen } from "./PendingDeletionScreen";

/**
 * Екран-блокер для акаунта у вікні на скасування видалення (спека
 * docs/work/specs/user-deletion-grace-window.md, рішення 3-4).
 */
const restoreAccountMock = vi.fn<() => Promise<unknown>>();
vi.mock("@shared/api", () => ({
  meApi: { restoreAccount: () => restoreAccountMock() },
}));

function renderScreen(onLogout = vi.fn(async () => undefined)) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <PendingDeletionScreen
          scheduledPurgeAt="2026-10-20T10:00:00.000Z"
          onLogout={onLogout}
        />
        <ToastContainer />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...utils, onLogout };
}

beforeEach(() => {
  restoreAccountMock.mockReset().mockResolvedValue({
    ok: true,
    restoredAt: "2026-09-21T10:00:00.000Z",
  });
});

describe("PendingDeletionScreen", () => {
  it("називає дату, після якої дані зникнуть", () => {
    renderScreen();
    expect(screen.getByText(/20 жовтня 2026/)).toBeInTheDocument();
  });

  // Рішення 5 спеки: наслідок «підписка не повернеться» має бути видимим
  // тут, а не з'ясовуватись після відновлення.
  it("попереджає, що відновлення не повертає підписку", () => {
    renderScreen();
    expect(screen.getByText(/підписку вже скасовано/i)).toBeInTheDocument();
  });

  it("«Відновити акаунт» кличе restore і повідомляє про успіх", async () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Відновити акаунт" }));

    await waitFor(() => expect(restoreAccountMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Акаунт відновлено")).toBeInTheDocument();
  });

  it("на збої restore лишає екран і дає повторити", async () => {
    restoreAccountMock.mockRejectedValueOnce(new Error("network"));
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Відновити акаунт" }));

    expect(
      await screen.findByText("Не вдалося відновити акаунт"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Відновити акаунт" }),
    ).toBeInTheDocument();
  });

  it("«Вийти» кличе teardown сесії, а не restore", async () => {
    const onLogout = vi.fn(async () => undefined);
    renderScreen(onLogout);

    fireEvent.click(screen.getByRole("button", { name: "Вийти" }));

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
    expect(restoreAccountMock).not.toHaveBeenCalled();
  });

  it("це модальний діалог із доступним іменем", () => {
    renderScreen();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Акаунт готується до видалення");
  });
});
