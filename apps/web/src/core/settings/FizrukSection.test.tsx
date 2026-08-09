/** @vitest-environment jsdom */
/**
 * Покриття вкладки «Фізрук» у Налаштуваннях. `FizrukSection` не мав
 * власного тестового файлу до фіксу V-13 (profile/settings deep audit
 * 2026-08-08) — цей файл вводить його разом із перевіркою модульного
 * акценту на бейджі іконки секції.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
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
  it("renders the section icon badge with the fizruk module accent", () => {
    const { container } = renderSettingsSection(<FizrukSection />);
    const badge = container.querySelector("svg")?.closest("span");
    expect(badge).not.toBeNull();
    expect(badge?.className).toContain("bg-fizruk-soft");
    expect(badge?.className).toContain("border-fizruk-soft-border");
    expect(badge?.className).toContain("text-fizruk");
  });
});
