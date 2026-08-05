import { vi } from "vitest";
/**
 * Reconciliation logic between `hub_biometrics_v1` (local, device-only)
 * and `/api/me/profile` (server write-through row, migration 115).
 *
 * Contract under test (see the module doc comment for the full write-up):
 *
 *   - local empty + server has a row → hydrate local from server.
 *   - server has no row → push local, if local has real data.
 *   - both have data → newer `updatedAt` wins.
 */
const { mockUpdateProfile } = vi.hoisted(() => ({
  mockUpdateProfile: vi.fn().mockResolvedValue({
    profile: {},
    updatedAt: null,
  }),
}));
vi.mock("@shared/api", () => ({
  meApi: { updateProfile: mockUpdateProfile },
}));

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEYS } from "@sergeant/shared";
import type { UserProfileResponse } from "@shared/api";
import {
  BIOMETRICS_DEFAULT,
  readBiometrics,
  setBiometricsOwner,
  writeBiometrics,
  type Biometrics,
} from "./biometrics";
import {
  pushBiometricsToServer,
  reconcileBiometricsWithServerProfile,
} from "./profileWriteThrough";

/** The authenticated session every test reconciles as, unless noted. */
const CURRENT_USER = "user-1";

const FRESH: Biometrics = {
  heightCm: 178,
  birthDate: "1990-05-12",
  sex: "male",
  activityLevel: "moderate",
  weightKg: 80,
  weightUpdatedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const OLDER: Biometrics = {
  ...FRESH,
  heightCm: 170,
  updatedAt: "2025-01-01T00:00:00.000Z",
  weightUpdatedAt: "2025-01-01T00:00:00.000Z",
};

const NEWER: Biometrics = {
  ...FRESH,
  heightCm: 190,
  updatedAt: "2027-01-01T00:00:00.000Z",
  weightUpdatedAt: "2027-01-01T00:00:00.000Z",
};

function serverResponse(profile: Biometrics): UserProfileResponse {
  return { profile, updatedAt: profile.updatedAt };
}

const NO_SERVER_ROW: UserProfileResponse = { profile: {}, updatedAt: null };

beforeEach(() => {
  localStorage.clear();
  setBiometricsOwner(null);
  mockUpdateProfile.mockClear();
  mockUpdateProfile.mockResolvedValue(NO_SERVER_ROW);
});

afterEach(() => {
  localStorage.clear();
  setBiometricsOwner(null);
});

describe("pushBiometricsToServer", () => {
  it("PUTs the biometrics snapshot", async () => {
    await pushBiometricsToServer(FRESH);
    expect(mockUpdateProfile).toHaveBeenCalledWith(FRESH);
  });

  it("never throws when the network call fails", async () => {
    mockUpdateProfile.mockRejectedValueOnce(new Error("network down"));
    await expect(pushBiometricsToServer(FRESH)).resolves.toBeUndefined();
  });
});

describe("reconcileBiometricsWithServerProfile", () => {
  it("hydrates local from the server when local was never written", async () => {
    expect(readBiometrics()).toEqual(BIOMETRICS_DEFAULT);

    await reconcileBiometricsWithServerProfile(
      serverResponse(FRESH),
      CURRENT_USER,
    );

    expect(readBiometrics()).toEqual(FRESH);
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it("does nothing when both local and server are empty", async () => {
    await reconcileBiometricsWithServerProfile(NO_SERVER_ROW, CURRENT_USER);

    expect(readBiometrics()).toEqual(BIOMETRICS_DEFAULT);
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it("pushes local up when the server has no row yet but local has real data owned by the current user", async () => {
    setBiometricsOwner(CURRENT_USER);
    writeBiometrics(FRESH);

    await reconcileBiometricsWithServerProfile(NO_SERVER_ROW, CURRENT_USER);

    expect(mockUpdateProfile).toHaveBeenCalledWith(FRESH);
    // Local is untouched — it was the source of truth in this branch.
    expect(readBiometrics()).toEqual(FRESH);
  });

  it("pushes local to the server when local is newer (LWW: local wins)", async () => {
    setBiometricsOwner(CURRENT_USER);
    writeBiometrics(NEWER);

    await reconcileBiometricsWithServerProfile(
      serverResponse(FRESH),
      CURRENT_USER,
    );

    expect(mockUpdateProfile).toHaveBeenCalledWith(NEWER);
    expect(readBiometrics()).toEqual(NEWER);
  });

  it("hydrates local from the server when the server is newer (LWW: server wins)", async () => {
    setBiometricsOwner(CURRENT_USER);
    writeBiometrics(OLDER);

    await reconcileBiometricsWithServerProfile(
      serverResponse(FRESH),
      CURRENT_USER,
    );

    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(readBiometrics()).toEqual(FRESH);
  });

  it("treats a malformed server payload as 'no row' (defensive parse)", async () => {
    setBiometricsOwner(CURRENT_USER);
    writeBiometrics(FRESH);

    await reconcileBiometricsWithServerProfile(
      {
        profile: { garbage: true },
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      CURRENT_USER,
    );

    // Server row fails BiometricsSchema.safeParse → treated as no usable
    // row; local (which has real data, owned by the current user) gets
    // pushed instead of losing it.
    expect(mockUpdateProfile).toHaveBeenCalledWith(FRESH);
    expect(readBiometrics()).toEqual(FRESH);
  });
});

// CodeRabbit PR #627 — cross-account biometrics upload. `hub_biometrics_v1`
// is a single global localStorage key (no per-user partition, unlike the
// SQLite kvvfs case in `sqlite.kvvfsWipe.test.ts`), so on a shared device a
// leftover snapshot from a PREVIOUS session can still be read by
// `reconcileBiometricsWithServerProfile` for the CURRENT one.
describe("reconcileBiometricsWithServerProfile — cross-account upload guard", () => {
  const USER_A = "user-a";
  const USER_B = "user-b";

  it("does NOT upload user A's leftover local snapshot under user B's session when the server has no row for B", async () => {
    setBiometricsOwner(USER_A);
    writeBiometrics(FRESH); // A saves biometrics locally while signed in.

    setBiometricsOwner(USER_B); // B signs in on the same shared device.
    await reconcileBiometricsWithServerProfile(NO_SERVER_ROW, USER_B);

    expect(mockUpdateProfile).not.toHaveBeenCalled();
    // The snapshot is left exactly as A wrote it — reconcile declines to
    // touch data it can't attribute to the current session.
    expect(readBiometrics()).toEqual(FRESH);
  });

  it("still uploads when the local snapshot is the current user's own data", async () => {
    setBiometricsOwner(USER_A);
    writeBiometrics(FRESH);

    await reconcileBiometricsWithServerProfile(NO_SERVER_ROW, USER_A);

    expect(mockUpdateProfile).toHaveBeenCalledWith(FRESH);
  });

  it("treats a legacy snapshot with no ownerId tag (written before this fix) as unknown — never uploads it either", async () => {
    localStorage.setItem(STORAGE_KEYS.HUB_BIOMETRICS, JSON.stringify(FRESH));

    await reconcileBiometricsWithServerProfile(NO_SERVER_ROW, USER_A);

    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });
});

// Sanity: the storage key this module reads/writes matches the one
// `useBiometrics` subscribes to, so the reconcile's `writeBiometrics` call
// actually re-renders any mounted BiometricsSection.
describe("storage key parity", () => {
  it("HUB_BIOMETRICS is the key used by writeBiometrics", () => {
    writeBiometrics(FRESH);
    const raw = localStorage.getItem(STORAGE_KEYS.HUB_BIOMETRICS);
    expect(raw).not.toBeNull();
  });
});
