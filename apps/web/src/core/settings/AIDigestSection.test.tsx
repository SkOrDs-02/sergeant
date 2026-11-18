/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("../insights/useWeeklyDigest", () => ({
  useWeeklyDigest: () => ({ digest: null, weekRange: "16 — 22 листоп." }),
}));

import { AIDigestSection } from "./AIDigestSection";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// С-3 (а), рішення власника 2026-11-18 (OD-30): автогенерація спрацьовує
// при першому відкритті головної після завершення тижня, а не лише в
// понеділок, тож налаштування більше не обіцяють «щопонеділка».
describe("AIDigestSection — текст автогенерації", () => {
  it("описує нову поведінку і не обіцяє понеділок", () => {
    render(<AIDigestSection />);
    expect(screen.getByText("Автогенерація звіту")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Перше відкриття головної після завершення тижня само збирає звіт за тиждень, що минув. Звіт не витрачає ліміт дій Сержанта.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/щопонеділка/)).toBeNull();
    // Під рядком «Поточний тиждень» слова «цей тиждень» читались як поточний.
    expect(screen.queryByText(/за цей тиждень/)).toBeNull();
  });

  it("абзац над тумблером без подвійного «і» і однозначно про тиждень, що минув", () => {
    render(<AIDigestSection />);
    expect(
      screen.getByText(
        "Тижневий аналіз прогресу від Сержанта по всіх модулях: фінанси, тренування, харчування та звички. Звіт за тиждень, що минув, збирається сам при першому відкритті головної. Він чекає там у блоці «Звіт тижня», там же його можна оновити.",
      ),
    ).toBeInTheDocument();
  });
});
