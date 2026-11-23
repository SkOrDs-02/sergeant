/**
 * sec-46: `(auth)/sign-up` без сесії у відповіді показує «Перевір пошту»
 * замість переходу на головну (де людину без сесії однаково повертало на
 * вхід). `@app/` мапиться на `<rootDir>/app/` у `jest.config.js`.
 */

import { fireEvent, render, waitFor } from "@testing-library/react-native";

jest.mock("react-native-safe-area-context", () => {
  const RN = jest.requireActual("react-native");
  return {
    SafeAreaView: RN.View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

import SignUpScreen from "@app/(auth)/sign-up";
import { signUp } from "@/auth/authClient";

const mockSignUpEmail = signUp.email as jest.Mock;

function submit(screen: ReturnType<typeof render>) {
  fireEvent.changeText(screen.getByTestId("auth-sign-up-name"), "Оля");
  fireEvent.changeText(
    screen.getByTestId("auth-sign-up-email"),
    "olia@example.com",
  );
  fireEvent.changeText(
    screen.getByTestId("auth-sign-up-password"),
    "longenoughpw",
  );
  fireEvent.press(screen.getByTestId("auth-sign-up-submit"));
}

describe("SignUpScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("без токена сесії показує «Перевір пошту» з адресою", async () => {
    mockSignUpEmail.mockResolvedValueOnce({
      data: { token: null, user: { id: "x" } },
      error: null,
    });
    const screen = render(<SignUpScreen />);
    submit(screen);

    await waitFor(() => {
      expect(screen.getByText("Перевір пошту")).toBeTruthy();
    });
    expect(screen.getByText(/olia@example\.com/)).toBeTruthy();
    expect(screen.queryByTestId("auth-sign-up-submit")).toBeNull();
  });

  it("«Повернутися до входу» має ціль дотику ≥44 px", async () => {
    mockSignUpEmail.mockResolvedValueOnce({
      data: { token: null, user: { id: "x" } },
      error: null,
    });
    const screen = render(<SignUpScreen />);
    submit(screen);

    const back = await screen.findByTestId("auth-sign-up-back-to-sign-in");
    expect(back.props.className).toContain("min-h-[44px]");
    expect(back.props.accessibilityRole).toBe("link");
  });

  it("із токеном сесії лишається на звичному шляху без «Перевір пошту»", async () => {
    mockSignUpEmail.mockResolvedValueOnce({
      data: { token: "t", user: { id: "x" } },
      error: null,
    });
    const screen = render(<SignUpScreen />);
    submit(screen);

    await waitFor(() => expect(mockSignUpEmail).toHaveBeenCalled());
    expect(screen.queryByText("Перевір пошту")).toBeNull();
  });
});
