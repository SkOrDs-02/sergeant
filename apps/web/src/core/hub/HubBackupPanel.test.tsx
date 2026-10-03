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

// Adversarial review (backup group) #1: компонент тепер викликає
// `isHubBackupPayload` для валідації файлу ДО відкриття діалогу
// підтвердження. Це дзеркалить реальну реалізацію в `hubBackup.ts`
// (навмисно тримається з нею в синхроні — якщо перевірка форми там
// зміниться, онови і тут) замість того, щоб тягнути реальний модуль, який
// притягнув би storage-модулі finyk/fizruk/routine/nutrition, яких інші
// моки нижче навмисно уникають.
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

// Реалістичний повний експорт — один не-`version` ключ під `finyk` і truthy
// (навіть якщо порожнє) значення для кожного з інших трьох модулів. Це та
// форма, яку `sectionsThatWillBeOverwritten` у компоненті читає, щоб
// вирішити, які з чотирьох модулів назвати в діалозі підтвердження.
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
    // `clearAllMocks` скидає лише історію викликів, а не реалізацію,
    // передану в `vi.fn(...)` на рівні модуля, тож `isHubBackupPayloadMock`
    // і далі коректно працює між тестами без повторного озброєння тут.
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Adversarial review (backup group) #6: раніше це жило в кінці кожного
    // окремого тіла тесту. Якщо раніший `expect` у тесті кидав виняток
    // (саме це стається на L-5-регресії — див. коментар до
    // `selectBackupFile` нижче), застаблений `location` протікав у наступні
    // тести, які потім падали з неповʼязаних причин (відсутні
    // `location.href`/`origin`). Централізація cleanup тут робить його
    // безумовним.
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

  // Обирає заданий (уже серіалізовний) payload через прихований file-інпут.
  // НЕ чекає на діалог — виклики, що очікують його відкриття, роблять це
  // явно; ті, що очікують негайну помилку (§1 нижче), — ні.
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

  // Adversarial review (backup group) #5: попередній коментар тут
  // стверджував, що без L-5-фіксу перевірки нижче впадуть з "expected spy
  // to not have been called". Це неправильно — видалення фіксу взагалі не
  // міняє `selectBackupFile`, воно міняє те, чи рендериться `ConfirmDialog`
  // взагалі. Без фіксу впаде саме цей `waitFor`, після дефолтного ~1s
  // таймауту, з "Unable to find role 'alertdialog'" — кожен тест нижче, що
  // викликає цей хелпер, платить цю ціну при регресії, а не лише перший.
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

  // Adversarial review (backup group) #2/#4 (HIGH/MEDIUM): до цього фіксу
  // діалог завжди називав усі чотири модулі зі статичного списку, незалежно
  // від того, що насправді містив обраний файл — файл лише з `finyk`
  // усе одно попереджав про стирання Фізрук/Рутина/Їжа. Саме цей тест
  // впав би проти дофіксового статичного списку (він завжди містив усі
  // чотири рядки) і падає зараз, якщо динамічний вивід регресує назад у
  // статичний список.
  it("confirmation dialog names only the modules actually present in the file, not a static worst-case list", async () => {
    render(<HubBackupPanel />);
    await selectBackupFile({
      kind: "hub-backup",
      schemaVersion: 1,
      finyk: { accounts: [] },
      // routine / fizruk / nutrition навмисно відсутні — наприклад ручний
      // обрізаний експорт, або модуль, з якого ще нема чого експортувати.
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

  // Дефект #3 (CodeRabbit post-merge review PR #756): `applyHubBackupPayload`
  // (`hubBackup.ts`) застосовує й секцію `hub` (`lastModule`/`chatHistory`),
  // але `sectionsThatWillBeOverwritten` про неї раніше мовчала — бекап лише
  // з `hub` показував ПОРОЖНІЙ список замість переліку того, що реально буде
  // перетерто.
  it("names the Hub section when the file contains only `hub`, not the empty-warning fallback", async () => {
    render(<HubBackupPanel />);
    await selectBackupFile({
      kind: "hub-backup",
      schemaVersion: 1,
      hub: { lastModule: "finyk" },
      // finyk / fizruk / routine / nutrition навмисно відсутні — hub-only
      // експорт (наприклад лише `includeChat: true` без даних модулів).
    });
    await waitFor(() =>
      expect(screen.getByRole("alertdialog")).toBeInTheDocument(),
    );

    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("Hub");
    expect(dialog.textContent).not.toContain(
      "Цей файл не містить даних Фініка, Фізрука, Рутини чи Їжі",
    );
  });

  // Adversarial review (backup group) #1 (HIGH): до цього фіксу валідація
  // форми жила лише всередині `applyHubBackupPayload`, який запускався
  // ПІСЛЯ того, як юзер підтвердив діалог "це незворотно". Вибір валідного
  // JSON, який просто не є hub backup (наприклад `package.json`), відкривав
  // те саме попередження про незворотне перезаписування, і єдиний спосіб
  // дізнатись, що файл неправильний, — натиснути деструктивну кнопку
  // "Перезаписати".
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

    // І кнопка-скрим (індекс 0), і футерна кнопка (остання) мають
    // доступну назву "Скасувати" й обидві викликають той самий `onCancel`
    // (`ConfirmDialog.tsx`: кнопка скриму + вторинна кнопка футера) — який
    // саме індекс клікати, не є суттєвим для цієї перевірки. Клікаємо
    // футерну кнопку як більш очевидну з двох.
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

  // Дефект #4 (CodeRabbit post-merge review PR #756): без `onerror` збій
  // `readAsText` (пошкоджений файл, обрив читання) не давав ні тосту, ні
  // скинутого значення інпута — повторний вибір ТОГО САМОГО файлу після
  // цього не запускав `onChange` знову. Справжній `FileReader` у jsdom не
  // вміє штучно впасти на звичайному `File`, тож стабимо глобальний клас,
  // щоб змусити `readAsText` викликати саме `onerror`.
  it("runImport: FileReader onerror calls toast.error and resets the input value", async () => {
    const reloadMock = vi.fn();
    vi.stubGlobal("location", { reload: reloadMock });

    class FailingFileReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      result: string | null = null;
      // `r.error` тут навмисно не читається компонентом — DOMException не
      // `instanceof Error`, тож onerror показує фіксований текст (див.
      // коментар у `HubBackupPanel.tsx`).
      error = new DOMException("boom", "NotReadableError");
      readAsText() {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("FileReader", FailingFileReader);

    render(<HubBackupPanel />);
    const fileInput = document.querySelector(
      "input[type='file']",
    ) as HTMLInputElement;
    const file = new File(["irrelevant"], "backup.json", {
      type: "application/json",
    });

    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [file],
        configurable: true,
      });
      // Засіваємо непорожнє значення ДО зміни: справжній `.value` файлового
      // інпута лишався б порожнім і без будь-якого фіксу (jsdom, як і
      // браузери, не дозволяє програмно ставити довільний непорожній рядок
      // напряму — лише порожній), тож без цього кроку фінальний
      // `expect(fileInput.value).toBe("")` нижче проходив би НАВІТЬ ЯКЩО
      // `onerror` компонента взагалі нічого не скидає (вакуумна перевірка).
      // Переозначаємо дескриптор так само, як для `files` вище, щоб обійти
      // нативне обмеження і зробити reset у `onerror` дійсно спостережним.
      Object.defineProperty(fileInput, "value", {
        value: "C:\\fakepath\\backup.json",
        writable: true,
        configurable: true,
      });
      fireEvent.change(fileInput);
    });

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Не вдалось прочитати файл",
        undefined,
        expect.objectContaining({ label: "Обрати інший" }),
      ),
    );
    expect(fileInput.value).toBe("");
    expect(applyPayloadMock).not.toHaveBeenCalled();
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
