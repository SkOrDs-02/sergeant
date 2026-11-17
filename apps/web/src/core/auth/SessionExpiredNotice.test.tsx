// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SessionExpiredNotice } from "./SessionExpiredNotice";
import {
  clearSessionExpired,
  markSessionExpired,
} from "./sessionExpiredMarker";

describe("SessionExpiredNotice (sec-18)", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    cleanup();
    clearSessionExpired();
  });

  it("пояснює, що сесія завершилась, коли стоїть маркер", () => {
    markSessionExpired();
    render(<SessionExpiredNotice />);
    expect(screen.getByRole("status")).toHaveTextContent("Сесія завершилась");
    expect(screen.getByRole("status")).toHaveTextContent("збережено");
  });

  it("нічого не показує без маркера", () => {
    render(<SessionExpiredNotice />);
    expect(screen.queryByTestId("session-expired-notice")).toBeNull();
  });
});
