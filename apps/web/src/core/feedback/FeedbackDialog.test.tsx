/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ANALYTICS_EVENTS } from "@sergeant/shared";
import { ToastProvider } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import { FeedbackDialog } from "./FeedbackDialog";

const { trackEventMock, submitMock } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
  submitMock: vi.fn(),
}));

vi.mock("../observability/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

vi.mock("@shared/api", () => ({
  feedbackApi: { submit: (...args: unknown[]) => submitMock(...args) },
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

function typeMessage(text: string) {
  fireEvent.change(screen.getByLabelText(messages.feedback.messageLabel), {
    target: { value: text },
  });
}

function clickSubmit() {
  fireEvent.click(
    screen.getByRole("button", { name: messages.feedback.submit }),
  );
}

function submittedCalls() {
  return trackEventMock.mock.calls.filter(
    ([name]) => name === ANALYTICS_EVENTS.FEEDBACK_SUBMITTED,
  );
}

beforeEach(() => {
  trackEventMock.mockClear();
  submitMock.mockReset();
  submitMock.mockResolvedValue({ ok: true, id: 1 });
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
});

describe("FeedbackDialog", () => {
  it("shows an inline error on empty submit without calling the API", () => {
    renderDialog();

    clickSubmit();

    expect(submitMock).not.toHaveBeenCalled();
    expect(submittedCalls()).toHaveLength(0);
    expect(screen.getByText(messages.feedback.emptyError)).toBeInTheDocument();
  });

  it("POSTs the feedback and only then fires FEEDBACK_SUBMITTED", async () => {
    const { onClose } = renderDialog();

    fireEvent.click(
      screen.getByRole("tab", { name: messages.feedback.categoryBug }),
    );
    typeMessage("Кнопка не працює");
    clickSubmit();

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    expect(submitMock.mock.calls[0]?.[0]).toMatchObject({
      category: "bug",
      message: "Кнопка не працює",
    });

    await waitFor(() => expect(submittedCalls()).toHaveLength(1));
    expect(submittedCalls()[0]?.[1]).toMatchObject({
      category: "bug",
      message: "Кнопка не працює",
      has_page_context: true,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  // Це ядро всієї зміни: до неї UI казав «надіслано» незалежно від того, чи
  // щось долетіло. Якщо цей тест колись впаде — брехня повернулась.
  it("на збої НЕ каже «надіслано», не закриває діалог і не фаїть подію", async () => {
    submitMock.mockRejectedValue(new Error("blocked"));
    const { onClose } = renderDialog();

    typeMessage("щось зламалось");
    clickSubmit();

    await waitFor(() =>
      expect(
        screen.getByText(messages.feedback.errorGeneric),
      ).toBeInTheDocument(),
    );
    expect(submittedCalls()).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText(messages.feedback.submitted)).toBeNull();
    // Текст лишається на екрані — людині не треба писати його вдруге.
    expect(
      (
        screen.getByLabelText(
          messages.feedback.messageLabel,
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("щось зламалось");
  });

  it("офлайн дає власну підказку замість загальної", async () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    submitMock.mockRejectedValue(new Error("network"));
    renderDialog();

    typeMessage("нема інтернету");
    clickSubmit();

    await waitFor(() =>
      expect(
        screen.getByText(messages.feedback.errorOffline),
      ).toBeInTheDocument(),
    );
  });

  it("після збою дає скопіювати текст", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    submitMock.mockRejectedValue(new Error("blocked"));
    renderDialog();

    typeMessage("  врятуй мій текст  ");
    clickSubmit();

    await waitFor(() =>
      expect(
        screen.getByText(messages.feedback.errorGeneric),
      ).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: messages.feedback.copyMessage }),
    );
    expect(writeText).toHaveBeenCalledWith("врятуй мій текст");
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

  it("trims the message and calls onClose on successful submit", async () => {
    const { onClose } = renderDialog();

    typeMessage("  Ідея для покращення  ");
    clickSubmit();

    await waitFor(() => expect(submittedCalls()).toHaveLength(1));
    const payload = submittedCalls()[0]?.[1] as Record<string, unknown>;
    expect(payload["message"]).toBe("Ідея для покращення");
    expect(payload["length"]).toBe("Ідея для покращення".length);
    expect(payload["page"]).toEqual(expect.any(String));
    expect(payload["viewport"]).toMatch(/^\d+x\d+$/);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
