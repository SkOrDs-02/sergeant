/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ToastProvider } from "@shared/hooks/useToast";
import { ToastContainer } from "@shared/components/ui/Toast";
import {
  PULL_REFRESH_ERROR_MESSAGE,
  usePullRefreshErrorToast,
} from "./usePullRefreshErrorToast";

afterEach(cleanup);

function Harness({ retry }: { retry: () => Promise<unknown> }) {
  const onError = usePullRefreshErrorToast(retry);
  return (
    <button type="button" onClick={() => onError(new Error("offline"))}>
      fail
    </button>
  );
}

function renderHarness(retry: () => Promise<unknown>) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ToastProvider>
      {children}
      <ToastContainer />
    </ToastProvider>
  );
  return render(<Harness retry={retry} />, { wrapper });
}

describe("usePullRefreshErrorToast", () => {
  it("показує тост провалу з дією «Повторити», яка кличе той самий retry", async () => {
    const retry = vi.fn(() => Promise.resolve());
    renderHarness(retry);
    fireEvent.click(screen.getByText("fail"));

    expect(screen.getByText(PULL_REFRESH_ERROR_MESSAGE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторити" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("невдалий повтор показує тост знову, а не проходить мовчки", async () => {
    const retry = vi.fn(() => Promise.reject(new Error("still offline")));
    renderHarness(retry);
    fireEvent.click(screen.getByText("fail"));
    const before = screen.getAllByText(PULL_REFRESH_ERROR_MESSAGE).length;
    fireEvent.click(screen.getAllByRole("button", { name: "Повторити" })[0]!);
    await act(async () => {
      await Promise.resolve();
    });

    expect(retry).toHaveBeenCalledTimes(1);
    // Відмова повтору породжує новий тост із тією самою дією.
    await waitFor(() =>
      expect(screen.getAllByText(PULL_REFRESH_ERROR_MESSAGE).length).toBe(
        before + 1,
      ),
    );
  });
});
