import { afterEach, describe, expect, it } from "vitest";
import { isHubStreaming, setHubStreaming } from "./streamingStore";

describe("streamingStore", () => {
  afterEach(() => {
    setHubStreaming(false);
  });

  it("defaults to not streaming", () => {
    expect(isHubStreaming()).toBe(false);
  });

  it("reflects setHubStreaming(true) while a send is in flight", () => {
    setHubStreaming(true);
    expect(isHubStreaming()).toBe(true);
  });

  it("clears the flag when setHubStreaming(false) runs in finally", () => {
    setHubStreaming(true);
    setHubStreaming(false);
    expect(isHubStreaming()).toBe(false);
  });
});
