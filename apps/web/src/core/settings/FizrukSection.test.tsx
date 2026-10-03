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
    const buttons = screen.getAllByText("90с");
    fireEvent.click(buttons[0]!);
    const stored = JSON.parse(localStorage.getItem(REST_KEY) ?? "{}") as Record<
      string,
      unknown
    >;
    const firstCategory = Object.keys(REST_CATEGORY_LABELS)[0] as string;
    expect(stored[firstCategory]).toBe(90);
  });

  // V-13 (profile/settings deep audit 2026-08-08, §«Вкладка Розділи») —
  // без `module="fizruk"` іконка секції рендериться нейтрально-сірою.
  // Перевіряємо, що бейдж іконки несе саме fizruk-акцент.
  it("renders the section glyph with the fizruk module accent (без тонованого квадрата, огляд 2026-09-04)", () => {
    const { container } = renderSettingsSection(<FizrukSection />);
    const badge = container.querySelector(`.text-${"fizruk"}`);
    expect(badge).not.toBeNull();
  });

  // PR-S14: обраний час відпочинку передавався ЛИШЕ кольором рамки й фону.
  // Для скрінрідера обраного стану не існувало, а людина з порушенням
  // сприйняття кольору не бачила, що саме вибрано.
  it("PR-S14: обраний час відпочинку читається без кольору", () => {
    localStorage.setItem(REST_KEY, JSON.stringify({ compound: 120 }));
    renderSettingsSection(<FizrukSection />);

    const group = screen.getByRole("group", {
      name: REST_CATEGORY_LABELS.compound,
    });
    const pressed = within(group)
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true");

    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveTextContent("120с");
  });

  // Другий бік того самого: без назви групи ряд «30с 60с 90с 120с 180с»
  // звучить пʼять разів поспіль і нічим не відрізняється між категоріями.
  it("PR-S14: кожен ряд кнопок має назву своєї категорії", () => {
    renderSettingsSection(<FizrukSection />);

    for (const label of Object.values(REST_CATEGORY_LABELS)) {
      expect(screen.getByRole("group", { name: label })).toBeInTheDocument();
    }
  });
});
