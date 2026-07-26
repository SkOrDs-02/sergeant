/** @vitest-environment jsdom */
/**
 * Last validated: 2026-07-26
 * Status: Active
 *
 * AI-CONTEXT: попередження про фото — єдиний захист на шляху, який
 * неможливо замаскувати. Його два способи зламатись протилежні: не
 * показатись узагалі (людина не знає, куди їде кадр) або не зникати
 * після підтвердження (банер, який не читають). Тестуємо обидва.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { PhotoAnalyzeCard } from "./PhotoAnalyzeCard";

const NOTICE = /Куди їде фото/;

function renderCard() {
  return render(
    <PhotoAnalyzeCard
      analyzePhoto={() => {}}
      fileRef={{ current: null }}
      onPickPhoto={() => {}}
      fmtMacro={(v) => String(v ?? "—")}
      portionGrams=""
      setPortionGrams={() => {}}
      refinePhoto={() => {}}
      answers={{}}
      setAnswers={() => {}}
    />,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("попередження про фото", () => {
  it("показується, поки людина його не підтвердила", () => {
    renderCard();
    expect(screen.getByText(NOTICE)).toBeTruthy();
    // Не просто заголовок: суть попередження — куди саме їде кадр.
    expect(screen.getByText(/Anthropic/)).toBeTruthy();
  });

  it("зникає після «Зрозуміло» і не повертається при наступному відкритті", () => {
    const first = renderCard();
    fireEvent.click(screen.getByText("Зрозуміло"));
    expect(screen.queryByText(NOTICE)).toBeNull();

    // Другий монтаж — саме тут ловиться неузгоджена пара read/write:
    // якщо писати JSON, а читати рядком, банер повертався б назавжди.
    first.unmount();
    renderCard();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});
