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

const unregisterMock = vi.fn();
const getRegistrationMock = vi.fn();

function ensureServiceWorker(present: boolean) {
  if (present) {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: getRegistrationMock },
    });
  } else if ("serviceWorker" in navigator) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (navigator as any).serviceWorker;
  }
}

describe("PWASection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    unregisterMock.mockResolvedValue(true);
    getRegistrationMock.mockResolvedValue({ unregister: unregisterMock });
    ensureServiceWorker(true);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders both SW action buttons", () => {
    render(<PWASection />);
    expect(screen.getByText("Технічна діагностика")).toBeInTheDocument();
    expect(screen.getByText("Скинути кеш PWA")).toBeInTheDocument();
  });

  it("disables buttons when serviceWorker is unavailable", () => {
    ensureServiceWorker(false);
    render(<PWASection />);
    expect(
      screen.getByText("Технічна діагностика").closest("button"),
    ).toBeDisabled();
    expect(
      screen.getByText("Скинути кеш PWA").closest("button"),
    ).toBeDisabled();
  });

  it("runs SW diagnostics and toasts success", async () => {
    swMocks.swSetDebug.mockResolvedValue(undefined);
    swMocks.swGetDebugSnapshot.mockResolvedValue({ caches: [] });
    render(<PWASection />);

    fireEvent.click(screen.getByText("Технічна діагностика"));

    await waitFor(() => {
      expect(swMocks.swSetDebug).toHaveBeenCalledWith(true);
    });
    expect(swMocks.swGetDebugSnapshot).toHaveBeenCalledTimes(1);
    expect(toastMocks.success).toHaveBeenCalledWith(
      "SW-діагностику підготовлено",
    );
  });

  it("toasts an error when diagnostics fail", async () => {
    swMocks.swSetDebug.mockRejectedValue(new Error("boom"));
    render(<PWASection />);

    fireEvent.click(screen.getByText("Технічна діагностика"));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith(
        "Не вдалося отримати діагностику SW",
        undefined,
        expect.objectContaining({ label: "Повторити" }),
      );
    });
  });

  it("opens the confirm dialog when clearing the cache", () => {
    render(<PWASection />);
    fireEvent.click(screen.getByText("Скинути кеш PWA"));
    expect(screen.getByText("Скинути кеш PWA?")).toBeInTheDocument();
    expect(screen.getByText("Скинути та перезавантажити")).toBeInTheDocument();
  });

  // Регресія browser-QA 2026-09-03: діалог лякав утратою офлайн-черги,
  // якої `clearAppCaches` не торкається взагалі (воно ходить лише по
  // CacheStorage). Пін тримає текст чесним в обидва боки: без хибної
  // загрози і з реальною ціною дії.
  it("не обіцяє втрати офлайн-черги, бо очистка кешу її не чіпає", () => {
    render(<PWASection />);
    fireEvent.click(screen.getByText("Скинути кеш PWA"));
    expect(screen.queryByText(/офлайн-черзі можуть бути втрачені/)).toBeNull();
    expect(
      screen.getByText(/офлайн-черга лишаються на місці/),
    ).toBeInTheDocument();
    expect(screen.getByText(/дотягне заново/)).toBeInTheDocument();
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
    // rel-12: ручне скидання шле скоуп "all" (прекеш теж), а не дефолтний "user".
    expect(swMocks.swClearCaches).toHaveBeenCalledWith("all");
    // Тост і reload — після `getRegistration()` + `unregister()`.
    await vi.waitFor(() => {
      expect(toastMocks.success).toHaveBeenCalledWith(
        "Кеш PWA скинуто. Перезавантажую…",
        4000,
      );
    });

    vi.advanceTimersByTime(300);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  // rel-12: після "all" прекеш порожній, і Workbox сам його не відновить.
  // Без `unregister()` активний SW лишається без ассетів до наступного деплою.
  it("знімає реєстрацію SW після очищення і лише тоді перезавантажує", async () => {
    vi.useFakeTimers();
    swMocks.swClearCaches.mockResolvedValue({ ok: true, deleted: [] });
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });

    render(<PWASection />);
    fireEvent.click(screen.getByText("Скинути кеш PWA"));
    fireEvent.click(screen.getByText("Скинути та перезавантажити"));

    await vi.waitFor(() => {
      expect(unregisterMock).toHaveBeenCalledTimes(1);
    });
    vi.advanceTimersByTime(300);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(swMocks.swClearCaches.mock.invocationCallOrder[0]).toBeLessThan(
      unregisterMock.mock.invocationCallOrder[0]!,
    );
    expect(unregisterMock.mock.invocationCallOrder[0]).toBeLessThan(
      reload.mock.invocationCallOrder[0]!,
    );
  });

  it("не перезавантажує, якщо зняття реєстрації SW впало", async () => {
    vi.useFakeTimers();
    swMocks.swClearCaches.mockResolvedValue({ ok: true, deleted: [] });
    unregisterMock.mockRejectedValue(new Error("unregister failed"));
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });

    render(<PWASection />);
    fireEvent.click(screen.getByText("Скинути кеш PWA"));
    fireEvent.click(screen.getByText("Скинути та перезавантажити"));

    await vi.waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith(
        "Не вдалося скинути кеш PWA",
        undefined,
        expect.objectContaining({ label: "Повторити" }),
      );
    });
    vi.advanceTimersByTime(1000);
    expect(reload).not.toHaveBeenCalled();
  });

  it("toasts an error when clearing the cache fails", async () => {
    swMocks.swClearCaches.mockRejectedValue(new Error("fail"));
    render(<PWASection />);
    fireEvent.click(screen.getByText("Скинути кеш PWA"));
    fireEvent.click(screen.getByText("Скинути та перезавантажити"));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith(
        "Не вдалося скинути кеш PWA",
        undefined,
        expect.objectContaining({ label: "Повторити" }),
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
