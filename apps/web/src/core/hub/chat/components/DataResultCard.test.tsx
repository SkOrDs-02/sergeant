/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DataResultCard } from "./DataResultCard";

describe("DataResultCard (talk-to-your-data PR4)", () => {
  it("рендерить headline + breakdown-бари для aggregate_spending", () => {
    const result =
      "Витрати за 2026-05-01 — 2026-05-31: 3540 грн усього (59 транзакц.). " +
      "Розбивка за категоріями: Кафе: 2340 грн (47); Транспорт: 1200 грн (12)";
    render(
      <DataResultCard
        toolName="aggregate_spending"
        result={result}
        title="Розбивка витрат"
      />,
    );

    const card = screen.getByTestId("chat-data-card-aggregate_spending");
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent("Розбивка витрат");
    // headline (prefix before the breakdown list).
    expect(card).toHaveTextContent("3540 грн усього");
    // breakdown rows with their values.
    expect(within(card).getByText("Кафе")).toBeInTheDocument();
    expect(within(card).getByText("Транспорт")).toBeInTheDocument();
    expect(within(card).getByText("2340 грн (47)")).toBeInTheDocument();
    expect(within(card).getByText("1200 грн (12)")).toBeInTheDocument();
  });

  it("рендерить metrics із багаторядкового exercise_progress", () => {
    const result = [
      'Прогрес "жим лежачи" за 90 днів (6 сесій):',
      "Макс. вага: 60 → 75 кг (+15)",
      "Об'єм: 2400 → 3600 кг×повт (+50%)",
      "Найкраще: 75 кг, об'єм 3600 кг×повт",
    ].join("\n");
    render(
      <DataResultCard
        toolName="exercise_progress"
        result={result}
        title="Прогрес вправи"
      />,
    );

    const card = screen.getByTestId("chat-data-card-exercise_progress");
    // first line is the headline.
    expect(card).toHaveTextContent('Прогрес "жим лежачи" за 90 днів');
    // subsequent lines become metric label/value pairs.
    expect(within(card).getByText("Макс. вага")).toBeInTheDocument();
    expect(within(card).getByText("60 → 75 кг (+15)")).toBeInTheDocument();
    expect(within(card).getByText("Об'єм")).toBeInTheDocument();
  });

  it("рендерить compare_periods як headline без breakdown", () => {
    const result =
      "Витрати: A (2026-04-01 — 2026-04-30) = 5000 грн; " +
      "B (2026-03-01 — 2026-03-31) = 4200 грн. Різниця (A − B): +800 грн (+19.0%).";
    render(
      <DataResultCard
        toolName="compare_periods"
        result={result}
        title="Порівняння періодів"
      />,
    );

    const card = screen.getByTestId("chat-data-card-compare_periods");
    expect(card).toHaveTextContent("Різниця (A − B): +800 грн");
    // No `; key: value` breakdown list should be split out for compare.
    expect(within(card).queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("парсить listing-хвіст query_transactions у breakdown-рядки", () => {
    const result =
      "Знайдено 2 транзакц. на суму 320 грн: " +
      "m_1: 2026-05-01 · 120 грн · кава · Кафе; " +
      "m_2: 2026-05-02 · 200 грн · обід · Кафе";
    render(
      <DataResultCard
        toolName="query_transactions"
        result={result}
        title="Транзакції за запитом"
      />,
    );

    const card = screen.getByTestId("chat-data-card-query_transactions");
    expect(card).toHaveTextContent("Знайдено 2 транзакц. на суму 320 грн");
    const items = within(card).getAllByRole("listitem");
    expect(items.length).toBe(2);
    expect(items[0]).toHaveTextContent("m_1");
  });

  it("використовує warning-стиль і alert-іконку для failed", () => {
    render(
      <DataResultCard
        toolName="query_habits"
        result="Помилка: немає звичок"
        title="Статистика звичок — не вийшло"
        failed
      />,
    );

    const card = screen.getByTestId("chat-data-card-query_habits");
    expect(card.className).toContain("border-warning/30");
    expect(card).toHaveTextContent("Помилка: немає звичок");
  });

  it("має доступний aria-label з title + headline", () => {
    render(
      <DataResultCard
        toolName="nutrition_averages"
        result={"Середнє харчування за тиждень:\nКалорії: 2100 ккал/день"}
        title="Середнє харчування"
      />,
    );

    expect(
      screen.getByRole("status", {
        name: /Середнє харчування: Середнє харчування за тиждень/,
      }),
    ).toBeInTheDocument();
  });
});
