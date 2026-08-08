// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";

// ─── Collaborator mocks ───────────────────────────────────────────────────────

const buildPayloadMock = vi.fn((_opts?: unknown) => ({
  kind: "hub-backup",
  schemaVersion: 1,
}));
const applyPayloadMock = vi.fn((_data?: unknown) => undefined);
const downloadJsonMock = vi.fn((_filename?: unknown, _payload?: unknown) =>
  Promise.resolve(),
);

// Adversarial review (backup group) #1: the component now calls
// `isHubBackupPayload` to validate the file BEFORE opening the confirmation
// dialog. This mirrors the real implementation in `hubBackup.ts` (kept
// deliberately in sync with it — if that shape check changes, update this
// too) rather than pulling in the real module, which would drag in the
// finyk/fizruk/routine/nutrition storage modules the other mocks below
// intentionally avoid touching.
const isHubBackupPayloadMock = vi.fn(
  (parsed: unknown) =>
    parsed != null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    (parsed as Record<string, unknown>)["kind"] === "hub-backup" &&
    typeof (parsed as Record<string, unknown>)["schemaVersion"] === "number",
);

vi.mock("./hubBackup", () => ({
  buildHubBackupPayload: (opts: unknown) => buildPayloadMock(opts),
  applyHubBackupPayload: (data: unknown) => applyPayloadMock(data),
  isHubBackupPayload: (data: unknown) => isHubBackupPayloadMock(data),
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

// A realistic full export — one non-`version` key under `finyk` and a
// truthy (even if empty) value for each of the other three modules. This is
// the shape `sectionsThatWillBeOverwritten` in the component reads to decide
// which of the four modules to name in the confirmation dialog.
const FULL_BACKUP_PAYLOAD = {
  kind: "hub-backup",
  schemaVersion: 1,
  finyk: { accounts: [] },
  fizruk: {},
  routine: {},
  nutrition: {},
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("HubBackupPanel", () => {
  beforeEach(() => {
    // `clearAllMocks` resets call history, not the implementation passed to
    // `vi.fn(...)` at module scope, so `isHubBackupPayloadMock` keeps
    // working correctly across tests without being re-armed here.
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Adversarial review (backup group) #6: this used to live at the end of
    // every individual test body. If an `expect` earlier in the test threw
    // (which is exactly what happens on the L-5 regression — see the
    // comment on `selectBackupFile` below), the stubbed `location` leaked
    // into subsequent tests, which then failed for unrelated reasons
    // (`location.href`/`origin` missing). Centralizing the cleanup here
    // makes it unconditional.
    vi.unstubAllGlobals();
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

  // Selects a given (already-serializable) payload through the hidden file
  // input. Does NOT wait for the dialog — callers that expect it to open
  // do that explicitly, callers that expect an immediate error (§1 below)
  // don't.
  async function selectBackupFile(payload: unknown, filename = "backup.json") {
    const fileInput = document.querySelector(
      "input[type='file']",
    ) as HTMLInputElement;
    const file = new File([JSON.stringify(payload)], filename, {
      type: "application/json",
    });
    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [file],
        configurable: true,
      });
      fireEvent.change(fileInput);
    });
  }

  // Adversarial review (backup group) #5: the previous comment here claimed
  // that, without the L-5 fix, the assertions below would fail with
  // "expected spy to not have been called". That's wrong — removing the fix
  // doesn't change `selectBackupFile` at all, it changes whether
  // `ConfirmDialog` ever renders. Without the fix this `waitFor` is what
  // fails, after the default ~1s timeout, with "Unable to find role
  // 'alertdialog'" — every test below that calls this helper pays that cost
  // on a regression, not just the first one.
  async function selectValidBackupFile() {
    await selectBackupFile(FULL_BACKUP_PAYLOAD);
    await waitFor(() =>
      expect(screen.getByRole("alertdialog")).toBeInTheDocument(),
    );
  }

  // L-5 (P1): регресія, яку ловить цей блок — раніше вибір файлу ОДРАЗУ
  // викликав applyHubBackupPayload (перетираючи витрати, борги, звички,
  // тренування й харчування всіх чотирьох модулів) і робив reload, без
  // жодного підтвердження.
  it("selecting a valid backup file opens a confirmation dialog naming what will be overwritten, without applying yet", async () => {
    const reloadMock = vi.fn();
    vi.stubGlobal("location", { reload: reloadMock });

    render(<HubBackupPanel />);
    await selectValidBackupFile();

    expect(applyPayloadMock).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();

    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("Фінік");
    expect(dialog.textContent).toContain("Фізрук");
    expect(dialog.textContent).toContain("Рутина");
    expect(dialog.textContent).toContain("Їжа");
  });

  // Adversarial review (backup group) #2/#4 (HIGH/MEDIUM): before this fix
  // the dialog always named all four modules from a static list, regardless
  // of what the selected file actually contained — a file with only
  // `finyk` in it still warned about erasing Фізрук/Рутина/Їжа. This test
  // is the one that would have failed against the pre-fix static list (it
  // always included all four strings), and fails now if the dynamic
  // derivation regresses back to a static list.
  it("confirmation dialog names only the modules actually present in the file, not a static worst-case list", async () => {
    render(<HubBackupPanel />);
    await selectBackupFile({
      kind: "hub-backup",
      schemaVersion: 1,
      finyk: { accounts: [] },
      // routine / fizruk / nutrition intentionally absent — e.g. a
      // hand-trimmed export, or a module with nothing to export yet.
    });
    await waitFor(() =>
      expect(screen.getByRole("alertdialog")).toBeInTheDocument(),
    );

    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("Фінік");
    expect(dialog.textContent).not.toContain("Фізрук");
    expect(dialog.textContent).not.toContain("Рутина");
    expect(dialog.textContent).not.toContain("Їжа");
  });

  // Adversarial review (backup group) #1 (HIGH): before this fix, form
  // validation lived only inside `applyHubBackupPayload`, which ran AFTER
  // the user confirmed the "this cannot be undone" dialog. Selecting valid
  // JSON that simply isn't a hub backup (e.g. `package.json`) opened that
  // same irreversible-overwrite warning, and the only way to discover the
  // file was wrong was to press the destructive "Перезаписати" button.
  it("selecting valid JSON that is not a hub backup shows an error immediately, without opening the confirmation dialog", async () => {
    const reloadMock = vi.fn();
    vi.stubGlobal("location", { reload: reloadMock });

    render(<HubBackupPanel />);
    await selectBackupFile(
      { name: "@sergeant/web", version: "1.0.0" },
      "package.json",
    );

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Некоректний файл резервної копії Hub.",
        undefined,
        expect.objectContaining({ label: "Обрати інший" }),
      ),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(applyPayloadMock).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("confirming the import dialog applies the backup and reloads the page", async () => {
    const reloadMock = vi.fn();
    vi.stubGlobal("location", { reload: reloadMock });

    render(<HubBackupPanel />);
    await selectValidBackupFile();

    fireEvent.click(screen.getByRole("button", { name: "Перезаписати" }));

    await waitFor(() => expect(applyPayloadMock).toHaveBeenCalledTimes(1));
    expect(applyPayloadMock).toHaveBeenCalledWith(FULL_BACKUP_PAYLOAD);
    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  // L-5 (P1): скасування має лишати дані недоторканими і НЕ робити reload.
  it("cancelling the import dialog leaves data untouched and does not reload", async () => {
    const reloadMock = vi.fn();
    vi.stubGlobal("location", { reload: reloadMock });

    render(<HubBackupPanel />);
    await selectValidBackupFile();

    // Both the scrim button (index 0) and the footer button (last) carry
    // the accessible name "Скасувати" and both call the same `onCancel`
    // (`ConfirmDialog.tsx` scrim button + footer secondary button) — which
    // index we click isn't load-bearing for this assertion. We click the
    // footer button as the more discoverable of the two.
    const cancelButtons = screen.getAllByRole("button", { name: "Скасувати" });
    fireEvent.click(cancelButtons[cancelButtons.length - 1] as HTMLElement);

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(applyPayloadMock).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
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

    expect(applyPayloadMock).not.toHaveBeenCalled();
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("runImport: applyHubBackupPayload throwing after confirmation surfaces via toast.error", async () => {
    applyPayloadMock.mockImplementationOnce(() => {
      throw new Error("Некоректний файл резервної копії Hub.");
    });
    const reloadMock = vi.fn();
    vi.stubGlobal("location", { reload: reloadMock });

    render(<HubBackupPanel />);
    await selectValidBackupFile();
    fireEvent.click(screen.getByRole("button", { name: "Перезаписати" }));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Некоректний файл резервної копії Hub.",
        undefined,
        expect.objectContaining({ label: "Обрати інший" }),
      ),
    );
    expect(reloadMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("accepts an optional className prop", () => {
    const { container } = render(<HubBackupPanel className="custom-cls" />);
    const panel = container.firstChild as HTMLElement;
    expect(panel.className).toContain("custom-cls");
  });
});
