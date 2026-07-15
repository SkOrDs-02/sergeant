/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  exportData: vi.fn(),
  deleteAccount: vi.fn(),
}));
vi.mock("@shared/api", () => ({
  meApi: {
    exportData: apiMocks.exportData,
    deleteAccount: apiMocks.deleteAccount,
  },
}));

const downloadString = vi.hoisted(() => vi.fn());
vi.mock("@shared/lib/ui/export", () => ({ downloadString }));

vi.mock("../hub/HubBackupPanel", () => ({
  HubBackupPanel: () => <div data-testid="hub-backup-panel" />,
}));

import { DataExportSection } from "./DataExportSection";

describe("DataExportSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the backup panel and data-rights actions", () => {
    render(<DataExportSection />);
    expect(screen.getByTestId("hub-backup-panel")).toBeInTheDocument();
    expect(
      screen.getByText("Завантажити серверний експорт"),
    ).toBeInTheDocument();
    expect(screen.getByText("Видалити акаунт")).toBeInTheDocument();
  });

  it("downloads a server export and shows a success message", async () => {
    apiMocks.exportData.mockResolvedValue({ user: { id: "u1" } });
    render(<DataExportSection />);

    fireEvent.click(screen.getByText("Завантажити серверний експорт"));

    await waitFor(() => {
      expect(apiMocks.exportData).toHaveBeenCalledTimes(1);
    });
    expect(downloadString).toHaveBeenCalledTimes(1);
    const [content, filename, mime] = downloadString.mock.calls[0]!;
    expect(content).toContain('"id": "u1"');
    expect(filename).toMatch(
      /^sergeant-account-export-\d{4}-\d{2}-\d{2}\.json$/,
    );
    expect(mime).toBe("application/json");

    expect(
      await screen.findByText("Серверний експорт завантажено як JSON."),
    ).toBeInTheDocument();
  });

  it("shows an error message when the server export fails", async () => {
    apiMocks.exportData.mockRejectedValue(new Error("nope"));
    render(<DataExportSection />);

    fireEvent.click(screen.getByText("Завантажити серверний експорт"));

    expect(
      await screen.findByText(
        "Не вдалося створити серверний експорт. Перевір вхід.",
      ),
    ).toBeInTheDocument();
    expect(downloadString).not.toHaveBeenCalled();
  });

  it("does nothing when the delete confirmation is declined", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DataExportSection />);

    fireEvent.click(screen.getByText("Видалити акаунт"));

    expect(apiMocks.deleteAccount).not.toHaveBeenCalled();
  });

  it("deletes the account and redirects home on confirm", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    apiMocks.deleteAccount.mockResolvedValue(undefined);
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });

    render(<DataExportSection />);
    fireEvent.click(screen.getByText("Видалити акаунт"));

    await waitFor(() => {
      expect(apiMocks.deleteAccount).toHaveBeenCalledTimes(1);
    });
    expect(
      await screen.findByText(
        "Запит на видалення прийнято. Повертаю на головну…",
      ),
    ).toBeInTheDocument();
    expect(assign).toHaveBeenCalledWith("/");
  });

  it("shows an error when account deletion fails", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    apiMocks.deleteAccount.mockRejectedValue(new Error("boom"));

    render(<DataExportSection />);
    fireEvent.click(screen.getByText("Видалити акаунт"));

    expect(
      await screen.findByText(
        "Не вдалося видалити акаунт. Спробуй ще раз або напиши в підтримку.",
      ),
    ).toBeInTheDocument();
  });
});
