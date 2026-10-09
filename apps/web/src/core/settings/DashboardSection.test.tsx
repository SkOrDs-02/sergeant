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
    pushDailyCap: 2,
    healthDataConsent: false,
    activeModules: null,
    hubPrefs: null,
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
  fireEvent.click(screen.getByRole("button", { name: "Головна" }));
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
    expect(screen.getByText("Головна")).toBeInTheDocument();
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

  it("під віссю дії лишає два тумблери вигляду: «Порада й тиждень» і «Лічильник записів»", () => {
    renderSection();
    openSection();
    expect(
      screen.getByRole("switch", { name: "Порада й тиждень" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Лічильник записів" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Чистий режим")).toBeNull();
    expect(screen.queryByText("Адаптивний порядок")).toBeNull();
    expect(screen.queryByText("Картка «Сьогодні»")).toBeNull();
    expect(screen.queryByText("Що зараз важливо")).toBeNull();
    expect(
      screen.queryByRole("group", {
        name: "Щільність карток на головному екрані",
      }),
    ).toBeNull();
  });

  it("flips «Порада й тиждень» on click and persists it to HUB_PREFS", () => {
    renderSection();
    openSection();
    const toggle = screen.getByRole("switch", { name: "Порада й тиждень" });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "false");
    const stored = JSON.parse(localStorage.getItem("hub_prefs_v1") ?? "{}");
    expect(stored.showInsights).toBe(false);
  });

  it("toggles a dashboard module switch and blocks removing the last active one", () => {
    renderSection();
    // `SettingsGroup` «Головна» стартує згорнутою — колапсований вміст
    // отримує `inert`, і `getByRole`/`getAllByRole` ігнорують inert-
    // піддерево. Розгортаємо, як реальний користувач.
    fireEvent.click(screen.getByText("Головна"));

    // Огляд 2026-09-04: модулі — ті самі `Switch`, що й решта тумблерів
    // (доти тут був нативний чекбокс — другий словник для тієї ж дії).
    const switches = ["Фінік", "Фізрук", "Рутина", "Їжа"].map((label) =>
      screen.getByRole("switch", { name: label }),
    );

    // Вимикаємо всі модулі, крім одного — останній лишається заблокованим
    // («принаймні один активний»).
    for (let i = 0; i < switches.length - 1; i += 1) {
      fireEvent.click(switches[i]!);
    }
    expect(switches[0]).not.toBeChecked();
    expect(getActiveModules(webKVStore)).toHaveLength(1);

    const lastChecked = switches[switches.length - 1]!;
    expect(lastChecked).toBeChecked();
    fireEvent.click(lastChecked);
    // Стан не міняється: warning-тост блокує зняття останнього активного.
    expect(lastChecked).toBeChecked();
    expect(getActiveModules(webKVStore)).toHaveLength(1);

    const toastMsg = screen.getByText(
      "Щонайменше один модуль має бути активним",
    );
    expect(toastMsg.closest('[data-toast-type="warning"]')).toBeTruthy();
  });

  // Наявний тест "toggles a dashboard module checkbox…" вимикає модулі, але
  // ніколи не вмикає їх назад — гілка `ALL_MODULES.filter(x => prev.includes(x)
  // || x === id)` (повторне ввімкнення, збереження порядку ALL_MODULES) не
  // мала покриття взагалі.
  it("re-enables a previously disabled module and restores it to the active set", () => {
    renderSection();
    fireEvent.click(screen.getByText("Головна"));

    const checkboxes = ["Фінік", "Фізрук", "Рутина", "Їжа"].map((label) =>
      screen.getByRole("switch", { name: label }),
    );
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

  it("тумблери модулів лишаються — рейок бере з них приглушення", () => {
    renderSection();
    openSection();
    expect(screen.getByRole("switch", { name: "Фінік" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Їжа" })).toBeInTheDocument();
  });
});
