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
}));
vi.mock("@shared/api", () => ({
  meApi: {
    exportData: apiMocks.exportData,
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
    expect(screen.getByText("Завантажити JSON")).toBeInTheDocument();
    expect(screen.getByText("Завантажити CSV")).toBeInTheDocument();
    expect(screen.queryByText("Видалити акаунт")).not.toBeInTheDocument();
  });

  it("несе sunset-обіцянку в продукті, а не лише в умовах використання", () => {
    // Рішення founder-а #6 — попередження за 30 днів + вікно на експорт.
    // Обіцянка має жити поруч із кнопками, якими її виконують: у розділі
    // юридичних текстів її ніхто не прочитає в момент, коли вона важлива.
    render(<DataExportSection />);
    expect(
      screen.getByText(/Якщо Sergeant колись закриється/),
    ).toBeInTheDocument();
    expect(screen.getByText(/щонайменше за 30 днів/)).toBeInTheDocument();
    // Друга половина обіцянки — чесне застереження про банк (рішення #2:
    // банківські транзакції ми не дублюємо). Без нього обіцянка «твої дані
    // твої» обіцяла б більше, ніж продукт може виконати.
    expect(screen.getByText(/не відновить ніхто/)).toBeInTheDocument();
  });

  it("downloads a server export and shows a success message", async () => {
    apiMocks.exportData.mockResolvedValue({ user: { id: "u1" } });
    render(<DataExportSection />);

    fireEvent.click(screen.getByText("Завантажити JSON"));

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

    fireEvent.click(screen.getByText("Завантажити JSON"));

    expect(
      await screen.findByText(
        "Не вдалося створити серверний експорт. Перевір вхід.",
      ),
    ).toBeInTheDocument();
    expect(downloadString).not.toHaveBeenCalled();
  });

  it("CSV-кнопка віддає CSV, а не той самий JSON під іншим іменем", async () => {
    // Найправдоподібніший баг цієї пари кнопок: обидві ведуть в одну гілку,
    // і користувач отримує файл `.csv` із JSON-вмістом. Excel відкриє його
    // одним стовпчиком зі скобками — тобто «таблиця, щоб подивитись»
    // не працює саме там, де вона єдина причина існування формату.
    apiMocks.exportData.mockResolvedValue({
      user: { id: "u1" },
      data: {
        moduleData: [{ ключ: "значення" }],
        mono: { connection: null, accounts: [], transactions: [] },
        billing: { subscriptions: [] },
        push: { webSubscriptions: [], devices: [] },
        ai: { usageDaily: [], memories: [] },
      },
    });
    render(<DataExportSection />);

    fireEvent.click(screen.getByText("Завантажити CSV"));

    await waitFor(() => expect(downloadString).toHaveBeenCalledTimes(1));
    const [content, filename, mime] = downloadString.mock.calls[0]!;
    expect(mime).toBe("text/csv");
    expect(filename).toMatch(
      /^sergeant-account-export-\d{4}-\d{2}-\d{2}\.csv$/,
    );
    expect(content).toContain("# Дані модулів");
    expect(content).toContain("значення");
    // Порожні секції лишаються видимими: «підписок немає» і «рядка про
    // підписки немає» — різні повідомлення про повноту експорту.
    expect(content).toContain("# Підписки");
    expect(content).not.toContain('"user"');
  });
});
