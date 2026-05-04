/**
 * Jest coverage for `<AnalyticsIdentityBridge/>`. Mocks `useUser()`
 * and the PostHog transport so we can drive identify/reset transitions
 * deterministically — same idea as `PushRegistrar`-style bridges.
 */

import { render } from "@testing-library/react-native";

const useUserMock = jest.fn();

jest.mock("@sergeant/api-client/react", () => ({
  __esModule: true,
  useUser: () => useUserMock(),
}));

jest.mock("@/lib/observability/posthog", () => ({
  __esModule: true,
  identifyPostHogUser: jest.fn(),
  resetPostHog: jest.fn(),
}));

jest.mock("@/lib/observability/identifyTraits", () => ({
  __esModule: true,
  buildIdentifyTraits: jest.fn((user: { id: string }) => ({
    plan: "free",
    _id: user.id,
  })),
}));

import { AnalyticsIdentityBridge } from "./AnalyticsIdentityBridge";
import { buildIdentifyTraits } from "@/lib/observability/identifyTraits";
import { identifyPostHogUser, resetPostHog } from "@/lib/observability/posthog";

const identifyMock = identifyPostHogUser as jest.Mock;
const resetMock = resetPostHog as jest.Mock;
const buildTraitsMock = buildIdentifyTraits as jest.Mock;

const SAMPLE_USER = {
  id: "user-1",
  email: "u@example.com",
  name: null,
  image: null,
  emailVerified: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("AnalyticsIdentityBridge", () => {
  beforeEach(() => {
    useUserMock.mockReset();
    identifyMock.mockReset();
    resetMock.mockReset();
    buildTraitsMock.mockClear();
  });

  it("не викликає identify/reset поки isPending=true", () => {
    useUserMock.mockReturnValue({ data: undefined, isPending: true });

    render(<AnalyticsIdentityBridge />);

    expect(identifyMock).not.toHaveBeenCalled();
    expect(resetMock).not.toHaveBeenCalled();
  });

  it("викликає identify коли зʼявляється userId", () => {
    useUserMock.mockReturnValue({
      data: { user: SAMPLE_USER },
      isPending: false,
    });

    render(<AnalyticsIdentityBridge />);

    expect(buildTraitsMock).toHaveBeenCalledWith(SAMPLE_USER);
    expect(identifyMock).toHaveBeenCalledWith("user-1", {
      plan: "free",
      _id: "user-1",
    });
    expect(resetMock).not.toHaveBeenCalled();
  });

  it("re-render із тим самим userId не дублює identify", () => {
    useUserMock.mockReturnValue({
      data: { user: SAMPLE_USER },
      isPending: false,
    });

    const { rerender } = render(<AnalyticsIdentityBridge />);
    rerender(<AnalyticsIdentityBridge />);

    expect(identifyMock).toHaveBeenCalledTimes(1);
  });

  it("викликає reset на переході authenticated → unauthenticated", () => {
    useUserMock.mockReturnValue({
      data: { user: SAMPLE_USER },
      isPending: false,
    });
    const { rerender } = render(<AnalyticsIdentityBridge />);
    expect(identifyMock).toHaveBeenCalledTimes(1);

    useUserMock.mockReturnValue({
      data: { user: null },
      isPending: false,
    });
    rerender(<AnalyticsIdentityBridge />);

    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it("при cold-start без сесії (user=null від першого fetch) не викликає reset", () => {
    useUserMock.mockReturnValue({
      data: { user: null },
      isPending: false,
    });

    render(<AnalyticsIdentityBridge />);

    expect(resetMock).not.toHaveBeenCalled();
    expect(identifyMock).not.toHaveBeenCalled();
  });
});
