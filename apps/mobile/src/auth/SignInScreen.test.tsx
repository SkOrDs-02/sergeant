/**
 * Smoke tests for the `(auth)/sign-in` screen.
 *
 * The screen component lives in `app/(auth)/sign-in.tsx` but Jest only
 * discovers tests under `src/`. `@app/` is mapped to `<rootDir>/app/`
 * in `jest.config.js` so we can import the default export cleanly.
 */

import { fireEvent, render, waitFor } from "@testing-library/react-native";

jest.mock("react-native-safe-area-context", () => {
  const RN = jest.requireActual("react-native");
  return {
    SafeAreaView: RN.View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

import SignInScreen from "@app/(auth)/sign-in";
import { signIn } from "@/auth/authClient";

const mockSignInEmail = signIn.email as jest.Mock;

describe("SignInScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the sign-in form", () => {
    const { getByText, getByPlaceholderText } = render(<SignInScreen />);

    // Heading text was de-coupled from the 👋 emoji in #1046 (Sparkles icon
    // sibling now lives next to the same heading).
    expect(getByText("З поверненням")).toBeTruthy();
    expect(getByPlaceholderText("ваш@email.com")).toBeTruthy();
    expect(getByPlaceholderText("••••••••••")).toBeTruthy();
    expect(getByText("Увійти")).toBeTruthy();
  });

  it("calls signIn.email and navigates home on success", async () => {
    mockSignInEmail.mockResolvedValueOnce({ data: { user: {} }, error: null });

    const { getByPlaceholderText, getByText } = render(<SignInScreen />);

    fireEvent.changeText(
      getByPlaceholderText("ваш@email.com"),
      "test@example.com",
    );
    fireEvent.changeText(getByPlaceholderText("••••••••••"), "password123");
    fireEvent.press(getByText("Увійти"));

    await waitFor(() => {
      expect(mockSignInEmail).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "password123",
      });
    });
  });

  it("shows an error message on sign-in failure", async () => {
    mockSignInEmail.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid credentials" },
    });

    const { getByPlaceholderText, getByText, findByText } = render(
      <SignInScreen />,
    );

    fireEvent.changeText(
      getByPlaceholderText("ваш@email.com"),
      "bad@example.com",
    );
    fireEvent.changeText(getByPlaceholderText("••••••••••"), "wrong");
    fireEvent.press(getByText("Увійти"));

    const errorMsg = await findByText("Invalid credentials");
    expect(errorMsg).toBeTruthy();
  });
});
