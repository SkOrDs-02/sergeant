/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ChatQuickActions } from "./ChatQuickActions";
import { getQuickActionCapabilities } from "@sergeant/shared";

const QUICK_ACTIONS = getQuickActionCapabilities();

afterEach(() => cleanup());

function setup(
  overrides: Partial<React.ComponentProps<typeof ChatQuickActions>> = {},
) {
  const onSend = vi.fn();
  const onPrefill = vi.fn();
  const utils = render(
    <ChatQuickActions
      activeModule={null}
      loading={false}
      online={true}
      onSend={onSend}
      onPrefill={onPrefill}
      {...overrides}
    />,
  );
  return { onSend, onPrefill, ...utils };
}

describe("ChatQuickActions", () => {
  it("рендерить chip-и для top-сценаріїв", () => {
    setup();
    // Hub-сценарій має бути серед видимих
    expect(
      screen.getByTestId("chat-quick-action-morning_briefing"),
    ).toBeTruthy();
    expect(screen.getByTestId("chat-quick-action-daily_summary")).toBeTruthy();
  });

  it("повний prompt → onSend, не onPrefill", () => {
    const { onSend, onPrefill } = setup();
    fireEvent.click(screen.getByTestId("chat-quick-action-morning_briefing"));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0]?.[0]).toMatch(/брифінг/i);
    expect(onPrefill).not.toHaveBeenCalled();
  });

  it("неповний prompt (закінчується на ': ') → onPrefill, не onSend", () => {
    const { onSend, onPrefill } = setup({ activeModule: "finyk" });
    fireEvent.click(screen.getByTestId("chat-quick-action-create_transaction"));
    expect(onPrefill).toHaveBeenCalledTimes(1);
    expect(onPrefill.mock.calls[0]?.[0]).toMatch(/^Додай витрату:\s$/);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("loading=true → всі chip-и disabled", () => {
    setup({ loading: true });
    const briefing = screen.getByTestId("chat-quick-action-morning_briefing");
    expect((briefing as HTMLButtonElement).disabled).toBe(true);
  });

  it("offline + requiresOnline → chip disabled з пояснювальним title", () => {
    setup({ online: false });
    const briefing = screen.getByTestId(
      "chat-quick-action-morning_briefing",
    ) as HTMLButtonElement;
    expect(briefing.disabled).toBe(true);
    expect(briefing.getAttribute("title")).toMatch(/зʼєднання/i);
  });

  it("кнопка «Ще» розгортає прихований список", () => {
    setup();
    const more = screen.queryByTestId("chat-quick-actions-more");
    if (!more) {
      // Якщо всі сценарії помістилися — скіп
      expect(QUICK_ACTIONS.length).toBeLessThanOrEqual(6);
      return;
    }
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
  });

  it("activeModule=fizruk підіймає сценарії Фізрука першими", () => {
    setup({ activeModule: "fizruk" });
    // Перші два testid у DOM-порядку мають належати fizruk
    const buttons = screen
      .getAllByRole("button")
      .filter((b) =>
        b.getAttribute("data-testid")?.startsWith("chat-quick-action-"),
      );
    const firstId = buttons[0]?.getAttribute("data-testid");
    expect(firstId).toMatch(/start_workout|log_set/);
  });
});
