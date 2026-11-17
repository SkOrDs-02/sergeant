/**
 * sec-18: `/sign-in?next=<шлях>` — після входу екран веде на `next`, але лише
 * на відносний внутрішній шлях (захист від open redirect).
 */
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { renderStandaloneRoute } from "./StandaloneRoutes";
import type { useAuth } from "../auth/AuthContext";

vi.mock("../onboarding/onboardingGate", () => ({
  shouldShowOnboarding: () => false,
  markOnboardingDone: () => {},
}));

type AuthUser = ReturnType<typeof useAuth>["user"];
const authedUser = { id: "u1", email: "u@example.com" } as AuthUser;
const noop = () => {};

function redirectTarget(search: string | undefined): string {
  const el = renderStandaloneRoute({
    pathname: "/sign-in",
    ...(search === undefined ? {} : { search }),
    user: authedUser,
    authLoading: false,
    storageReady: true,
    onLeaveAuth: noop,
    onLeaveWelcome: noop,
    onOpenAuth: noop,
    onAssistantClose: noop,
  }) as ReactElement<{ to: string }>;
  return el.props.to;
}

describe("/sign-in: споживання параметра next", () => {
  it("веде на next після входу (з query)", () => {
    expect(
      redirectTarget(`?next=${encodeURIComponent("/finyk/transactions?x=1")}`),
    ).toBe("/finyk/transactions?x=1");
  });

  it("без next веде на хаб", () => {
    expect(redirectTarget("")).toBe("/");
    expect(redirectTarget(undefined)).toBe("/");
  });

  it.each([
    "https://evil.example/phish",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "evil.example",
    "/sign-in",
  ])("відкидає небезпечний next %s", (bad) => {
    expect(redirectTarget(`?next=${encodeURIComponent(bad)}`)).toBe("/");
  });
});
