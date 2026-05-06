import { render } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { SyncStatusIndicator } from "./SyncStatusIndicator";
import { SyncStatusOverlay } from "./SyncStatusOverlay";

jest.mock("@/sync/hook/useSyncStatus", () => ({
  useSyncStatus: jest.fn(),
}));

jest.mock("react-native-safe-area-context", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  return {
    SafeAreaView: View,
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useSyncStatus } = require("@/sync/hook/useSyncStatus") as {
  useSyncStatus: jest.Mock;
};

function mockStatus(overrides: {
  dirtyCount?: number;
  queuedCount?: number;
  isOnline?: boolean;
}) {
  useSyncStatus.mockReturnValue({
    dirtyCount: overrides.dirtyCount ?? 0,
    queuedCount: overrides.queuedCount ?? 0,
    isOnline: overrides.isOnline ?? true,
  });
}

function stubAccessibility() {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(false);
  jest
    .spyOn(AccessibilityInfo, "addEventListener")
    .mockImplementation(() => ({ remove: () => {} }) as never);
}

describe("SyncStatusIndicator", () => {
  beforeEach(stubAccessibility);

  afterEach(() => {
    jest.restoreAllMocks();
    useSyncStatus.mockReset();
  });

  it("collapses to null while idle in silent mode", () => {
    mockStatus({});
    const { toJSON } = render(
      <SyncStatusIndicator variant="silent-when-idle" />,
    );
    expect(toJSON()).toBeNull();
  });

  it("renders a progressbar when queued work exists", () => {
    mockStatus({ queuedCount: 3 });
    const { UNSAFE_getByProps } = render(<SyncStatusIndicator />);
    expect(
      UNSAFE_getByProps({ accessibilityRole: "progressbar" }),
    ).toBeTruthy();
  });

  it("renders an alert when offline", () => {
    mockStatus({ isOnline: false });
    const { UNSAFE_getByProps } = render(<SyncStatusIndicator />);
    expect(UNSAFE_getByProps({ accessibilityRole: "alert" })).toBeTruthy();
  });

  it("renders an alert when an explicit error prop is provided", () => {
    mockStatus({});
    const { UNSAFE_getByProps } = render(
      <SyncStatusIndicator error="Network timeout" />,
    );
    expect(UNSAFE_getByProps({ accessibilityRole: "alert" })).toBeTruthy();
  });
});

describe("SyncStatusOverlay", () => {
  beforeEach(stubAccessibility);

  afterEach(() => {
    jest.restoreAllMocks();
    useSyncStatus.mockReset();
  });

  it("stays silent while idle without the removed CloudSyncProvider", () => {
    mockStatus({});
    const { toJSON } = render(<SyncStatusOverlay />);
    expect(toJSON()).not.toBeNull();
  });

  it("still surfaces queued work from the status hook", () => {
    mockStatus({ queuedCount: 2 });
    const { UNSAFE_getByProps } = render(<SyncStatusOverlay />);
    expect(
      UNSAFE_getByProps({ accessibilityRole: "progressbar" }),
    ).toBeTruthy();
  });
});
