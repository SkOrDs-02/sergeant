// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";

// ─── Collaborator mocks ───────────────────────────────────────────────────────

const buildPayloadMock = vi.fn((_opts?: unknown) => ({
  kind: "hub-backup",
  schemaVersion: 1,
}));
const applyPayloadMock = vi.fn((_data?: unknown) => undefined);
const downloadJsonMock = vi.fn((_filename?: unknown, _payload?: unknown) =>
  Promise.resolve(),
);

vi.mock("./hubBackup", () => ({
  buildHubBackupPayload: (opts: unknown) => buildPayloadMock(opts),
  applyHubBackupPayload: (data: unknown) => applyPayloadMock(data),
}));

vi.mock("@sergeant/shared", async () => {
  const actual =
    await vi.importActual<typeof import("@sergeant/shared")>(
      "@sergeant/shared",
    );
  return {
    ...actual,
    downloadJson: (filename: unknown, payload: unknown) =>
      downloadJsonMock(filename, payload),
  };
});

const toastErrorMock = vi.fn();
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({
    error: toastErrorMock,
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    show: vi.fn(),
  }),
}));

import { HubBackupPanel } from "./HubBackupPanel";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("HubBackupPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the panel with Експорт і Імпорт buttons", () => {
    render(<HubBackupPanel />);
    expect(screen.getByText("Експорт JSON")).toBeTruthy();
    expect(screen.getByText("Імпорт…")).toBeTruthy();
  });

  it("renders privacy disclaimer text", () => {
    render(<HubBackupPanel />);
    expect(screen.getByText(/Резервна копія всього Hub/)).toBeTruthy();
  });

  it("export button calls buildHubBackupPayload(includeChat:false) and downloadJson", async () => {
    render(<HubBackupPanel />);
    await act(async () => {
      fireEvent.click(screen.getByText("Експорт JSON"));
    });
    expect(buildPayloadMock).toHaveBeenCalledWith({ includeChat: false });
    expect(downloadJsonMock).toHaveBeenCalledTimes(1);
    expect(downloadJsonMock).toHaveBeenCalledWith(
      expect.stringMatching(/^hub-backup-\d{4}-\d{2}-\d{2}\.json$/),
      { kind: "hub-backup", schemaVersion: 1 },
    );
  });

  it("import button triggers the hidden file input click", async () => {
    render(<HubBackupPanel />);
    const fileInput = document.querySelector(
      "input[type='file']",
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, "click");
    fireEvent.click(screen.getByText("Імпорт…"));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("runImport: valid JSON calls applyHubBackupPayload and reloads the page", async () => {
    const reloadMock = vi.fn();
    vi.stubGlobal("location", { reload: reloadMock });

    render(<HubBackupPanel />);
    const fileInput = document.querySelector(
      "input[type='file']",
    ) as HTMLInputElement;

    const validPayload = JSON.stringify({
      kind: "hub-backup",
      schemaVersion: 1,
    });
    const file = new File([validPayload], "backup.json", {
      type: "application/json",
    });

    await act(async () => {
      // Simulate FileReader by setting up the input change then driving
      // the reader onload manually.
      Object.defineProperty(fileInput, "files", {
        value: [file],
        configurable: true,
      });
      fireEvent.change(fileInput);
    });

    // FileReader.onload is async; wait a tick.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(applyPayloadMock).toHaveBeenCalledTimes(1);
    expect(reloadMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("runImport: invalid JSON calls toast.error and does NOT reload", async () => {
    const reloadMock = vi.fn();
    vi.stubGlobal("location", { reload: reloadMock });

    render(<HubBackupPanel />);
    const fileInput = document.querySelector(
      "input[type='file']",
    ) as HTMLInputElement;

    const badFile = new File(["{bad json"], "bad.json", {
      type: "application/json",
    });

    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [badFile],
        configurable: true,
      });
      fireEvent.change(fileInput);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(applyPayloadMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(reloadMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("runImport: applyHubBackupPayload throwing surfaces via toast.error", async () => {
    applyPayloadMock.mockImplementationOnce(() => {
      throw new Error("Некоректний файл резервної копії Hub.");
    });
    const reloadMock = vi.fn();
    vi.stubGlobal("location", { reload: reloadMock });

    render(<HubBackupPanel />);
    const fileInput = document.querySelector(
      "input[type='file']",
    ) as HTMLInputElement;

    const validPayload = JSON.stringify({
      kind: "hub-backup",
      schemaVersion: 1,
    });
    const file = new File([validPayload], "backup.json", {
      type: "application/json",
    });

    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [file],
        configurable: true,
      });
      fireEvent.change(fileInput);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(toastErrorMock).toHaveBeenCalledWith(
      "Некоректний файл резервної копії Hub.",
    );
    expect(reloadMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("accepts an optional className prop", () => {
    const { container } = render(<HubBackupPanel className="custom-cls" />);
    const panel = container.firstChild as HTMLElement;
    expect(panel.className).toContain("custom-cls");
  });
});
