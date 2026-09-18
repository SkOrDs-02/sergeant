// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScanStatus, SLOW_HINT_DELAY_MS } from "./ScanStatus";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("ScanStatus", () => {
  it("оголошує поточну фазу як live-статус", () => {
    render(<ScanStatus label="Розпізнаю транзакції…" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Розпізнаю транзакції…",
    );
  });

  it("притримує пояснення затримки до порогу, далі показує", () => {
    render(
      <ScanStatus label="Розпізнаю чек…" slowHint="Ще працюю. Потерпи." />,
    );
    // На коротких сканах підказка не має блимати — інакше вона сама
    // починає читатись як «щось пішло не так».
    advance(SLOW_HINT_DELAY_MS - 1);
    expect(screen.queryByText("Ще працюю. Потерпи.")).not.toBeInTheDocument();

    advance(1);
    expect(screen.getByText("Ще працюю. Потерпи.")).toBeInTheDocument();
  });

  it("без slowHint нічого не доростає навіть після довгого очікування", () => {
    render(<ScanStatus label="Читаю виписку…" />);
    advance(SLOW_HINT_DELAY_MS * 3);
    expect(screen.getByRole("status")).toHaveTextContent("Читаю виписку…");
  });

  it("зміна фази НЕ перезапускає таймер підказки", () => {
    // Питання «чи воно живе» вимірюється загальним часом очікування:
    // якби таймер стартував заново на кожній фазі, підказка відсувалась
    // би саме тоді, коли вона найпотрібніша (§ докстрінг компонента).
    const { rerender } = render(
      <ScanStatus label="Готую фото…" slowHint="Великий скрін." />,
    );
    advance(SLOW_HINT_DELAY_MS - 100);
    rerender(
      <ScanStatus label="Розпізнаю транзакції…" slowHint="Великий скрін." />,
    );
    advance(100);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Розпізнаю транзакції…",
    );
    expect(screen.getByText("Великий скрін.")).toBeInTheDocument();
  });
});
