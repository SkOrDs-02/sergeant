// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Stub the kvStoreBoot dependency — it requires @sergeant/db-schema/sqlite
// (WASM artefact not built in test env). Must be hoisted before any import
// that transitively pulls in @shared/lib/storage/storage.
vi.mock("../../core/db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => null,
  bootstrapKvStore: () => Promise.resolve(),
}));

import { OfflinePage } from "./OfflinePage";

// Mock useOnlineStatus to control online/offline state
vi.mock("@shared/hooks/useOnlineStatus", () => ({
  useOnlineStatus: vi.fn(() => true),
}));

// Mock the illustration to avoid SVG complexity in tests
vi.mock("@assets/illustrations", () => ({
  OfflineIllustration: ({ size }: { size: number }) => (
    <div data-testid="offline-illustration" data-size={size} />
  ),
  NotFoundIllustration: () => <div data-testid="not-found-illustration" />,
  ServerErrorIllustration: () => (
    <div data-testid="server-error-illustration" />
  ),
}));

import { useOnlineStatus } from "@shared/hooks/useOnlineStatus";
const mockUseOnlineStatus = vi.mocked(useOnlineStatus);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OfflinePage", () => {
  it("renders the 'Офлайн' eyebrow text", () => {
    render(<OfflinePage />);
    expect(screen.getByText("Офлайн")).toBeInTheDocument();
  });

  it("renders the main title 'Немає зʼєднання'", () => {
    render(<OfflinePage />);
    expect(screen.getByText("Немає зʼєднання")).toBeInTheDocument();
  });

  it("renders the reload button when online=true with 'Спробувати ще' label", () => {
    mockUseOnlineStatus.mockReturnValue(true);
    render(<OfflinePage />);
    expect(screen.getByText("Спробувати ще")).toBeInTheDocument();
  });

  it("renders 'Очікуємо мережу…' button text when offline", () => {
    mockUseOnlineStatus.mockReturnValue(false);
    render(<OfflinePage />);
    expect(screen.getByText("Очікуємо мережу…")).toBeInTheDocument();
  });

  it("reload button is disabled when offline", () => {
    mockUseOnlineStatus.mockReturnValue(false);
    render(<OfflinePage />);
    const btn = screen.getByRole("button", { name: /Очікуємо мережу/i });
    expect(btn).toBeDisabled();
  });

  it("reload button is enabled when online", () => {
    mockUseOnlineStatus.mockReturnValue(true);
    render(<OfflinePage />);
    const btn = screen.getByRole("button", { name: /Спробувати ще/i });
    expect(btn).not.toBeDisabled();
  });

  it("renders the offline illustration", () => {
    render(<OfflinePage />);
    expect(screen.getByTestId("offline-illustration")).toBeInTheDocument();
  });

  it("renders inside a main landmark element", () => {
    render(<OfflinePage />);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("renders the hint text about offline data", () => {
    render(<OfflinePage />);
    expect(
      screen.getByText(/Модулі Фінік.*зберігають дані офлайн/i),
    ).toBeInTheDocument();
  });
});
