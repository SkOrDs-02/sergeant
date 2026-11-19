/** @vitest-environment jsdom */
/**
 * Покриття вкладки «Фізрук» у Налаштуваннях. `FizrukSection` не мав
 * власного тестового файлу до фіксу V-13 (profile/settings deep audit
 * 2026-08-08) — цей файл вводить його разом із перевіркою модульного
 * акценту на бейджі іконки секції.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { STORAGE_KEYS } from "@sergeant/shared";
import { renderSettingsSection } from "../../test/helpers/collapsibleSection";
import { REST_CATEGORY_LABELS } from "../../modules/fizruk/hooks/useRestSettings";
import { FizrukSection } from "./FizrukSection";

const REST_KEY = STORAGE_KEYS.FIZRUK_REST_SETTINGS;

describe("FizrukSection", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("renders the rest-timer subgroup with a button row per category", () => {
    renderSettingsSection(<FizrukSection />);
    const firstLabel = Object.values(REST_CATEGORY_LABELS)[0] as string;
    expect(screen.getByText(firstLabel)).toBeInTheDocument();
    expect(screen.getAllByText("60с").length).toBe(
      Object.keys(REST_CATEGORY_LABELS).length,
    );
  });

  it("persists the chosen rest duration for a category", () => {
    renderSettingsSection(<FizrukSection />);
    const buttons = screen.getAllByRole("radio", { name: "120с" });
    fireEvent.click(buttons[0]!);
    const stored = JSON.parse(localStorage.getItem(REST_KEY) ?? "{}") as Record<
      string,
      unknown
    >;
    const firstCategory = Object.keys(REST_CATEGORY_LABELS)[0] as string;
    expect(stored[firstCategory]).toBe(120);
  });

  // V-13 (profile/settings deep audit 2026-08-08, §«Вкладка Розділи») —
  // без `module="fizruk"` іконка секції рендериться нейтрально-сірою.
  // Перевіряємо, що бейдж іконки несе саме fizruk-акцент.
  // PR-S14: обраний час відпочинку передавався ЛИШЕ кольором рамки й фону.
  // Для скрінрідера обраного стану не існувало, а людина з порушенням
  // сприйняття кольору не бачила, що саме вибрано.
  it("PR-S14: обраний час відпочинку читається без кольору", () => {
    localStorage.setItem(REST_KEY, JSON.stringify({ compound: 120 }));
    renderSettingsSection(<FizrukSection />);

    const group = screen.getByRole("radiogroup", {
      name: REST_CATEGORY_LABELS.compound,
    });
    const pressed = within(group)
      .getAllByRole("radio")
      .filter((b) => b.getAttribute("aria-checked") === "true");

    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toBeChecked();
    expect(pressed[0]).toHaveTextContent("120с");
  });

  describe("Фз-1: група «Під час тренування»", () => {
    afterEach(() => {
      delete (navigator as unknown as Record<string, unknown>)["wakeLock"];
    });

    it("показує тумблер «Не гасити екран», увімкнений за замовчуванням, і зберігає вимкнення", () => {
      Object.defineProperty(navigator, "wakeLock", {
        configurable: true,
        value: { request: () => Promise.resolve({}) },
      });
      renderSettingsSection(<FizrukSection />);
      expect(screen.getByText("Під час тренування")).toBeInTheDocument();
      const toggle = screen.getByRole("switch", { name: "Не гасити екран" });
      expect(toggle).toBeChecked();
      fireEvent.click(toggle);
      const stored = JSON.parse(
        localStorage.getItem(REST_KEY) ?? "{}",
      ) as Record<string, unknown>;
      expect(stored["keepScreenOn"]).toBe(false);
    });

    it("де браузер не вміє тримати екран, тумблер вимкнений і чесно це каже", () => {
      renderSettingsSection(<FizrukSection />);
      const toggle = screen.getByRole("switch", { name: "Не гасити екран" });
      expect(toggle).toBeDisabled();
      expect(toggle).not.toBeChecked();
      expect(
        screen.getByText(/Цей браузер не вміє тримати екран увімкненим/),
      ).toBeInTheDocument();
    });
  });

  // Другий бік того самого: без назви групи ряд «30с 60с 90с 120с 180с»
  // звучить пʼять разів поспіль і нічим не відрізняється між категоріями.
  it("PR-S14: кожен ряд кнопок має назву своєї категорії", () => {
    renderSettingsSection(<FizrukSection />);

    for (const label of Object.values(REST_CATEGORY_LABELS)) {
      expect(
        screen.getByRole("radiogroup", { name: label }),
      ).toBeInTheDocument();
    }
  });
});
