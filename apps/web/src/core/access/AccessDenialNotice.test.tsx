// @vitest-environment jsdom
/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * A3, поставка 2. Перевіряється не верстка, а контракт подачі: причина
 * веде до СВОЄЇ дії, і причини без виходу не вигадують кнопку.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccessDenialNotice } from "./AccessDenialNotice";

describe("AccessDenialNotice", () => {
  it("offers sign-in for «треба увійти»", () => {
    render(<AccessDenialNotice denial={{ reason: "sign-in-required" }} />);
    expect(screen.getByTestId("access-denial-action")).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  it("sends «потрібен план» to pricing, not to sign-in", () => {
    // ЦЕ головний інваріант поставки. Пропонувати вхід тому, хто вже
    // увійшов, — це та сама помилка, від якої захищає тип `AccessDenial`.
    render(
      <AccessDenialNotice
        denial={{ reason: "plan-required", requiredPlan: "pro" }}
      />,
    );
    expect(screen.getByTestId("access-denial-action")).toHaveAttribute(
      "href",
      "/pricing",
    );
  });

  it("gives the profile-preset quota its own free way out", () => {
    render(
      <AccessDenialNotice
        denial={{ reason: "quota-exhausted", limit: 3, preset: true }}
      />,
    );
    expect(screen.getByTestId("access-denial-action")).toHaveAttribute(
      "href",
      "/profile",
    );
  });

  it("offers no button where there is no action to offer", () => {
    // «Спробуй завтра» і «нема мережі» кнопкою не лікуються. Кнопка, що
    // нічого не змінює, гірша за її відсутність — рівно той дефект, який
    // власник знайшов у плашці локальних даних (A1).
    for (const denial of [
      { reason: "quota-exhausted" as const, limit: 20, preset: false },
      { reason: "provider-down" as const, retryAfterMs: 12_000 },
      { reason: "offline" as const },
    ]) {
      const { unmount } = render(<AccessDenialNotice denial={denial} />);
      expect(screen.queryByTestId("access-denial-action")).toBeNull();
      unmount();
    }
  });

  it("marks the reason on the node so a surface can assert on it", () => {
    render(<AccessDenialNotice denial={{ reason: "offline" }} />);
    expect(screen.getByTestId("access-denial-notice")).toHaveAttribute(
      "data-reason",
      "offline",
    );
  });

  it("shows the dismiss control only when there is a handler", () => {
    const { unmount } = render(
      <AccessDenialNotice denial={{ reason: "offline" }} />,
    );
    expect(
      screen.queryByRole("button", { name: "Закрити пояснення" }),
    ).toBeNull();
    unmount();

    const onDismiss = vi.fn();
    render(
      <AccessDenialNotice
        denial={{ reason: "offline" }}
        onDismiss={onDismiss}
      />,
    );
    screen.getByRole("button", { name: "Закрити пояснення" }).click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
