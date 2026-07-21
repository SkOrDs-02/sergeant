import { renderHook } from "@testing-library/react-native";

const mockUseUser = jest.fn();
const mockBootRoutineDualWrite = jest.fn();

jest.mock("@sergeant/api-client/react", () => ({
  useUser: (...args: unknown[]) => mockUseUser(...args),
}));

jest.mock("../lib/dualWriteBoot", () => ({
  bootRoutineDualWrite: (...args: unknown[]) =>
    mockBootRoutineDualWrite(...args),
}));

import { useRoutineDualWriteBoot } from "./useRoutineDualWriteBoot";

beforeEach(() => {
  mockUseUser.mockReset();
  mockBootRoutineDualWrite.mockReset();
});

describe("useRoutineDualWriteBoot", () => {
  it("does not register a dual-write context without a user id", () => {
    mockUseUser.mockReturnValue({ data: { user: null } });

    renderHook(() => useRoutineDualWriteBoot());

    expect(mockUseUser).toHaveBeenCalledWith({
      retry: false,
      refetchOnWindowFocus: false,
    });
    expect(mockBootRoutineDualWrite).not.toHaveBeenCalled();
  });

  it("registers with the current user id and tears down on unmount", () => {
    const teardown = jest.fn();
    mockUseUser.mockReturnValue({ data: { user: { id: "user-1" } } });
    mockBootRoutineDualWrite.mockReturnValue(teardown);

    const { unmount } = renderHook(() => useRoutineDualWriteBoot());

    expect(mockBootRoutineDualWrite).toHaveBeenCalledTimes(1);
    const input = mockBootRoutineDualWrite.mock.calls[0]![0] as {
      getUserId(): string | null;
    };
    expect(input.getUserId()).toBe("user-1");

    unmount();

    expect(teardown).toHaveBeenCalledTimes(1);
  });
});
