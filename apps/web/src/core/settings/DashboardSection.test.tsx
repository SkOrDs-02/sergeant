/** @vitest-environment jsdom */
/**
 * DashboardSection не мала жодного тесту (аудит 2026-08-08, знахідка L-10)
 * — покриваємо базову структуру плюс регрес-тест на видалення мертвого
 * тумблера «Показувати підказки».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ToastContainer } from "@shared/components/ui/Toast";
import { ToastProvider } from "@shared/hooks/useToast";
import type { UserPreferences } from "@shared/api";
import {
  DASHBOARD_DENSITY_EVENT,
  getActiveModules,
  STORAGE_KEYS,
} from "@sergeant/shared";
import { safeReadStringLS, webKVStore } from "@shared/lib/storage/storage";

// pushActiveModules (activeModulesSync.ts) fire-and-forgets
// `meApi.updatePreferences` на кожному кліку по модулю — без мока цей
// мережевий виклик падає у jsdom (немає fetch-мока) і засмічує вивід
// тестів unhandled-rejection попередженнями.
vi.mock("@shared/api", () => {
  const prefs: UserPreferences = {
    analytics: true,
    aiMemory: true,
    pushNotifications: false,
    sergeantNudges: false,
    healthDataConsent: false,
    activeModules: null,
    updatedAt: null,
  };
  return {
    meApi: {
      updatePreferences: vi.fn().mockResolvedValue(prefs),
    },
  };
});

import { DashboardSection } from "./DashboardSection";

function renderSection(): ReturnType<typeof render> {
  return render(
    <ToastProvider>
      <DashboardSection />
      <ToastContainer />
    </ToastProvider>,
  );
}

/**
 * `SettingsGroup` монтується згорнутою (`defaultOpen = false`), а згорнутий
 * вміст несе `inert` + `aria-hidden="true"` — інваріант L-7
 * (`useInertWhileCollapsed`). Тому запити за роллю його НЕ бачать, і це не
 * вада запиту, а рівно та гарантія tab-порядку, яку ми ставили навмисно.
 * Розгортаємо секцію так само, як це робить людина.
 *
 * Тести вище шукають текст (`getByText`), який `aria-hidden` не фільтрує —
 * тому вони й проходять без розкриття.
 */
function openSection() {
  fireEvent.click(screen.getByRole("button", { name: "Дашборд" }));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("DashboardSection", () => {
  it("renders the section header and both subgroups", () => {
    renderSection();
    expect(screen.getByText("Дашборд")).toBeInTheDocument();
    expect(screen.getByText("Вигляд")).toBeInTheDocument();
    expect(screen.getByText("Розділи на головній")).toBeInTheDocument();
  });

  it("L-10: does not render the dead «Показувати підказки» toggle", () => {
    // Регрес: жоден web-код не читав `showHints` з HUB_PREFS (перевірено
    // grep-ом по apps/web/src перед видаленням) — тумблер писав у
    // сховище значення, які ніхто не застосовував. Без фіксу цей текст
    // усе ще в DOM і тест падає.
    renderSection();
    expect(screen.queryByText("Показувати підказки")).not.toBeInTheDocument();
  });

  it("still renders the remaining «Вигляд» toggles untouched by the L-10 removal", () => {
    renderSection();
    expect(screen.getByText("Чистий режим")).toBeInTheDocument();
    expect(screen.getByText("Адаптивний порядок")).toBeInTheDocument();
    expect(screen.getByText("Картка «Сьогодні»")).toBeInTheDocument();
    expect(screen.getByText("Що зараз важливо")).toBeInTheDocument();
    expect(screen.getByText("Мотиваційний підпис")).toBeInTheDocument();
  });

  it("defaults «Адаптивний порядок» to on when no pref is stored", () => {
    renderSection();
    openSection();
    // Пошук за доступним іменем, не за `closest("label")` — рядок
    // `ToggleRow` більше не `<label>` навколо тумблера (фікс axe
    // `label: Form elements must have labels` на `/settings`).
    const toggle = screen.getByRole("switch", { name: "Адаптивний порядок" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("flips «Чистий режим» on click and persists it to HUB_PREFS", () => {
    renderSection();
    openSection();
    const toggle = screen.getByRole("switch", { name: "Чистий режим" });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "true");
    const stored = JSON.parse(localStorage.getItem("hub_prefs_v1") ?? "{}");
    expect(stored.calmMode).toBe(true);
  });

  it("toggles a dashboard module checkbox and blocks removing the last active one", () => {
    renderSection();
    // `SettingsGroup` «Дашборд» стартує згорнутою — колапсований вміст
    // отримує `inert`, і `getByRole`/`getAllByRole` ігнорують inert-
    // піддерево (на відміну від `getByText`, яке його бачить). Розгортаємо,
    // як реальний користувач. «Розділи на головній» більше не другий
    // рівень акордеона (Варіант A, §0.1) — її вміст видимий одразу.
    fireEvent.click(screen.getByText("Дашборд"));

    // `role="checkbox"` тут матчить лише plain-чекбокси зі списку модулів —
    // тумблери «Вигляд» мають явний `role="switch"` і в цей запит не
    // потрапляють.
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThan(1);

    // Вимикаємо всі модулі, крім одного — останній лишається заблокованим
    // (SettingsSubGroup «Розділи на головній»: «принаймні один активний»).
    for (let i = 0; i < checkboxes.length - 1; i += 1) {
      fireEvent.click(checkboxes[i]!);
    }
    // Ревʼю знахідка #5 (2026-08-08): назва тесту обіцяла "toggles a
    // checkbox", але жодне поле фактично не перевіряло, що клік справді
    // зняв прапорець і що вибір ліг у `webKVStore`. Ловимо обидва.
    expect(checkboxes[0]).not.toBeChecked();
    expect(getActiveModules(webKVStore)).toHaveLength(1);

    const lastChecked = checkboxes[checkboxes.length - 1]!;
    expect(lastChecked).toBeChecked();
    fireEvent.click(lastChecked);
    // Стан не міняється: warning-тост блокує зняття останнього активного.
    expect(lastChecked).toBeChecked();
    expect(getActiveModules(webKVStore)).toHaveLength(1);

    // Той самий user-visible сигнал, без якого клік виглядає як зламана
    // кнопка (класична знахідка №1 цього репо, per review) — гард без
    // видимого warning-тоста непомітний для користувача.
    const toastMsg = screen.getByText(
      "Щонайменше один модуль має бути активним",
    );
    expect(toastMsg.closest('[data-toast-type="warning"]')).toBeTruthy();
  });

  // §6 аудиту 2026-08-08: «DashboardSection цілком» без тестів. Секцію
  // покрито вище, але блок щільності (`DASHBOARD_DENSITIES`) не мав
  // ЖОДНОГО тесту — ні дефолту, ні кліку, ні персисту, ні події, на яку
  // підписаний дашборд для live-ресайзу карток без reload.
  it("density selector: defaults to «Комфортно», persists a click to storage and broadcasts DASHBOARD_DENSITY_EVENT", () => {
    const listener = vi.fn();
    window.addEventListener(DASHBOARD_DENSITY_EVENT, listener);
    try {
      renderSection();

      const comfortableBtn = screen.getByText("Комфортно").closest("button");
      const compactBtn = screen.getByText("Компактно").closest("button");
      if (!comfortableBtn || !compactBtn) {
        throw new Error("density buttons missing");
      }
      // Дефолт без збереженого значення — `DEFAULT_DASHBOARD_DENSITY`
      // ("comfortable"), не перша чи остання кнопка списку.
      expect(comfortableBtn).toHaveAttribute("aria-pressed", "true");
      expect(compactBtn).toHaveAttribute("aria-pressed", "false");

      fireEvent.click(compactBtn);

      expect(compactBtn).toHaveAttribute("aria-pressed", "true");
      expect(comfortableBtn).toHaveAttribute("aria-pressed", "false");
      // Персист і подія — це те, на що підписані інші споживачі (сам
      // хабовий грід читає STORAGE_KEYS.DASHBOARD_DENSITY на старті і
      // слухає подію для live-ресайзу без перезавантаження сторінки);
      // без обох секція виглядає так, ніби змінилась, але сусідній грід
      // про це не дізнається, доки юзер не оновить сторінку.
      expect(safeReadStringLS(STORAGE_KEYS.DASHBOARD_DENSITY)).toBe("compact");
      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0]?.[0] as CustomEvent<string>;
      expect(event.detail).toBe("compact");
    } finally {
      window.removeEventListener(DASHBOARD_DENSITY_EVENT, listener);
    }
  });

  // Наявний тест "toggles a dashboard module checkbox…" вимикає модулі, але
  // ніколи не вмикає їх назад — гілка `ALL_MODULES.filter(x => prev.includes(x)
  // || x === id)` (повторне ввімкнення, збереження порядку ALL_MODULES) не
  // мала покриття взагалі.
  it("re-enables a previously disabled module and restores it to the active set", () => {
    renderSection();
    fireEvent.click(screen.getByText("Дашборд"));

    const checkboxes = screen.getAllByRole("checkbox");
    const target = checkboxes[0]!;
    expect(target).toBeChecked();

    fireEvent.click(target);
    expect(target).not.toBeChecked();
    const afterDisable = getActiveModules(webKVStore);
    expect(afterDisable).toHaveLength(checkboxes.length - 1);

    fireEvent.click(target);
    expect(target).toBeChecked();
    const afterReEnable = getActiveModules(webKVStore);
    expect(afterReEnable).toHaveLength(checkboxes.length);
  });
});
