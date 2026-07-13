/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ANALYTICS_EVENTS } from "@sergeant/shared";
import { ToastProvider } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import { FeedbackDialog } from "./FeedbackDialog";

const { trackEventMock } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
}));

vi.mock("../observability/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

function renderDialog(open = true) {
  const onClose = vi.fn();
  render(
    <ToastProvider>
      <FeedbackDialog open={open} onClose={onClose} />
    </ToastProvider>,
  );
  return { onClose };
}

describe("FeedbackDialog", () => {
  beforeEach(() => {
    trackEventMock.mockClear();
  });

  it("shows an inline error on empty submit without firing the event", () => {
    renderDialog();

    fireEvent.click(
      screen.getByRole("button", { name: messages.feedback.submit }),
    );

    expect(
      trackEventMock.mock.calls.some(
        ([name]) => name === ANALYTICS_EVENTS.FEEDBACK_SUBMITTED,
      ),
    ).toBe(false);
    expect(screen.getByText(messages.feedback.emptyError)).toBeInTheDocument();
  });

  it("fires FEEDBACK_SUBMITTED with category, message and page context", () => {
    renderDialog();

    fireEvent.click(
      screen.getByRole("tab", { name: messages.feedback.categoryBug }),
    );
    fireEvent.change(screen.getByLabelText(messages.feedback.messageLabel), {
      target: { value: "Кнопка не працює" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: messages.feedback.submit }),
    );

    expect(trackEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.FEEDBACK_SUBMITTED,
      expect.objectContaining({
        category: "bug",
        message: "Кнопка не працює",
        has_page_context: true,
      }),
    );
    const payload = trackEventMock.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(payload["page"]).toEqual(expect.any(String));
    expect(payload["viewport"]).toMatch(/^\d+x\d+$/);
  });

  it("updates the textarea placeholder when the category tab changes", () => {
    renderDialog();

    const textarea = screen.getByLabelText(
      messages.feedback.messageLabel,
    ) as HTMLTextAreaElement;
    expect(textarea.placeholder).toBe(messages.feedback.placeholderIdea);

    fireEvent.click(
      screen.getByRole("tab", { name: messages.feedback.categoryBug }),
    );
    expect(textarea.placeholder).toBe(messages.feedback.placeholderBug);

    fireEvent.click(
      screen.getByRole("tab", { name: messages.feedback.categoryOther }),
    );
    expect(textarea.placeholder).toBe(messages.feedback.placeholderOther);
  });

  it("trims the message and calls onClose on successful submit", () => {
    const { onClose } = renderDialog();

    fireEvent.change(screen.getByLabelText(messages.feedback.messageLabel), {
      target: { value: "  Ідея для покращення  " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: messages.feedback.submit }),
    );

    const payload = trackEventMock.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(payload["message"]).toBe("Ідея для покращення");
    expect(payload["length"]).toBe("Ідея для покращення".length);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
