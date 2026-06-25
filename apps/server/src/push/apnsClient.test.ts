import { afterEach, describe, expect, it, vi } from "vitest";

interface LoadedApnsClient {
  apnsBundleId(): string | null;
  getApnsProvider(): unknown;
  loadApnsKey(raw: string): string;
}

async function loadApnsClient(envOverrides: Record<string, unknown> = {}) {
  vi.resetModules();
  const loggerWarn = vi.fn();
  const providerCtor = vi.fn();

  class Provider {
    constructor(config: unknown) {
      providerCtor(config);
    }
  }

  vi.doMock("../env/env.js", () => ({
    env: {
      APNS_P8_KEY: "",
      APNS_KEY_ID: "",
      APNS_TEAM_ID: "",
      APNS_BUNDLE_ID: "",
      APNS_PRODUCTION: "false",
      ...envOverrides,
    },
  }));
  vi.doMock("../obs/logger.js", () => ({
    logger: { warn: loggerWarn },
  }));
  vi.doMock("@parse/node-apn", () => ({
    default: { Provider },
  }));

  const mod = (await import("./apnsClient.js")) as LoadedApnsClient;
  return { mod, loggerWarn, providerCtor };
}

describe("apnsClient", () => {
  afterEach(() => {
    vi.doUnmock("../env/env.js");
    vi.doUnmock("../obs/logger.js");
    vi.doUnmock("@parse/node-apn");
  });

  it("normalizes p8 keys from escaped and native newlines", async () => {
    const { mod } = await loadApnsClient();

    expect(mod.loadApnsKey("  line1\\r\\nline2\\n  ")).toBe("line1\nline2\n");
    expect(mod.loadApnsKey("line1\r\nline2\rline3")).toBe(
      "line1\nline2\nline3\n",
    );
    expect(mod.loadApnsKey("   ")).toBe("");
  });

  it("returns null and warns once when APNS_P8_KEY is missing", async () => {
    const { mod, loggerWarn, providerCtor } = await loadApnsClient();

    expect(mod.getApnsProvider()).toBeNull();
    expect(mod.getApnsProvider()).toBeNull();
    expect(mod.apnsBundleId()).toBeNull();

    expect(providerCtor).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalledTimes(1);
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: expect.stringContaining("no APNS_P8_KEY"),
      }),
    );
  });

  it("returns null when required APNs metadata is incomplete", async () => {
    const { mod, loggerWarn, providerCtor } = await loadApnsClient({
      APNS_P8_KEY:
        "-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----",
      APNS_KEY_ID: "key-id",
      APNS_TEAM_ID: "",
      APNS_BUNDLE_ID: "com.sergeant.app",
    });

    expect(mod.getApnsProvider()).toBeNull();
    expect(mod.apnsBundleId()).toBeNull();
    expect(providerCtor).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: expect.stringContaining("APNs config incomplete"),
        hasKeyId: true,
        hasTeamId: false,
        hasBundleId: true,
      }),
    );
  });

  it("returns null when key normalization produces an empty key", async () => {
    const { mod, loggerWarn, providerCtor } = await loadApnsClient({
      APNS_P8_KEY: "   ",
      APNS_KEY_ID: "key-id",
      APNS_TEAM_ID: "team-id",
      APNS_BUNDLE_ID: "com.sergeant.app",
    });

    expect(mod.getApnsProvider()).toBeNull();
    expect(providerCtor).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: expect.stringContaining("no APNS_P8_KEY"),
      }),
    );
  });

  it("creates and caches a provider for valid APNs config", async () => {
    const { mod, providerCtor, loggerWarn } = await loadApnsClient({
      APNS_P8_KEY:
        "-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----",
      APNS_KEY_ID: "key-id",
      APNS_TEAM_ID: "team-id",
      APNS_BUNDLE_ID: "com.sergeant.app",
      APNS_PRODUCTION: "true",
    });

    const first = mod.getApnsProvider();
    const second = mod.getApnsProvider();

    expect(first).toBe(second);
    expect(mod.apnsBundleId()).toBe("com.sergeant.app");
    expect(providerCtor).toHaveBeenCalledTimes(1);
    expect(providerCtor).toHaveBeenCalledWith({
      token: {
        key: "-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----\n",
        keyId: "key-id",
        teamId: "team-id",
      },
      production: true,
    });
    expect(loggerWarn).not.toHaveBeenCalled();
  });
});
