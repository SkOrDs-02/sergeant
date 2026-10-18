// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HubHeader } from "./HubHeader";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-18T15:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("refreshes the home date after a new Kyiv day without remounting", () => {
  render(<HubHeader activeTab="dashboard" onOpenSearch={() => {}} />);
  expect(screen.getByTestId("hub-header-title")).toHaveTextContent(
    "Неділя, 18 жовтня",
  );
  act(() => {
    vi.setSystemTime(new Date("2026-10-19T06:00:00Z"));
    window.dispatchEvent(new Event("focus"));
  });
  expect(screen.getByTestId("hub-header-title")).toHaveTextContent(
    "Понеділок, 19 жовтня",
  );
});
