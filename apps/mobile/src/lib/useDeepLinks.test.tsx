/**
 * Coverage for the `useDeepLinks` runtime shim.
 *
 * The pure parser has its own test file (`deepLinks.test.ts`). Here we
 * verify only the glue:
 *
 *  - Cold-start URL (`Linking.getInitialURL`) triggers `router.replace`.
 *  - Warm URL events (`Linking.addEventListener("url")`) trigger
 *    `router.push`.
 *  - Unknown / non-`sergeant://` URLs are ignored.
 *  - `sergeant://auth/callback?token=…` is passed through silently
 *    (Better Auth's own listener owns it).
 *  - Re-emitting the same URL does not navigate twice.
 *  - The listener is removed on unmount.
 */
import { act, renderHook } from "@testing-library/react-native";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockGetInitialURL = jest.fn<Promise<string | null>, []>();
const mockAddEventListener = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

jest.mock("expo-linking", () => ({
  getInitialURL: () => mockGetInitialURL(),
  addEventListener: (event: string, handler: (e: { url: string }) => void) =>
    mockAddEventListener(event, handler),
}));

import { useDeepLinks } from "./useDeepLinks";

type UrlHandler = (e: { url: string }) => void;

function lastHandler(): UrlHandler {
  const call = mockAddEventListener.mock.calls.at(-1);
  if (!call) throw new Error("addEventListener was not called");
  return call[1] as UrlHandler;
}

async function mountHook() {
  const utils = renderHook(() => useDeepLinks());
  // Flush the `Linking.getInitialURL()` microtask so the cold-start
  // branch of the hook has observed its resolved URL before the
  // assertions run.
  await act(async () => {
    await Promise.resolve();
  });
  return utils;
}

describe("useDeepLinks", () => {
  let removeSpy: jest.Mock;

  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockGetInitialURL.mockReset();
    mockAddEventListener.mockReset();
    removeSpy = jest.fn();
    mockAddEventListener.mockReturnValue({ remove: removeSpy });
  });

  it("replaces to the parsed href on cold-start", async () => {
    mockGetInitialURL.mockResolvedValueOnce("sergeant://routine");

    await mountHook();

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/routine");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("pushes the parsed href on warm URL events", async () => {
    mockGetInitialURL.mockResolvedValueOnce(null);
    await mountHook();

    act(() => {
      lastHandler()({ url: "sergeant://finance/tx/tx_9" });
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/(tabs)/finyk/tx/[id]",
      params: { id: "tx_9" },
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("ignores non-sergeant URLs", async () => {
    mockGetInitialURL.mockResolvedValueOnce("https://example.com/routine");
    await mountHook();

    act(() => {
      lastHandler()({ url: "exp://192.168.0.2:19000/routine" });
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("passes auth-callback through silently (Better Auth listener owns it)", async () => {
    mockGetInitialURL.mockResolvedValueOnce(null);
    await mountHook();

    act(() => {
      lastHandler()({ url: "sergeant://auth/callback?token=abc" });
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("does not navigate twice for the same URL", async () => {
    mockGetInitialURL.mockResolvedValueOnce("sergeant://routine");
    await mountHook();

    act(() => {
      lastHandler()({ url: "sergeant://routine" });
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("removes the url listener on unmount", async () => {
    mockGetInitialURL.mockResolvedValueOnce(null);
    const { unmount } = await mountHook();

    unmount();

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
