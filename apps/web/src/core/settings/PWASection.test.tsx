/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const swMocks = vi.hoisted(() => ({
  swClearCaches: vi.fn(),
  swGetDebugSnapshot: vi.fn(),
  swSetDebug: vi.fn(),
}));
vi.mock("../app/swControl", () => swMocks);

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => toastMocks,
}));

vi.mock("@shared/lib", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { PWASection } from "./PWASection";

function ensureServiceWorker(present: boolean) {
  if (present) {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {},
    });
  } else if ("serviceWorker" in navigator) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (navigator as any).serviceWorker;
  }
}

describe("PWASection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureServiceWorker(true);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders both SW action buttons", () => {
    render(<PWASection />);
    expect(screen.getByText("Діагностика SW")).toBeInTheDocument();
    expect(screen.getByText("Скинути кеш PWA")).toBeInTheDocument();
  });

  it("disables buttons when serviceWorker is unavailable", () => {
    ensureServiceWorker(false);
    render(<PWASection />);
    expect(screen.getByText("Діагностика SW").closest("button")).toBeDisabled();
    expect(
      screen.getByText("Скинути кеш PWA").closest("button"),
    ).toBeDisabled();
  });

  it("runs SW diagnostics and toasts success", async () => {
    swMocks.swSetDebug.mockResolvedValue(undefined);
    swMocks.swGetDebugSnapshot.mockResolvedValue({ caches: [] });
    render(<PWASection />);

    fireEvent.click(screen.getByText("Діагностика SW"));

    await waitFor(() => {
      expect(swMocks.swSetDebug).toHaveBeenCalledWith(true);
    });
    expect(swMocks.swGetDebugSnapshot).toHaveBeenCalledTimes(1);
    expect(toastMocks.success).toHaveBeenCalledWith(
      "SW-діагностика виведена в консоль",
    );
  });

  it("toasts an error when diagnostics fail", async () => {
    swMocks.swSetDebug.mockRejectedValue(new Error("boom"));
    render(<PWASection />);

    fireEvent.click(screen.getByText("Діагностика SW"));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith(
        "Не вдалося отримати діагностику SW",
      );
    });
  });

  it("opens the confirm dialog when clearing the cache", () => {
    render(<PWASection />);
    fireEvent.click(screen.getByText("Скинути кеш PWA"));
    expect(screen.getByText("Скинути кеш PWA?")).toBeInTheDocument();
    expect(screen.getByText("Скинути та перезавантажити")).toBeInTheDocument();
  });

  it("clears caches and schedules a reload on confirm", async () => {
    vi.useFakeTimers();
    swMocks.swClearCaches.mockResolvedValue({ cleared: 3 });
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });

    render(<PWASection />);
    fireEvent.click(screen.getByText("Скинути кеш PWA"));
    fireEvent.click(screen.getByText("Скинути та перезавантажити"));

    await vi.waitFor(() => {
      expect(swMocks.swClearCaches).toHaveBeenCalledTimes(1);
    });
    expect(toastMocks.success).toHaveBeenCalledWith(
      "Кеш PWA скинуто. Перезавантажуємо…",
      4000,
    );

    vi.advanceTimersByTime(300);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("toasts an error when clearing the cache fails", async () => {
    swMocks.swClearCaches.mockRejectedValue(new Error("fail"));
    render(<PWASection />);
    fireEvent.click(screen.getByText("Скинути кеш PWA"));
    fireEvent.click(screen.getByText("Скинути та перезавантажити"));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith(
        "Не вдалося скинути кеш PWA",
      );
    });
  });

  it("closes the confirm dialog on cancel without clearing caches", () => {
    render(<PWASection />);
    fireEvent.click(screen.getByText("Скинути кеш PWA"));
    fireEvent.click(screen.getByText("Скасувати"));
    expect(screen.queryByText("Скинути кеш PWA?")).not.toBeInTheDocument();
    expect(swMocks.swClearCaches).not.toHaveBeenCalled();
  });
});
