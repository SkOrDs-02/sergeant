// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FinykLoginScreen } from "./FinykLoginScreen";

function baseProps() {
  return {
    authError: null,
    error: null,
    connecting: false,
    onConnect: vi.fn(),
    onContinueWithoutBank: vi.fn(),
  };
}

describe("FinykLoginScreen", () => {
  it("renders the heading, token field and primary actions", () => {
    render(<FinykLoginScreen {...baseProps()} />);
    expect(screen.getByText("ФІНІК")).toBeInTheDocument();
    expect(screen.getByLabelText("API токен Monobank")).toBeInTheDocument();
    expect(screen.getByText("Підключити Monobank")).toBeInTheDocument();
    expect(screen.getByText("Почати без банку")).toBeInTheDocument();
  });

  it("disables the connect button when the token is empty", () => {
    render(<FinykLoginScreen {...baseProps()} />);
    expect(screen.getByText("Підключити Monobank")).toBeDisabled();
  });

  it("submits the trimmed token via onConnect", async () => {
    const props = baseProps();
    render(<FinykLoginScreen {...props} />);
    const input = screen.getByLabelText("API токен Monobank");
    fireEvent.change(input, { target: { value: "  my-token  " } });
    const btn = screen.getByText("Підключити Monobank");
    await waitFor(() => expect(btn).not.toBeDisabled());
    fireEvent.click(btn);
    await waitFor(() =>
      expect(props.onConnect).toHaveBeenCalledWith("my-token"),
    );
  });

  it("toggles token visibility", () => {
    render(<FinykLoginScreen {...baseProps()} />);
    const input = screen.getByLabelText("API токен Monobank");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByLabelText("Показати токен"));
    expect(input).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByLabelText("Приховати токен"));
    expect(input).toHaveAttribute("type", "password");
  });

  it("pastes a trimmed token from the clipboard", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText: vi.fn().mockResolvedValue("  pasted-token  ") },
    });

    render(<FinykLoginScreen {...baseProps()} />);
    fireEvent.click(screen.getByLabelText("Вставити з буфера обміну"));

    await waitFor(() =>
      expect(screen.getByLabelText("API токен Monobank")).toHaveValue(
        "pasted-token",
      ),
    );
  });

  it("keeps manual token entry available when clipboard read fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText: vi.fn().mockRejectedValue(new Error("denied")) },
    });

    render(<FinykLoginScreen {...baseProps()} />);
    fireEvent.click(screen.getByLabelText("Вставити з буфера обміну"));

    await waitFor(() =>
      expect(navigator.clipboard.readText).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByLabelText("API токен Monobank")).toHaveValue("");
  });

  it("fires onContinueWithoutBank", () => {
    const props = baseProps();
    render(<FinykLoginScreen {...props} />);
    fireEvent.click(screen.getByText("Почати без банку"));
    expect(props.onContinueWithoutBank).toHaveBeenCalledTimes(1);
  });

  it("renders the auth-error block", () => {
    render(<FinykLoginScreen {...baseProps()} authError="Token expired" />);
    expect(screen.getByText("Токен потребує оновлення")).toBeInTheDocument();
    expect(screen.getByText("Token expired")).toBeInTheDocument();
  });

  it("renders the parent error when no authError is set", () => {
    render(<FinykLoginScreen {...baseProps()} error="Network down" />);
    expect(screen.getByText("Network down")).toBeInTheDocument();
  });

  it("renders an optional back-to-hub button with a custom label", () => {
    const onBackToHub = vi.fn();
    render(
      <FinykLoginScreen
        {...baseProps()}
        onBackToHub={onBackToHub}
        backLabel="До налаштувань"
      />,
    );
    const back = screen.getByText(/До налаштувань/);
    fireEvent.click(back);
    expect(onBackToHub).toHaveBeenCalledTimes(1);
  });

  it("shows the connecting state on the submit button", () => {
    render(<FinykLoginScreen {...baseProps()} connecting />);
    expect(screen.getByRole("button", { name: /Підключ|підключ/i }));
    // Connecting forces the button disabled.
    const submit = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("type") === "submit");
    expect(submit).toBeDisabled();
  });
});
