/**
 * Tests for `PushRegistrar` — focuses on the post-rotation listener
 * that was added to fix T4 audit finding #8 ("Push token registration
 * never refreshes — FCM/APNs token rotation while logged in is
 * silently dropped").
 *
 * The component itself has multiple concerns (initial registration,
 * sign-out reset, smoke-check) that are already exercised indirectly
 * via existing integration tests. This file targets the **new**
 * behaviour: `Notifications.addPushTokenListener` is subscribed
 * exactly once per authenticated user, the listener triggers
 * `registerPush(..., { force: true })`, and the subscription is
 * cleaned up on unmount.
 */

import { render, waitFor } from "@testing-library/react-native";
import { type ReactNode } from "react";

const mockRegisterPush = jest.fn();
const mockAddPushTokenListener = jest.fn();
const mockRemoveListener = jest.fn();
const mockUseUser = jest.fn();
const mockUseApiClient = jest.fn();

jest.mock("./registerPush", () => ({
  __esModule: true,
  registerPush: (...args: unknown[]) => mockRegisterPush(...args),
}));

jest.mock("expo-notifications", () => ({
  __esModule: true,
  addPushTokenListener: (handler: (token: unknown) => void) => {
    mockAddPushTokenListener(handler);
    return { remove: mockRemoveListener };
  },
}));

jest.mock("@sergeant/api-client/react", () => ({
  __esModule: true,
  useApiClient: () => mockUseApiClient(),
  useUser: () => mockUseUser(),
}));

jest.mock("@/lib/storage", () => ({
  __esModule: true,
  createModuleStorage: () => ({
    writeJSON: jest.fn(),
    readJSON: jest.fn(),
    removeItem: jest.fn(),
  }),
  safeReadStringLS: () => null,
}));

import { PushRegistrar } from "./PushRegistrar";

function Wrapper({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

beforeEach(() => {
  mockRegisterPush.mockReset();
  mockAddPushTokenListener.mockReset();
  mockRemoveListener.mockReset();
  mockUseUser.mockReset();
  mockUseApiClient.mockReset();

  mockUseApiClient.mockReturnValue({ push: { register: jest.fn() } });
  mockRegisterPush.mockResolvedValue({
    status: "registered",
    platform: "ios",
    token: "tok-1",
  });
});

describe("PushRegistrar — push-token rotation listener", () => {
  it("does NOT subscribe when there is no authenticated user", () => {
    mockUseUser.mockReturnValue({ data: { user: null } });
    render(<PushRegistrar />, { wrapper: Wrapper });
    expect(mockAddPushTokenListener).not.toHaveBeenCalled();
  });

  it("subscribes exactly once per authenticated user", async () => {
    mockUseUser.mockReturnValue({ data: { user: { id: "user-1" } } });
    render(<PushRegistrar />, { wrapper: Wrapper });
    await waitFor(() => expect(mockAddPushTokenListener).toHaveBeenCalled());
    expect(mockAddPushTokenListener).toHaveBeenCalledTimes(1);
  });

  it("re-registers with force=true when the listener fires (token rotation)", async () => {
    mockUseUser.mockReturnValue({ data: { user: { id: "user-1" } } });
    render(<PushRegistrar />, { wrapper: Wrapper });

    await waitFor(() => expect(mockAddPushTokenListener).toHaveBeenCalled());
    const handler = mockAddPushTokenListener.mock.calls[0]![0] as (
      token: unknown,
    ) => void;

    // Initial registration call counts as 1 — clear before exercising
    // the rotation path so we can assert exactly one extra call.
    mockRegisterPush.mockClear();
    handler({ data: "new-rotated-token" });

    await waitFor(() => expect(mockRegisterPush).toHaveBeenCalledTimes(1));
    const [, userId, options] = mockRegisterPush.mock.calls[0]!;
    expect(userId).toBe("user-1");
    expect(options).toEqual({ force: true });
  });

  it("removes the subscription on unmount", async () => {
    mockUseUser.mockReturnValue({ data: { user: { id: "user-1" } } });
    const { unmount } = render(<PushRegistrar />, { wrapper: Wrapper });
    await waitFor(() => expect(mockAddPushTokenListener).toHaveBeenCalled());

    unmount();
    expect(mockRemoveListener).toHaveBeenCalledTimes(1);
  });
});
