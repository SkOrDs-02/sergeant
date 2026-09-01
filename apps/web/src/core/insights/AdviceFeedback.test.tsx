// @vitest-environment jsdom
/**
 * Контракт оцінки AI-поради (`ai_advice_reacted` з `helpful`/`not_helpful`).
 *
 * Що саме пінимо і чому:
 * - **без `adviceId` нічого не рендериться** — подія-сирота роздула б
 *   чисельник без знаменника `ai_advice_shown`;
 * - **повторний клік по вже обраній оцінці — no-op**, зміна думки — окрема
 *   подія (це різні факти, а не виправлення одруку);
 * - **нова порада скидає підсвітку** — інакше UI брехав би, що людина вже
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

  it("не рендериться без adviceId", () => {
    const { container } = render(<AdviceFeedback adviceId={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("емітить helpful і not_helpful з id поради", async () => {
    const user = userEvent.setup();
    render(<AdviceFeedback adviceId="adv-1" />);

    await user.click(screen.getByRole("button", { name: "Порада корисна" }));
    expect(trackAdviceReactionMock).toHaveBeenCalledWith("adv-1", "helpful");

    // Зміна думки — окремий факт, а не виправлення: подія має полетіти.
    await user.click(screen.getByRole("button", { name: "Порада не корисна" }));
    expect(trackAdviceReactionMock).toHaveBeenLastCalledWith(
      "adv-1",
      "not_helpful",
    );
    expect(trackAdviceReactionMock).toHaveBeenCalledTimes(2);
  });

  it("не емітить повторно ту саму оцінку", async () => {
    const user = userEvent.setup();
    render(<AdviceFeedback adviceId="adv-1" />);
    const helpful = screen.getByRole("button", { name: "Порада корисна" });

    await user.click(helpful);
    await user.click(helpful);

    expect(trackAdviceReactionMock).toHaveBeenCalledTimes(1);
    expect(helpful).toHaveAttribute("aria-pressed", "true");
  });

  it("скидає підсвітку, коли приходить інша порада", async () => {
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
    expect(screen.queryByText("Дякую")).not.toBeInTheDocument();
  });
});
