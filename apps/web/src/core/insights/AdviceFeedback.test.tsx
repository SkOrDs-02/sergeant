// @vitest-environment jsdom
/**
 * Контракт оцінки AI-поради (`ai_advice_reacted` з `helpful`/`not_helpful`).
 *
 * Що саме пінимо і чому:
 * - **без `adviceId` нічого не рендериться** — подія-сирота роздула б
 *   чисельник без знаменника `ai_advice_shown`;
 * - **оцінка остаточна** (рішення власника 2026-10-01): після вибору лишається
 *   тільки обрана іконка (натиснута) і «Дякую», друга кнопка зникає, зміни
 *   думки немає — тож на пораду летить рівно одна подія;
 * - **нова порада скидає стан** — інакше UI брехав би, що людина вже
 *   відповіла на те, чого не бачила.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const trackAdviceReactionMock = vi.fn();

vi.mock("../observability/adviceTelemetry", () => ({
  trackAdviceReaction: (...args: unknown[]) => trackAdviceReactionMock(...args),
}));

import { AdviceFeedback } from "./AdviceFeedback";

describe("AdviceFeedback", () => {
  beforeEach(() => {
    trackAdviceReactionMock.mockClear();
  });

  it("центрує іконку в кнопці, яку coarse-pointer розтягує до 44×44", () => {
    render(<AdviceFeedback adviceId="adv-1" />);

    for (const name of ["Порада корисна", "Порада не корисна"]) {
      const { className } = screen.getByRole("button", { name });
      expect(className).toContain("inline-flex");
      expect(className).toContain("items-center");
      expect(className).toContain("justify-center");
    }
  });

  it("не рендериться без adviceId", () => {
    const { container } = render(<AdviceFeedback adviceId={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("емітить helpful з id поради", async () => {
    const user = userEvent.setup();
    render(<AdviceFeedback adviceId="adv-1" />);

    await user.click(screen.getByRole("button", { name: "Порада корисна" }));

    expect(trackAdviceReactionMock).toHaveBeenCalledTimes(1);
    expect(trackAdviceReactionMock).toHaveBeenCalledWith("adv-1", "helpful");
  });

  it("емітить not_helpful з id поради", async () => {
    const user = userEvent.setup();
    render(<AdviceFeedback adviceId="adv-1" />);

    await user.click(screen.getByRole("button", { name: "Порада не корисна" }));

    expect(trackAdviceReactionMock).toHaveBeenCalledTimes(1);
    expect(trackAdviceReactionMock).toHaveBeenCalledWith(
      "adv-1",
      "not_helpful",
    );
  });

  it("до оцінки показує обидві іконки без «Дякую»", () => {
    render(<AdviceFeedback adviceId="adv-1" />);

    expect(
      screen.getByRole("button", { name: "Порада корисна" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: "Порада не корисна" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("Дякую")).not.toBeInTheDocument();
  });

  it("після 👍 лишає тільки натиснуту 👍 і «Дякую»; 👎 зникає", async () => {
    const user = userEvent.setup();
    render(<AdviceFeedback adviceId="adv-1" />);

    await user.click(screen.getByRole("button", { name: "Порада корисна" }));

    expect(
      screen.getByRole("button", { name: "Порада корисна" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.queryByRole("button", { name: "Порада не корисна" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Дякую")).toBeInTheDocument();
  });

  it("після 👎 лишає тільки натиснуту 👎 і «Дякую»; 👍 зникає", async () => {
    const user = userEvent.setup();
    render(<AdviceFeedback adviceId="adv-1" />);

    await user.click(screen.getByRole("button", { name: "Порада не корисна" }));

    expect(
      screen.getByRole("button", { name: "Порада не корисна" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.queryByRole("button", { name: "Порада корисна" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Дякую")).toBeInTheDocument();
  });

  it("не емітить повторно: клік по обраній іконці — no-op, зміни думки немає", async () => {
    const user = userEvent.setup();
    render(<AdviceFeedback adviceId="adv-1" />);
    const helpful = screen.getByRole("button", { name: "Порада корисна" });

    await user.click(helpful);
    await user.click(helpful);

    expect(trackAdviceReactionMock).toHaveBeenCalledTimes(1);
    expect(helpful).toHaveAttribute("aria-pressed", "true");
    // Змінити думку нема чим: протилежної кнопки в DOM немає.
    expect(
      screen.queryByRole("button", { name: "Порада не корисна" }),
    ).not.toBeInTheDocument();
  });

  it("обрана кнопка лишається тим самим вузлом і тримає фокус", async () => {
    const user = userEvent.setup();
    render(<AdviceFeedback adviceId="adv-1" />);
    const notHelpful = screen.getByRole("button", {
      name: "Порада не корисна",
    });

    await user.click(notHelpful);

    // Прихована сусідка (перша в DOM) не має зсувати/пересоздавати обрану —
    // інакше клавіатурний фокус упаде на body.
    expect(screen.getByRole("button", { name: "Порада не корисна" })).toBe(
      notHelpful,
    );
    expect(notHelpful).toHaveFocus();
  });

  it("скидає стан, коли приходить інша порада: знову обидві іконки без підсвітки", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AdviceFeedback adviceId="adv-1" />);
    await user.click(screen.getByRole("button", { name: "Порада корисна" }));
    expect(
      screen.getByRole("button", { name: "Порада корисна" }),
    ).toHaveAttribute("aria-pressed", "true");

    rerender(<AdviceFeedback adviceId="adv-2" />);

    // Головне тут: оцінка попередньої поради не має виглядати як відповідь
    // на нову — інакше людина «вже відповіла» на те, чого не бачила.
    expect(
      screen.getByRole("button", { name: "Порада корисна" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: "Порада не корисна" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("Дякую")).not.toBeInTheDocument();
  });
});
