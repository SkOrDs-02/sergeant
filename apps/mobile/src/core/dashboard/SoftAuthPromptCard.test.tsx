import { fireEvent, render } from "@testing-library/react-native";

import { SOFT_AUTH_DISMISSED_KEY } from "@sergeant/shared";

import { SoftAuthPromptCard } from "./SoftAuthPromptCard";
import { _getMMKVInstance } from "@/lib/storage";

function resetStore() {
  _getMMKVInstance().clearAll();
}

describe("SoftAuthPromptCard", () => {
  beforeEach(() => {
    resetStore();
  });

  it("renders the cloud-sync prompt headline", () => {
    const { getByText } = render(<SoftAuthPromptCard onOpenAuth={jest.fn()} />);
    expect(getByText("Зберегти на всіх пристроях?")).toBeTruthy();
  });

  it("fires onOpenAuth and onAuthOpened when CTA is tapped", () => {
    const onOpenAuth = jest.fn();
    const onAuthOpened = jest.fn();
    const { getByTestId } = render(
      <SoftAuthPromptCard
        onOpenAuth={onOpenAuth}
        onAuthOpened={onAuthOpened}
      />,
    );

    fireEvent.press(getByTestId("soft-auth-open"));
    expect(onAuthOpened).toHaveBeenCalledTimes(1);
    expect(onOpenAuth).toHaveBeenCalledTimes(1);
  });

  it("persists dismissal and fires onDismiss when «Пізніше» is tapped", () => {
    const onDismiss = jest.fn();
    const mmkv = _getMMKVInstance();
    const { getByTestId } = render(
      <SoftAuthPromptCard onOpenAuth={jest.fn()} onDismiss={onDismiss} />,
    );

    fireEvent.press(getByTestId("soft-auth-dismiss"));
    expect(mmkv.getString(SOFT_AUTH_DISMISSED_KEY)).toBe("1");
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("fires onShown once on mount", () => {
    const onShown = jest.fn();
    render(<SoftAuthPromptCard onOpenAuth={jest.fn()} onShown={onShown} />);
    expect(onShown).toHaveBeenCalledTimes(1);
  });
});
