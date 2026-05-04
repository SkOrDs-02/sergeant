// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ApiError } from "@sergeant/api-client";

/**
 * Тести для `WaitlistForm` після міграції на `useApiForm` + zod.
 * Покривають:
 *
 * - client-side zod-валідація (порожній / невалідний email → inline помилка,
 *   `waitlistApi.submit` не викликається)
 * - happy path (`created: true`) → toast.success, аналітика, `onSuccess(true)`,
 *   email очищено, tier зберігається
 * - ідемпотентний path (`created: false`) → toast.info, `onSuccess(false)`
 * - ApiError 429 → toast.error "Забагато запитів", банер не зʼявляється
 * - ApiError 400 з `details: [{path:"email", message:...}]` → inline помилка
 *   на полі через `applyServerError` з `useApiForm`
 * - default tier через preset prop
 *
 * `waitlistApi.submit` мокаємо напряму — швидше і дозволяє контролювати
 * статус і `body.details` без MSW-рута.
 */

const submitMock = vi.fn();
vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    waitlistApi: {
      submit: (payload: unknown) => submitMock(payload),
    },
  };
});

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const toastInfoMock = vi.fn();
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({
    success: toastSuccessMock,
    error: toastErrorMock,
    info: toastInfoMock,
  }),
}));

const trackEventMock = vi.fn();
vi.mock("../observability/analytics", async () => {
  const actual = await vi.importActual<
    typeof import("../observability/analytics")
  >("../observability/analytics");
  return {
    ...actual,
    trackEvent: (...args: unknown[]) => trackEventMock(...args),
  };
});

import { WaitlistForm } from "./WaitlistForm";

beforeEach(() => {
  submitMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
  toastInfoMock.mockReset();
  trackEventMock.mockReset();
});

afterEach(() => {
  cleanup();
});

function fillEmail(value: string): void {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value },
  });
}

describe("WaitlistForm — client-side validation", () => {
  it("показує inline помилку для порожнього email і не викликає API", async () => {
    render(<WaitlistForm source="pricing_page" />);

    fireEvent.click(screen.getByRole("button", { name: /Підписатись/ }));

    await waitFor(() => {
      expect(screen.getByText("Некоректна email-адреса")).toBeTruthy();
    });
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("показує inline помилку для невалідного email і не викликає API", async () => {
    render(<WaitlistForm source="pricing_page" />);

    fillEmail("not-an-email");
    fireEvent.click(screen.getByRole("button", { name: /Підписатись/ }));

    await waitFor(() => {
      expect(screen.getByText("Некоректна email-адреса")).toBeTruthy();
    });
    expect(submitMock).not.toHaveBeenCalled();
  });
});

describe("WaitlistForm — submit flow", () => {
  it("happy path (created: true): toast.success + аналітика + reset email", async () => {
    submitMock.mockResolvedValue({ ok: true, created: true });
    const onSuccess = vi.fn();

    render(
      <WaitlistForm
        source="pricing_page"
        defaultTier="pro"
        onSuccess={onSuccess}
      />,
    );

    fillEmail("user@example.com");
    fireEvent.click(screen.getByRole("button", { name: /Підписатись/ }));

    await waitFor(() => {
      expect(submitMock).toHaveBeenCalledWith({
        // zod `.toLowerCase().trim()` нормалізує перед відправкою
        email: "user@example.com",
        tier_interest: "pro",
        source: "pricing_page",
      });
    });
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Дякуємо! Повідомимо щойно Pro буде готовий.",
      );
    });
    expect(onSuccess).toHaveBeenCalledWith(true);
    expect(trackEventMock).toHaveBeenCalledWith(
      "waitlist_submitted",
      expect.objectContaining({
        tier_interest: "pro",
        source: "pricing_page",
        created: true,
      }),
    );
    // Email очищено, tier лишився `pro`.
    await waitFor(() => {
      expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(
        "",
      );
    });
    expect(
      (
        screen.getByLabelText(/Pro — AI-чат/, {
          selector: "label",
        }) as HTMLLabelElement
      ).className,
    ).toContain("border-brand-500");
  });

  it("ідемпотентний path (created: false): toast.info замість success", async () => {
    submitMock.mockResolvedValue({ ok: true, created: false });
    const onSuccess = vi.fn();

    render(<WaitlistForm source="paywall" onSuccess={onSuccess} />);

    fillEmail("dupe@example.com");
    fireEvent.click(screen.getByRole("button", { name: /Підписатись/ }));

    await waitFor(() => {
      expect(toastInfoMock).toHaveBeenCalledWith(
        "Ми вже памʼятаємо твій інтерес — жодних дублікатів.",
      );
    });
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith(false);
  });
});

describe("WaitlistForm — server error mapping", () => {
  it("429 (rate-limit): toast.error + банер не показується", async () => {
    submitMock.mockRejectedValue(
      new ApiError({
        kind: "http",
        status: 429,
        message: "Too Many Requests",
        body: { error: "rate limited" },
        url: "/api/v1/waitlist",
      }),
    );

    render(<WaitlistForm source="pricing_page" />);

    fillEmail("user@example.com");
    fireEvent.click(screen.getByRole("button", { name: /Підписатись/ }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Забагато запитів. Спробуй за годину.",
      );
    });
    // Банер `data-testid="waitlist-server-error"` має зникнути після того,
    // як effect почистив `serverError`.
    await waitFor(() => {
      expect(screen.queryByTestId("waitlist-server-error")).toBeNull();
    });
  });

  it("400 з details на email: помилка лягає на поле email, не як top-level", async () => {
    submitMock.mockRejectedValue(
      new ApiError({
        kind: "http",
        status: 400,
        message: "validation",
        body: {
          error: "validation failed",
          details: [{ path: "email", message: "Email уже у списку" }],
        },
        url: "/api/v1/waitlist",
      }),
    );

    render(<WaitlistForm source="pricing_page" />);

    fillEmail("user@example.com");
    fireEvent.click(screen.getByRole("button", { name: /Підписатись/ }));

    await waitFor(() => {
      expect(screen.getByText("Email уже у списку")).toBeTruthy();
    });
    // top-level банер не повинен зʼявитись (`bound > 0 && topLevel === null`
    // у `applyServerError`).
    expect(screen.queryByTestId("waitlist-server-error")).toBeNull();
  });
});
