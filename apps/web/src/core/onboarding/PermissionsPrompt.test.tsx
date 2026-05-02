/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { PermissionsPrompt } from "./PermissionsPrompt";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ANALYTICS_CALLS: Array<{
  name: string;
  props?: Record<string, unknown>;
}> = [];

vi.mock("../observability/analytics", () => ({
  trackEvent: (name: string, props?: Record<string, unknown>) => {
    ANALYTICS_CALLS.push({ name, props });
  },
  ANALYTICS_EVENTS: {
    PERMISSION_REQUESTED: "permission_requested",
    PERMISSION_GRANTED: "permission_granted",
    PERMISSION_DENIED: "permission_denied",
  },
}));

beforeEach(() => {
  ANALYTICS_CALLS.length = 0;
});

describe("PermissionsPrompt", () => {
  it("renders all three permission rows with explanations", () => {
    const { getByText } = render(
      <PermissionsPrompt onComplete={() => {}} onBack={() => {}} />,
    );
    expect(getByText("Сповіщення")).not.toBeNull();
    expect(getByText("Мікрофон")).not.toBeNull();
    expect(getByText("Камера")).not.toBeNull();
    // "Пропустити" button is always visible — user can never get stuck.
    expect(getByText("Пропустити")).not.toBeNull();
  });

  it("Skip calls onComplete with empty granted list and never asks the browser", () => {
    const onComplete = vi.fn();
    const requestPermission = vi.fn();
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: { requestPermission },
    });

    const { getByText } = render(
      <PermissionsPrompt onComplete={onComplete} onBack={() => {}} />,
    );
    fireEvent.click(getByText("Пропустити"));
    expect(onComplete).toHaveBeenCalledWith([]);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("Allow → granted updates the row to show 'Готово' and tracks analytics", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: { requestPermission },
    });

    const onComplete = vi.fn();
    const { getByLabelText, findByText } = render(
      <PermissionsPrompt onComplete={onComplete} onBack={() => {}} />,
    );
    fireEvent.click(getByLabelText("Дозволити сповіщення"));

    await findByText("Готово");
    expect(requestPermission).toHaveBeenCalledOnce();
    const names = ANALYTICS_CALLS.map((c) => c.name);
    expect(names).toContain("permission_requested");
    expect(names).toContain("permission_granted");
  });

  it("Allow → denied marks the row as 'Заблоковано' and emits PERMISSION_DENIED", async () => {
    const requestPermission = vi.fn().mockResolvedValue("denied");
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: { requestPermission },
    });

    const { getByLabelText, findByText } = render(
      <PermissionsPrompt onComplete={() => {}} onBack={() => {}} />,
    );
    fireEvent.click(getByLabelText("Дозволити сповіщення"));

    await findByText("Заблоковано");
    expect(ANALYTICS_CALLS.map((c) => c.name)).toContain("permission_denied");
  });

  it("onComplete receives only the permissions that were granted", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: { requestPermission },
    });

    const onComplete = vi.fn();
    const { getByLabelText, getByText, findByText } = render(
      <PermissionsPrompt onComplete={onComplete} onBack={() => {}} />,
    );
    fireEvent.click(getByLabelText("Дозволити сповіщення"));
    await findByText("Готово");

    fireEvent.click(getByText("Продовжити"));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(onComplete).toHaveBeenCalledWith(["push"]);
  });

  it("Back button invokes onBack without continuing", () => {
    const onBack = vi.fn();
    const onComplete = vi.fn();
    const { getByLabelText } = render(
      <PermissionsPrompt onComplete={onComplete} onBack={onBack} />,
    );
    fireEvent.click(getByLabelText("Назад"));
    expect(onBack).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
