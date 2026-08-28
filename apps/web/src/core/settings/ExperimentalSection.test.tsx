// @vitest-environment jsdom
//
// PR-36 ux-roast 2026-Q2 / §9.3 — гейт перед увімкненням expermental-toggles:
// до першого ack чекбокс видно, тумблери ігнорують зміну стану; після ack
// чекбокс зникає, тумблери поводяться як звичайна група.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  __experimentalAcknowledgmentStoreForTests,
  ExperimentalSection,
} from "./ExperimentalSection";
import { __flagsStoreForTests, FLAG_REGISTRY } from "../lib/featureFlags";

const COPY = {
  // V-7 (2026-08-08): було "Додаткові можливості" — перейменовано на
  // "Експериментальні функції", щоб не дублювати сусідню секцію
  // «Можливості» (settingsSectionsCatalog.ts). Title тепер читається з
  // каталогу (`settingsSectionTitle("experimental")`), тож цей рядок
  // мусить лишатись синхронним з `SETTINGS_SECTIONS_CATALOG`.
  title: "Експериментальні функції",
  warningBanner:
    "Ці можливості можуть змінюватися або працювати нестабільно. Увімкни їх лише якщо готовий швидко вимкнути назад.",
  optInLabel: "Я розумію, що це ранні можливості",
};

function expandSection(): void {
  fireEvent.click(screen.getByText(COPY.title));
}

beforeEach(() => {
  localStorage.clear();
  __experimentalAcknowledgmentStoreForTests.reset();
  __flagsStoreForTests.reset();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ExperimentalSection (PR-36 / §9.3)", () => {
  it("does not duplicate the canonical app-lock control from Privacy", () => {
    render(<ExperimentalSection />);
    expandSection();

    expect(screen.queryByText(/Блокування додатку \(PIN\)/i)).toBeNull();
  });

  it("renders the warning banner copy from the i18n catalog", () => {
    render(<ExperimentalSection />);
    expandSection();

    expect(screen.getByText(COPY.warningBanner)).toBeTruthy();
    // banner sits as a `role="note"` so screen-readers announce it as
    // ancillary content, not a pushed alert.
    const note = screen.getByRole("note");
    expect(note.textContent).toContain(COPY.warningBanner);
  });

  it("requires the opt-in checkbox before any toggle can flip", () => {
    render(<ExperimentalSection />);
    expandSection();

    // Acceptance: «Перший раз — checkbox обовʼязковий…»
    expect(screen.getByText(COPY.optInLabel)).toBeTruthy();
    expect(screen.getByTestId("experimental-opt-in")).toBeTruthy();

    const firstFlag = FLAG_REGISTRY.find((f) => f.experimental);
    if (!firstFlag) throw new Error("expected at least one experimental flag");

    // Tap the first toggle while still locked — нічого не міняється у store.
    // Пошук за доступним іменем, не за `closest("label")` — рядок
    // `ToggleRow` більше не `<label>` навколо тумблера (фікс axe
    // `label: Form elements must have labels` на `/settings`).
    const toggleInput = screen.getByRole("switch", { name: firstFlag.label });
    fireEvent.click(toggleInput);

    expect(__flagsStoreForTests.get()[firstFlag.id]).toBeUndefined();
  });

  it("styles the warning banner with the real `warning` design token, not the nonexistent `warn`", () => {
    // V-5 (аудит P2): банер малювався класами `border-warn/40 bg-warn/10
    // text-warn` — токена `warn` немає в дизайн-системі (packages/design-
    // tokens/tailwind-preset.js реєструє лише `warning`/`warning-strong`),
    // тож Tailwind не генерував жодного правила і банер рендерився без
    // кольору/бордера. Регрес-тест ловить повернення "warn"-варіанту по
    // класах DOM-вузлів, бо jsdom не рахує реальний CSS.
    render(<ExperimentalSection />);
    expandSection();

    const note = screen.getByRole("note");
    expect(note.className).toMatch(/\bborder-warning\/40\b/);
    expect(note.className).toMatch(/\bbg-warning\/10\b/);
    expect(note.className).not.toMatch(/\bborder-warn\/40\b/);
    expect(note.className).not.toMatch(/\bbg-warn\/10\b/);

    const icon = note.querySelector("svg");
    if (!icon) throw new Error("warning icon missing");
    expect(icon.getAttribute("class") ?? "").toMatch(/\btext-warning\b/);
    expect(icon.getAttribute("class") ?? "").not.toMatch(/\btext-warn\b/);

    // Ревʼю знахідка #3 (2026-08-08): голий `text-warning` як foreground —
    // насичений #f59e0b, ~1.8:1 на світлому фоні. Іконка мусить нести
    // `-strong` companion (панівний патерн репо: SyncIndicator, ProfilePage,
    // TodayFocusCard, …), інакше попереджувальний гліф ледь видимий.
    expect(icon.getAttribute("class") ?? "").toMatch(/\btext-warning-strong\b/);
    expect(icon.getAttribute("class") ?? "").toMatch(/dark:text-warning\b/);
  });

  it("hides the opt-in once acknowledged and persists the ack", () => {
    render(<ExperimentalSection />);
    expandSection();

    // «… потім toggle відкритий»: ack stays in storage, поки користувач не
    // очистив сайт-дату.
    fireEvent.click(screen.getByTestId("experimental-opt-in"));

    expect(screen.queryByText(COPY.optInLabel)).toBeNull();
    expect(screen.queryByTestId("experimental-opt-in")).toBeNull();
    expect(__experimentalAcknowledgmentStoreForTests.get().acknowledged).toBe(
      true,
    );

    // Тумблер тепер реагує на клік.
    const firstFlag = FLAG_REGISTRY.find((f) => f.experimental);
    if (!firstFlag) throw new Error("expected at least one experimental flag");
    const toggleInput = screen.getByRole("switch", { name: firstFlag.label });
    fireEvent.click(toggleInput);

    expect(__flagsStoreForTests.get()[firstFlag.id]).toBe(
      !firstFlag.defaultValue,
    );
  });
});
