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

// PR-S14: секція тепер питає стан сесії. Мок дає керувати всіма ТРЬОМА
// станами — гість, залогінений і «ще не знаємо» — бо саме третій стан
// відрізняє цей гейт від наївного `!signedIn`.
const authState = vi.hoisted(() => ({
  value: null as { user: unknown; isLoading: boolean } | null,
}));
vi.mock("../auth/AuthContext", () => ({
  useAuthOptional: () => authState.value,
}));

vi.mock("../hub/HubBackupPanel", () => ({
  HubBackupPanel: () => <div data-testid="hub-backup-panel" />,
}));

import { messages } from "@shared/i18n/uk";
import { DataExportSection } from "./DataExportSection";

describe("DataExportSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Дефолт — «провайдера немає», як було до цієї правки: наявні тести
    // нижче не знають про сесію і не мають почати від неї залежати.
    authState.value = null;
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

    // PR-S14: читаємо з каталогу, а не літералом. Доти тут стояв рядок
    // копії дослівно, тож правка самої копії ламала тест, який про копію
    // не був — він про те, що збій ВЗАГАЛІ показують.
    expect(
      await screen.findByText(messages.dataExport.failed),
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

  // V-12 (аудит 2026-08-08, docs/work/specs/audits/2026-08-08-profile-settings-deep-audit.md
  // §5): саморобні `<h3 class="text-style-label">` переведено на спільний
  // примітив `SettingsSubGroup` — тепер усі `<h3 class="text-style-overline">`.
  //
  // PR-S4 (2026-09-14): підблоків тут лишився ОДИН. «Куди їдуть дані для AI»
  // і «Якщо Sergeant колись закриється» переїхали в «Дані та приватність»,
  // і тепер їх стереже `PrivacySection.test.tsx`. Перевірка типографіки
  // лишається на тому, що тут ще є, — інакше переїзд забрав би разом із
  // блоками й гарантію, що заголовки не роз'їдуться назад.
  it("V-12: підблок рендерить h3 із text-style-overline (SettingsSubGroup), а не text-style-label", () => {
    const { container } = render(<DataExportSection />);

    const rightsHeading = screen.getByText("Права на дані");
    expect(rightsHeading.tagName).toBe("H3");
    expect(rightsHeading).toHaveClass("text-style-overline");
    expect(rightsHeading).not.toHaveClass("text-style-label");

    const levels = Array.from(
      container.querySelectorAll("h1,h2,h3,h4,h5,h6"),
    ).map((el) => Number(el.tagName.slice(1)));
    // PR-S4: було [2, 3, 3, 3] — два зайвих h3 пішли разом із блоками.
    expect(levels).toEqual([2, 3]);
  });

  // PR-S4: регрес у зворотний бік. Якщо блоки колись повернуться сюди
  // копіпастом, розділ знову відповідатиме на питання, яке йому не
  // адресоване, і в приватності лишиться половина відповіді.
  it("PR-S4: розділ більше не несе декларацій про дані — вони в приватності", () => {
    render(<DataExportSection />);
    expect(
      screen.queryByText("Куди їдуть дані для AI"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Якщо Sergeant колись закриється/),
    ).not.toBeInTheDocument();
  });

  // PR-S14. Дві кнопки бʼють у серверний експорт, який для гостя завжди 401.
  // Доти гість натискав їх і читав постфактум «Перевір вхід» — інтерфейс
  // пропонував дію, якої для його стану не існує.
  it("PR-S14: гість бачить, що серверний експорт потребує входу, ДО натискання", () => {
    authState.value = { user: null, isLoading: false };
    render(<DataExportSection />);

    expect(
      screen.getByText("Завантажити JSON").closest("button"),
    ).toBeDisabled();
    expect(
      screen.getByText("Завантажити CSV").closest("button"),
    ).toBeDisabled();
    expect(screen.getByText(/доступний після входу/i)).toBeInTheDocument();
  });

  // Break-test прогнано: на старому коді падає ЛИШЕ тест гостя вище. Два
  // наступні там проходять — бо гейта не було взагалі, тож кнопки були
  // ввімкнені завжди. Вони лишаються свідомо, але як піни на інваріант
  // («гейт не має зачепити нікого зайвого»), а не як докази дефекту.
  it("PR-S14: залогінений користувач кнопок не втрачає", () => {
    authState.value = { user: { id: "u1" }, isLoading: false };
    render(<DataExportSection />);

    expect(
      screen.getByText("Завантажити JSON").closest("button"),
    ).not.toBeDisabled();
    expect(
      screen.queryByText(/доступний після входу/i),
    ).not.toBeInTheDocument();
  });

  // Найважливіший із трьох: доки сесія гідрується, стверджувати НЕ МОЖНА.
  // Наївний `!signedIn` тут показав би «увійди» кожному залогіненому на
  // частку секунди — рівно дефект, який PR-S2 лікував у сусідній секції.
  it("PR-S14: поки сесія не відома, нічого не стверджує", () => {
    authState.value = { user: null, isLoading: true };
    render(<DataExportSection />);

    expect(
      screen.getByText("Завантажити JSON").closest("button"),
    ).not.toBeDisabled();
    expect(
      screen.queryByText(/доступний після входу/i),
    ).not.toBeInTheDocument();
  });
});
