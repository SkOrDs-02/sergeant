import { renderHook, waitFor } from "@testing-library/react-native";

const mockUseUser = jest.fn();
const mockBootNutritionSqliteReadPath = jest.fn();
const mockNotifyRefresh = jest.fn();
const mockBootNutritionDualWrite = jest.fn();

jest.mock("@sergeant/api-client/react", () => ({
  useUser: (...args: unknown[]) => mockUseUser(...args),
}));

jest.mock("../../lib/sqliteReadBoot", () => ({
  bootNutritionSqliteReadPath: (...args: unknown[]) =>
    mockBootNutritionSqliteReadPath(...args),
}));

jest.mock("../../lib/sqliteReadGate", () => ({
  notifyNutritionSqliteCacheRefresh: (...args: unknown[]) =>
    mockNotifyRefresh(...args),
}));

jest.mock("../../lib/dualWriteBoot", () => ({
  bootNutritionDualWrite: (...args: unknown[]) =>
    mockBootNutritionDualWrite(...args),
}));

import { useNutritionDualWriteBoot } from "../useNutritionDualWriteBoot";
import { useNutritionSqliteReadBoot } from "../useNutritionSqliteReadBoot";

beforeEach(() => {
  mockUseUser.mockReset();
  mockBootNutritionSqliteReadPath.mockReset();
  mockNotifyRefresh.mockReset();
  mockBootNutritionDualWrite.mockReset();
});

describe("useNutritionSqliteReadBoot", () => {
  it("does not boot until a user id is available", () => {
    mockUseUser.mockReturnValue({ data: null });

    renderHook(() => useNutritionSqliteReadBoot());

    expect(mockUseUser).toHaveBeenCalledWith({
      retry: false,
      refetchOnWindowFocus: false,
    });
    expect(mockBootNutritionSqliteReadPath).not.toHaveBeenCalled();
    expect(mockNotifyRefresh).not.toHaveBeenCalled();
  });

  it("boots once per mount and notifies when cache activates", async () => {
    mockUseUser.mockReturnValue({ data: { user: { id: "user-1" } } });
    mockBootNutritionSqliteReadPath.mockResolvedValue(true);

    const { rerender } = renderHook(() => useNutritionSqliteReadBoot());
    rerender({});

    await waitFor(() => {
      expect(mockBootNutritionSqliteReadPath).toHaveBeenCalledWith("user-1");
    });
    expect(mockBootNutritionSqliteReadPath).toHaveBeenCalledTimes(1);
    expect(mockNotifyRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not notify consumers when read boot fails soft", async () => {
    mockUseUser.mockReturnValue({ data: { user: { id: "user-1" } } });
    mockBootNutritionSqliteReadPath.mockResolvedValue(false);

    renderHook(() => useNutritionSqliteReadBoot());

    await waitFor(() => {
      expect(mockBootNutritionSqliteReadPath).toHaveBeenCalledWith("user-1");
    });
    expect(mockNotifyRefresh).not.toHaveBeenCalled();
  });
});

describe("useNutritionDualWriteBoot", () => {
  it("does not register a dual-write context without a user id", () => {
    mockUseUser.mockReturnValue({ data: { user: null } });

    renderHook(() => useNutritionDualWriteBoot());

    expect(mockUseUser).toHaveBeenCalledWith({
      retry: false,
      refetchOnWindowFocus: false,
    });
    expect(mockBootNutritionDualWrite).not.toHaveBeenCalled();
  });

  it("registers with the current user id and tears down on unmount", () => {
    const teardown = jest.fn();
    mockUseUser.mockReturnValue({ data: { user: { id: "user-1" } } });
    mockBootNutritionDualWrite.mockReturnValue(teardown);

    const { unmount } = renderHook(() => useNutritionDualWriteBoot());

    expect(mockBootNutritionDualWrite).toHaveBeenCalledTimes(1);
    const input = mockBootNutritionDualWrite.mock.calls[0]![0] as {
      getUserId(): string | null;
    };
    expect(input.getUserId()).toBe("user-1");

    unmount();

    expect(teardown).toHaveBeenCalledTimes(1);
  });
});
