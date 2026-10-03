/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import { FeedbackSection } from "./FeedbackSection";

const { trackEvent, submitMock } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  submitMock: vi.fn(),
}));

vi.mock("../observability/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

// Сабміт більше не fire-and-forget: діалог чекає на 200 від
// `POST /api/v1/feedback` і лише тоді фаїть подію (див. FeedbackDialog.tsx).
vi.mock("@shared/api", () => ({
  feedbackApi: { submit: (...args: unknown[]) => submitMock(...args) },
}));

function renderSection() {
  return render(
    <ToastProvider>
      <FeedbackSection />
    </ToastProvider>,
  );
}

function openDialog() {
  // SettingsGroup рендериться згорнутою — спершу розгортаємо секцію.
  fireEvent.click(
    screen.getByRole("button", { name: messages.feedback.settingsTitle }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: messages.feedback.openButton }),
  );
}

describe("FeedbackSection", () => {
  beforeEach(() => {
    trackEvent.mockClear();
    submitMock.mockReset();
    submitMock.mockResolvedValue({ ok: true, id: 1 });
  });

  it("fires feedback_widget_opened when the dialog is opened", () => {
    renderSection();
    openDialog();
    expect(trackEvent).toHaveBeenCalledWith("feedback_widget_opened", {
      source: "settings",
    });
    expect(
      screen.getByRole("dialog", { name: messages.feedback.dialogTitle }),
    ).toBeInTheDocument();
  });

  it("submits feedback_submitted with category, message and page context", async () => {
    renderSection();
    openDialog();

    fireEvent.click(
      screen.getByRole("tab", { name: messages.feedback.categoryBug }),
    );
    fireEvent.change(screen.getByLabelText(messages.feedback.messageLabel), {
      target: { value: "  Кнопка не працює на екрані бюджету  " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: messages.feedback.submit }),
    );

    // Спершу мусить піти реальний POST — подія в PostHog лише після нього.
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    expect(submitMock.mock.calls[0]?.[0]).toMatchObject({
      category: "bug",
      message: "Кнопка не працює на екрані бюджету",
    });

    await waitFor(() =>
      expect(
        trackEvent.mock.calls.some(([name]) => name === "feedback_submitted"),
      ).toBe(true),
    );
    const call = trackEvent.mock.calls.find(
      ([name]) => name === "feedback_submitted",
    );
    expect(call).toBeDefined();
    const payload = call?.[1] as Record<string, unknown>;
    expect(payload["category"]).toBe("bug");
    expect(payload["message"]).toBe("Кнопка не працює на екрані бюджету");
    expect(payload["length"]).toBe("Кнопка не працює на екрані бюджету".length);
    expect(payload["has_page_context"]).toBe(true);
    expect(payload["page"]).toEqual(expect.any(String));
    expect(payload["viewport"]).toMatch(/^\d+x\d+$/);

    // Діалог закривається після сабміту.
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: messages.feedback.dialogTitle }),
      ).not.toBeInTheDocument(),
    );
  });

  it("blocks empty submissions with an inline error instead of firing the event", () => {
    renderSection();
    openDialog();

    fireEvent.click(
      screen.getByRole("button", { name: messages.feedback.submit }),
    );

    expect(
      trackEvent.mock.calls.some(([name]) => name === "feedback_submitted"),
    ).toBe(false);
    expect(screen.getByText(messages.feedback.emptyError)).toBeInTheDocument();
  });
});
