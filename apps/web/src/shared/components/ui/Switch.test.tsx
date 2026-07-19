/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { Switch } from "./Switch";
import { ScreenReaderAnnouncerProvider } from "./ScreenReaderAnnouncer";

afterEach(cleanup);

describe("Switch", () => {
  it("renders unchecked by default (uncontrolled)", () => {
    const { getByRole } = render(<Switch label="Notif" />);
    const input = getByRole("switch") as HTMLInputElement;
    expect(input.checked).toBe(false);
  });

  it("honors defaultChecked for the uncontrolled case", () => {
    const { getByRole } = render(<Switch label="Notif" defaultChecked />);
    const input = getByRole("switch") as HTMLInputElement;
    expect(input.checked).toBe(true);
  });

  it("toggles internal state and calls onChange when uncontrolled", () => {
    const onChange = vi.fn();
    const { getByRole } = render(<Switch label="Notif" onChange={onChange} />);
    const input = getByRole("switch") as HTMLInputElement;
    fireEvent.click(input);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(input.checked).toBe(true);
  });

  it("stays under caller control when `checked` is passed (controlled)", () => {
    const onChange = vi.fn();
    const { getByRole, rerender } = render(
      <Switch label="Notif" checked={false} onChange={onChange} />,
    );
    const input = getByRole("switch") as HTMLInputElement;
    fireEvent.click(input);
    expect(onChange).toHaveBeenCalledWith(true);
    // Controlled: the DOM checked state does NOT flip until the parent
    // re-renders with checked=true.
    expect(input.checked).toBe(false);
    rerender(<Switch label="Notif" checked={true} onChange={onChange} />);
    expect((getByRole("switch") as HTMLInputElement).checked).toBe(true);
  });

  it("ignores clicks while disabled", () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <Switch label="Notif" disabled onChange={onChange} />,
    );
    fireEvent.click(getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("announces a default Ukrainian message derived from a string label", async () => {
    const { getByRole, findByText } = render(
      <ScreenReaderAnnouncerProvider>
        <Switch label="Звук" />
      </ScreenReaderAnnouncerProvider>,
    );
    fireEvent.click(getByRole("switch"));
    expect(await findByText("Звук увімкнено")).toBeInTheDocument();
  });

  it("uses a custom announceText callback when provided", async () => {
    const announceText = vi.fn(() => "Custom announcement");
    const { getByRole, findByText } = render(
      <ScreenReaderAnnouncerProvider>
        <Switch label="Звук" announceText={announceText} />
      </ScreenReaderAnnouncerProvider>,
    );
    fireEvent.click(getByRole("switch"));
    expect(announceText).toHaveBeenCalledWith(true);
    expect(await findByText("Custom announcement")).toBeInTheDocument();
  });

  it("suppresses the announcement when announceText returns an empty string", () => {
    const { getByRole, queryByText } = render(
      <ScreenReaderAnnouncerProvider>
        <Switch label="Звук" announceText={() => ""} />
      </ScreenReaderAnnouncerProvider>,
    );
    fireEvent.click(getByRole("switch"));
    expect(queryByText("увімкнено", { exact: false })).toBeNull();
  });

  it("renders a description and links it via aria-describedby", () => {
    const { getByRole, getByText } = render(
      <Switch label="Звук" description="Деталі" />,
    );
    const input = getByRole("switch");
    const desc = getByText("Деталі");
    expect(input.getAttribute("aria-describedby")).toBe(desc.id);
  });

  it("marks the input aria-invalid and tints the description when error=true", () => {
    const { getByRole, getByText } = render(
      <Switch label="Звук" description="Деталі" error />,
    );
    expect(getByRole("switch").getAttribute("aria-invalid")).toBe("true");
    expect(getByText("Деталі").className).toContain("text-danger-strong");
  });

  it("falls back to the aria-label prop when there is no visible label", () => {
    const { getByRole } = render(<Switch aria-label="Toggle sound" />);
    expect(getByRole("switch").getAttribute("aria-label")).toBe("Toggle sound");
  });

  it("supports name/value for native form participation", () => {
    const { getByRole } = render(
      <Switch label="Звук" name="sound" value="yes" />,
    );
    const input = getByRole("switch") as HTMLInputElement;
    expect(input.name).toBe("sound");
    expect(input.value).toBe("yes");
  });
});
