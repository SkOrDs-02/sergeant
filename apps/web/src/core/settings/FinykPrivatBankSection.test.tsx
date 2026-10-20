// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@shared/api";

const { statusMock, connectMock, disconnectMock } = vi.hoisted(() => ({
  statusMock: vi.fn(),
  connectMock: vi.fn(),
  disconnectMock: vi.fn(),
}));
vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    privatApi: {
      status: statusMock,
      connect: connectMock,
      disconnect: disconnectMock,
    },
  };
});

import { FinykPrivatBankSection } from "./FinykPrivatBankSection";

describe("FinykPrivatBankSection", () => {
  beforeEach(() => {
    statusMock.mockReset();
    connectMock.mockReset();
    disconnectMock.mockReset();
    statusMock.mockResolvedValue({ connected: false, merchantId: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it("does not render or request status while disabled", () => {
    const { container } = render(<FinykPrivatBankSection enabled={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(statusMock).not.toHaveBeenCalled();
  });

  it("shows connected merchant and disconnect confirmation", async () => {
    statusMock.mockResolvedValue({
      connected: true,
      merchantId: "merchant-123456",
    });
    render(<FinykPrivatBankSection enabled />);
    expect(
      await screen.findByText("ПриватБанк підключено"),
    ).toBeInTheDocument();
    expect(screen.getByText("ID: mercha••••")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Відʼєднати ПриватБанк" }),
    );
    expect(
      screen.getByText(
        "Збережені облікові дані ПриватБанку буде видалено з твого акаунта.",
      ),
    ).toBeInTheDocument();
    disconnectMock.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Відʼєднати" }));
    await waitFor(() => expect(disconnectMock).toHaveBeenCalledOnce());
  });

  it("validates credentials, reveals token, trims inputs, and connects", async () => {
    render(<FinykPrivatBankSection enabled />);
    const connect = await screen.findByRole("button", {
      name: "Підключити ПриватБанк",
    });
    fireEvent.click(connect);
    expect(
      await screen.findByText("Введи Merchant ID та токен"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Merchant ID"), {
      target: { value: "  merchant  " },
    });
    const token = screen.getByLabelText("Токен / пароль") as HTMLInputElement;
    fireEvent.change(token, { target: { value: " secret " } });
    expect(token.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Показати" }));
    expect(token.type).toBe("text");
    connectMock.mockResolvedValue(undefined);
    fireEvent.click(connect);
    await waitFor(() =>
      expect(connectMock).toHaveBeenCalledWith({
        merchantId: "merchant",
        token: "secret",
      }),
    );
  });

  it("shows server errors and falls back for unexpected failures", async () => {
    render(<FinykPrivatBankSection enabled />);
    const connect = await screen.findByRole("button", {
      name: "Підключити ПриватБанк",
    });
    fireEvent.change(screen.getByLabelText("Merchant ID"), {
      target: { value: "id" },
    });
    fireEvent.change(screen.getByLabelText("Токен / пароль"), {
      target: { value: "token" },
    });
    connectMock.mockRejectedValueOnce(
      new ApiError({
        kind: "http",
        status: 400,
        message: "Bad request",
        body: { error: "Невірні дані" },
        url: "/privat/connect",
      }),
    );
    fireEvent.click(connect);
    expect(await screen.findByText("Невірні дані")).toBeInTheDocument();
    connectMock.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(connect);
    await waitFor(() =>
      expect(screen.queryByText("Невірні дані")).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByText(
        "Не вдалося підключити PrivatBank. Спробуй ще раз.",
      ),
    ).toBeInTheDocument();
  });
});
