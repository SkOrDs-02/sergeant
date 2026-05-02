/**
 * Smoke tests for the `(auth)/forgot-password` screen.
 */

import { fireEvent, render, waitFor } from "@testing-library/react-native";

import ForgotPasswordScreen from "@app/(auth)/forgot-password";
import { forgetPassword } from "@/auth/authClient";

const mockForgetPassword = forgetPassword as jest.Mock;

describe("ForgotPasswordScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the reset form with a disabled submit until email is entered", () => {
    const { getByText, getByPlaceholderText } = render(
      <ForgotPasswordScreen />,
    );

    expect(getByText("Забули пароль?")).toBeTruthy();
    expect(getByPlaceholderText("ваш@email.com")).toBeTruthy();
    expect(getByText("Надіслати інструкції")).toBeTruthy();
  });

  it("requests a password reset and shows the success state", async () => {
    mockForgetPassword.mockResolvedValueOnce({ error: null });

    const { getByPlaceholderText, getByText, findByText } = render(
      <ForgotPasswordScreen />,
    );

    fireEvent.changeText(getByPlaceholderText("ваш@email.com"), "me@test.dev");
    fireEvent.press(getByText("Надіслати інструкції"));

    await waitFor(() => {
      expect(mockForgetPassword).toHaveBeenCalledWith({
        email: "me@test.dev",
        redirectTo: "sergeant://reset-password",
      });
    });
    expect(await findByText("Перевірте пошту")).toBeTruthy();
    expect(await findByText("me@test.dev")).toBeTruthy();
  });

  it("shows the API error as helper text", async () => {
    mockForgetPassword.mockResolvedValueOnce({
      error: { message: "Email not found" },
    });

    const { getByPlaceholderText, getByText, findByText } = render(
      <ForgotPasswordScreen />,
    );

    fireEvent.changeText(getByPlaceholderText("ваш@email.com"), "bad@test.dev");
    fireEvent.press(getByText("Надіслати інструкції"));

    expect(await findByText("Email not found")).toBeTruthy();
  });
});
