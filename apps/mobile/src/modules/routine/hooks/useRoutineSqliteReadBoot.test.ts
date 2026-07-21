import { renderHook, waitFor } from "@testing-library/react-native";

const mockUseUser = jest.fn();
const mockBootRoutineSqliteReadPath = jest.fn();
const mockNotifyRefresh = jest.fn();

jest.mock("@sergeant/api-client/react", () => ({
  useUser: (...args: unknown[]) => mockUseUser(...args),
}));

jest.mock("../lib/sqliteReadBoot", () => ({
  bootRoutineSqliteReadPath: (...args: unknown[]) =>
    mockBootRoutineSqliteReadPath(...args),
}));

jest.mock("../lib/sqliteReadGate", () => ({
  notifyRoutineSqliteCacheRefresh: (...args: unknown[]) =>
    mockNotifyRefresh(...args),
}));

import { useRoutineSqliteReadBoot } from "./useRoutineSqliteReadBoot";

beforeEach(() => {
  mockUseUser.mockReset();
  mockBootRoutineSqliteReadPath.mockReset();
  mockNotifyRefresh.mockReset();
});

describe("useRoutineSqliteReadBoot", () => {
  it("does not boot until a user id is available", () => {
    mockUseUser.mockReturnValue({ data: null });

    renderHook(() => useRoutineSqliteReadBoot());

    expect(mockUseUser).toHaveBeenCalledWith({
      retry: false,
      refetchOnWindowFocus: false,
    });
    expect(mockBootRoutineSqliteReadPath).not.toHaveBeenCalled();
    expect(mockNotifyRefresh).not.toHaveBeenCalled();
  });

  it("boots once per mount and notifies when the cache was activated", async () => {
    mockUseUser.mockReturnValue({ data: { user: { id: "user-1" } } });
    mockBootRoutineSqliteReadPath.mockResolvedValue(true);

    const { rerender } = renderHook(() => useRoutineSqliteReadBoot());
    rerender({});

    await waitFor(() => {
      expect(mockBootRoutineSqliteReadPath).toHaveBeenCalledWith("user-1");
    });
    await waitFor(() => {
      expect(mockNotifyRefresh).toHaveBeenCalledTimes(1);
    });
    expect(mockBootRoutineSqliteReadPath).toHaveBeenCalledTimes(1);
  });

  it("does not notify consumers when boot fails soft", async () => {
    mockUseUser.mockReturnValue({ data: { user: { id: "user-1" } } });
    mockBootRoutineSqliteReadPath.mockResolvedValue(false);

    renderHook(() => useRoutineSqliteReadBoot());

    await waitFor(() => {
      expect(mockBootRoutineSqliteReadPath).toHaveBeenCalledWith("user-1");
    });
    expect(mockNotifyRefresh).not.toHaveBeenCalled();
  });
});
