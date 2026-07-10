// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { GoogleSignInButton } from "./GoogleSignInButton";

afterEach(() => cleanup());

describe("GoogleSignInButton", () => {
  it("renders label and invokes onClick when idle", () => {
    const onClick = vi.fn();
    render(<GoogleSignInButton loading={false} onClick={onClick} />);

    const button = screen.getByRole("button", { name: /Увійти через Google/ });
    expect(button).toBeTruthy();
    expect(button.querySelector("svg[aria-hidden]")).toBeTruthy();

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disables interaction while loading", () => {
    const onClick = vi.fn();
    render(<GoogleSignInButton loading onClick={onClick} />);

    const button = screen.getByRole("button", {
      name: /Завантаження/,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
