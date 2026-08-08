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
import { getActiveModules } from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";

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
    const row = screen.getByText("Адаптивний порядок").closest("label");
    if (!row) throw new Error("toggle row missing");
    const toggle = row.querySelector('[role="switch"]');
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("flips «Чистий режим» on click and persists it to HUB_PREFS", () => {
    renderSection();
    const row = screen.getByText("Чистий режим").closest("label");
    if (!row) throw new Error("toggle row missing");
    const toggle = row.querySelector('[role="switch"]');
    if (!toggle) throw new Error("switch missing");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "true");
    const stored = JSON.parse(localStorage.getItem("hub_prefs_v1") ?? "{}");
    expect(stored.calmMode).toBe(true);
  });

  it("toggles a dashboard module checkbox and blocks removing the last active one", () => {
    renderSection();
    // Обидва рівні акордеона (SettingsGroup «Дашборд» і SettingsSubGroup
    // «Розділи на головній») стартують згорнутими — колапсований вміст
    // отримує `inert`, і `getByRole`/`getAllByRole` ігнорують inert-
    // піддерево (на відміну від `getByText`, яке його бачить). Розгортаємо
    // обидва рівні, як реальний користувач.
    fireEvent.click(screen.getByText("Дашборд"));
    fireEvent.click(screen.getByText("Розділи на головній"));

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
});
