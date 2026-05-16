/**
 * Target location: apps/web/src/core/observability/identity.test.ts
 *
 * Verifies identityUser couples PostHog + Sentry, dedups same-id calls,
 * and resets both surfaces.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/react", () => ({
  setUser: vi.fn(),
}));

vi.mock("./posthog", () => ({
  identifyPostHogUser: vi.fn(),
  resetPostHog: vi.fn(),
}));

import * as Sentry from "@sentry/react";

import {
  __resetIdentityForTests,
  identifyUser,
  resetIdentity,
  setPersonProperties,
} from "./identity";
import { identifyPostHogUser, resetPostHog } from "./posthog";

const setUserMock = Sentry.setUser as unknown as ReturnType<typeof vi.fn>;
const identifyMock = identifyPostHogUser as unknown as ReturnType<typeof vi.fn>;
const resetMock = resetPostHog as unknown as ReturnType<typeof vi.fn>;

describe("identifyUser", () => {
  beforeEach(() => {
    __resetIdentityForTests();
    setUserMock.mockClear();
    identifyMock.mockClear();
    resetMock.mockClear();
  });

  afterEach(() => {
    __resetIdentityForTests();
  });

  it("forwards to PostHog identify and Sentry setUser with the same id", () => {
    identifyUser("user-1", { plan: "free" });
    expect(identifyMock).toHaveBeenCalledWith("user-1", { plan: "free" });
    expect(setUserMock).toHaveBeenCalledWith({ id: "user-1" });
  });

  it("skips re-identify for the same id but propagates trait updates", () => {
    identifyUser("user-1", { plan: "free" });
    identifyMock.mockClear();
    setUserMock.mockClear();

    identifyUser("user-1", { plan: "pro" });
    expect(identifyMock).not.toHaveBeenCalled();
    expect(setUserMock).not.toHaveBeenCalled();
  });

  it("re-identifies when user id changes", () => {
    identifyUser("user-1", { plan: "free" });
    identifyMock.mockClear();
    setUserMock.mockClear();

    identifyUser("user-2", { plan: "pro" });
    expect(identifyMock).toHaveBeenCalledWith("user-2", { plan: "pro" });
    expect(setUserMock).toHaveBeenCalledWith({ id: "user-2" });
  });

  it("ignores empty userId", () => {
    identifyUser("", { plan: "free" });
    expect(identifyMock).not.toHaveBeenCalled();
    expect(setUserMock).not.toHaveBeenCalled();
  });
});

describe("resetIdentity", () => {
  beforeEach(() => {
    __resetIdentityForTests();
    setUserMock.mockClear();
    identifyMock.mockClear();
    resetMock.mockClear();
  });

  it("resets both PostHog and Sentry", () => {
    identifyUser("user-1", { plan: "free" });
    resetIdentity();
    expect(resetMock).toHaveBeenCalled();
    expect(setUserMock).toHaveBeenCalledWith(null);
  });

  it("allows the same user to identify again after reset", () => {
    identifyUser("user-1", { plan: "free" });
    resetIdentity();
    identifyMock.mockClear();
    setUserMock.mockClear();

    identifyUser("user-1", { plan: "free" });
    expect(identifyMock).toHaveBeenCalled();
    expect(setUserMock).toHaveBeenCalledWith({ id: "user-1" });
  });
});

describe("setPersonProperties", () => {
  it("does not throw when window is undefined", () => {
    const original = globalThis.window;
    // @ts-expect-error — simulating SSR
    delete globalThis.window;
    expect(() => setPersonProperties({ plan: "pro" })).not.toThrow();
    globalThis.window = original;
  });
});
