import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { signOut } from "@/auth/authClient";

import { AccountSection } from "./AccountSection";

jest.mock("@/auth/authClient", () => ({
  signOut: jest.fn(() => Promise.resolve()),
}));

const mockUsePushTest = jest.fn(() => ({
  mutate: jest.fn(),
  isPending: false,
}));

jest.mock("@sergeant/api-client/react", () => ({
  usePushTest: () => mockUsePushTest(),
}));

const mockedSignOut = signOut as jest.Mock;

function renderSection(client = new QueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <AccountSection />
    </QueryClientProvider>,
  );
}

describe("AccountSection", () => {
  beforeEach(() => {
    mockedSignOut.mockClear();
    mockUsePushTest.mockClear();
  });

  it("clears the query cache after sign-out", async () => {
    const client = new QueryClient();
    client.setQueryData(["me"], { id: "user-1" });
    const clearSpy = jest.spyOn(client, "clear");

    const { getByTestId } = renderSection(client);

    fireEvent.press(getByTestId("account-section"));
    fireEvent.press(getByTestId("account-sign-out"));

    await waitFor(() => {
      expect(mockedSignOut).toHaveBeenCalledTimes(1);
      expect(clearSpy).toHaveBeenCalledTimes(1);
    });
  });

  it("exposes the dev push-test action in dev builds", () => {
    const mutate = jest.fn();
    mockUsePushTest.mockReturnValueOnce({ mutate, isPending: false });
    const { getByTestId } = renderSection();

    fireEvent.press(getByTestId("account-section"));
    fireEvent.press(getByTestId("account-dev-push-test"));

    expect(mutate).toHaveBeenCalledWith({
      title: "Sergeant",
      body: "It works",
    });
  });
});
