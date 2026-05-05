import * as crypto from "node:crypto";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import {
  _clearOpenclawGithubAuthCacheForTests,
  _peekOpenclawGithubAuthCacheForTests,
  getOpenclawGithubAuth,
  signAppJwt,
} from "./github-auth.js";
import { env } from "../../env.js";

/**
 * `env` is a frozen `as const` snapshot from `apps/server/src/env.ts`,
 * so we can't reassign its fields directly. Instead we patch
 * `process.env` and re-evaluate the relevant getter via `vi.spyOn`.
 *
 * Pattern: tests stash the original values, mutate the frozen `env`
 * with `Object.defineProperty`, and restore in `afterEach` so we
 * don't bleed state across tests in the same file.
 */
const originalEnv = {
  OPENCLAW_USE_GITHUB_APP: env.OPENCLAW_USE_GITHUB_APP,
  OPENCLAW_GITHUB_APP_ID: env.OPENCLAW_GITHUB_APP_ID,
  OPENCLAW_GITHUB_APP_PRIVATE_KEY: env.OPENCLAW_GITHUB_APP_PRIVATE_KEY,
  OPENCLAW_GITHUB_APP_INSTALLATION_ID: env.OPENCLAW_GITHUB_APP_INSTALLATION_ID,
  OPENCLAW_GITHUB_PAT: env.OPENCLAW_GITHUB_PAT,
};

function patchEnv(overrides: Partial<typeof originalEnv>): void {
  for (const [key, value] of Object.entries(overrides)) {
    Object.defineProperty(env, key, {
      value,
      writable: false,
      configurable: true,
      enumerable: true,
    });
  }
}

function restoreEnv(): void {
  patchEnv(originalEnv);
}

/**
 * Generate a fresh RSA-2048 keypair for the test run. Using a real key
 * (rather than a hard-coded one in source) means we never check secret
 * material into the repo and the test always exercises the same code
 * paths the production-key would.
 */
const { privateKey: TEST_PRIVATE_KEY, publicKey: TEST_PUBLIC_KEY } =
  crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

describe("signAppJwt", () => {
  it("emits a valid RS256 JWT verifiable with the App's public key", () => {
    const jwt = signAppJwt({
      appId: "987654",
      privateKey: TEST_PRIVATE_KEY,
      nowMs: Date.UTC(2026, 4, 1, 12, 0, 0),
    });

    const [headerB64, payloadB64, sigB64] = jwt.split(".");
    expect(headerB64).toBeTruthy();
    expect(payloadB64).toBeTruthy();
    expect(sigB64).toBeTruthy();

    const header = JSON.parse(
      Buffer.from(headerB64!, "base64url").toString("utf-8"),
    );
    const payload = JSON.parse(
      Buffer.from(payloadB64!, "base64url").toString("utf-8"),
    );
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });
    expect(payload.iss).toBe("987654");

    // iat backdated 60s, exp = iat + 9*60 + 60 = iat + 600 from "now"
    const nowSec = Math.floor(Date.UTC(2026, 4, 1, 12, 0, 0) / 1000);
    expect(payload.iat).toBe(nowSec - 60);
    expect(payload.exp).toBe(nowSec + 9 * 60);

    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();
    expect(
      verifier.verify(TEST_PUBLIC_KEY, Buffer.from(sigB64!, "base64url")),
    ).toBe(true);
  });

  it("repairs literal '\\n' in the private-key body (Vercel/Railway flatten)", () => {
    // Some secret-stores serialize multi-line PEMs as a single line with
    // `\n` literals. The signer must repair those before signing or the
    // OpenSSL parser rejects the key.
    const flattened = TEST_PRIVATE_KEY.split("\n").join("\\n");
    expect(flattened).toContain("\\n");
    expect(flattened).not.toContain("\n");

    const jwt = signAppJwt({
      appId: "1",
      privateKey: flattened,
      nowMs: Date.UTC(2026, 4, 1, 12, 0, 0),
    });
    const [headerB64, payloadB64, sigB64] = jwt.split(".");
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();
    expect(
      verifier.verify(TEST_PUBLIC_KEY, Buffer.from(sigB64!, "base64url")),
    ).toBe(true);
  });
});

describe("getOpenclawGithubAuth", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    _clearOpenclawGithubAuthCacheForTests();
    fetchSpy = vi.spyOn(globalThis, "fetch") as unknown as MockInstance<
      typeof fetch
    >;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv();
    _clearOpenclawGithubAuthCacheForTests();
  });

  it("returns null when neither App nor PAT is configured", async () => {
    patchEnv({
      OPENCLAW_USE_GITHUB_APP: false,
      OPENCLAW_GITHUB_APP_ID: "",
      OPENCLAW_GITHUB_APP_PRIVATE_KEY: "",
      OPENCLAW_GITHUB_APP_INSTALLATION_ID: "",
      OPENCLAW_GITHUB_PAT: "",
    });
    expect(await getOpenclawGithubAuth()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns the legacy PAT when feature flag is off", async () => {
    patchEnv({
      OPENCLAW_USE_GITHUB_APP: false,
      // App credentials present — must NOT be used while flag=false
      OPENCLAW_GITHUB_APP_ID: "1",
      OPENCLAW_GITHUB_APP_PRIVATE_KEY: TEST_PRIVATE_KEY,
      OPENCLAW_GITHUB_APP_INSTALLATION_ID: "2",
      OPENCLAW_GITHUB_PAT: "ghp_legacy_pat",
    });
    const auth = await getOpenclawGithubAuth();
    expect(auth).toEqual({ token: "ghp_legacy_pat", source: "pat" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to PAT when flag is on but App creds are incomplete", async () => {
    patchEnv({
      OPENCLAW_USE_GITHUB_APP: true,
      OPENCLAW_GITHUB_APP_ID: "1",
      OPENCLAW_GITHUB_APP_PRIVATE_KEY: "", // missing — must not attempt App-flow
      OPENCLAW_GITHUB_APP_INSTALLATION_ID: "2",
      OPENCLAW_GITHUB_PAT: "ghp_legacy_pat",
    });
    const auth = await getOpenclawGithubAuth();
    expect(auth).toEqual({ token: "ghp_legacy_pat", source: "pat" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("mints an installation-token via the GitHub App flow when configured", async () => {
    patchEnv({
      OPENCLAW_USE_GITHUB_APP: true,
      OPENCLAW_GITHUB_APP_ID: "111",
      OPENCLAW_GITHUB_APP_PRIVATE_KEY: TEST_PRIVATE_KEY,
      OPENCLAW_GITHUB_APP_INSTALLATION_ID: "222",
      OPENCLAW_GITHUB_PAT: "ghp_should_not_be_used",
    });

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ token: "ghs_install_xyz", expires_at: expiresAt }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    const auth = await getOpenclawGithubAuth();
    expect(auth).toEqual({ token: "ghs_install_xyz", source: "app" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.github.com/app/installations/222/access_tokens",
    );
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toMatch(/^Bearer eyJ/); // a JWT
    expect(headers["Accept"]).toBe("application/vnd.github+json");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });

  it("caches installation-tokens until 5 minutes before expiry", async () => {
    patchEnv({
      OPENCLAW_USE_GITHUB_APP: true,
      OPENCLAW_GITHUB_APP_ID: "111",
      OPENCLAW_GITHUB_APP_PRIVATE_KEY: TEST_PRIVATE_KEY,
      OPENCLAW_GITHUB_APP_INSTALLATION_ID: "222",
      OPENCLAW_GITHUB_PAT: "",
    });

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ token: "ghs_first_call", expires_at: expiresAt }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    const first = await getOpenclawGithubAuth();
    const second = await getOpenclawGithubAuth();
    expect(first?.token).toBe("ghs_first_call");
    expect(second?.token).toBe("ghs_first_call");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    expect(_peekOpenclawGithubAuthCacheForTests()?.token).toBe(
      "ghs_first_call",
    );
  });

  it("returns null (does NOT silently fall back to PAT) when App-flow fails", async () => {
    // Falling back to PAT on an App failure would mask config drift —
    // e.g. an expired private key keeping production limping on the
    // legacy path forever. Surfacing null forces the caller to return
    // 'not_configured' which an operator will notice in audit-logs.
    patchEnv({
      OPENCLAW_USE_GITHUB_APP: true,
      OPENCLAW_GITHUB_APP_ID: "111",
      OPENCLAW_GITHUB_APP_PRIVATE_KEY: TEST_PRIVATE_KEY,
      OPENCLAW_GITHUB_APP_INSTALLATION_ID: "222",
      OPENCLAW_GITHUB_PAT: "ghp_legacy_pat_should_not_save_us",
    });

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Bad credentials" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const auth = await getOpenclawGithubAuth();
    expect(auth).toBeNull();
  });
});
