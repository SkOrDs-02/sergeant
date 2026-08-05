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
  writeBiometrics,
  type Biometrics,
} from "./biometrics";
import {
  pushBiometricsToServer,
  reconcileBiometricsWithServerProfile,
} from "./profileWriteThrough";

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
  mockUpdateProfile.mockClear();
  mockUpdateProfile.mockResolvedValue(NO_SERVER_ROW);
});

afterEach(() => {
  localStorage.clear();
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

    await reconcileBiometricsWithServerProfile(serverResponse(FRESH));

    expect(readBiometrics()).toEqual(FRESH);
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it("does nothing when both local and server are empty", async () => {
    await reconcileBiometricsWithServerProfile(NO_SERVER_ROW);

    expect(readBiometrics()).toEqual(BIOMETRICS_DEFAULT);
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it("pushes local up when the server has no row yet but local has real data", async () => {
    writeBiometrics(FRESH);

    await reconcileBiometricsWithServerProfile(NO_SERVER_ROW);

    expect(mockUpdateProfile).toHaveBeenCalledWith(FRESH);
    // Local is untouched — it was the source of truth in this branch.
    expect(readBiometrics()).toEqual(FRESH);
  });

  it("pushes local to the server when local is newer (LWW: local wins)", async () => {
    writeBiometrics(NEWER);

    await reconcileBiometricsWithServerProfile(serverResponse(FRESH));

    expect(mockUpdateProfile).toHaveBeenCalledWith(NEWER);
    expect(readBiometrics()).toEqual(NEWER);
  });

  it("hydrates local from the server when the server is newer (LWW: server wins)", async () => {
    writeBiometrics(OLDER);

    await reconcileBiometricsWithServerProfile(serverResponse(FRESH));

    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(readBiometrics()).toEqual(FRESH);
  });

  it("treats a malformed server payload as 'no row' (defensive parse)", async () => {
    writeBiometrics(FRESH);

    await reconcileBiometricsWithServerProfile({
      profile: { garbage: true },
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    // Server row fails BiometricsSchema.safeParse → treated as no usable
    // row; local (which has real data) gets pushed instead of losing it.
    expect(mockUpdateProfile).toHaveBeenCalledWith(FRESH);
    expect(readBiometrics()).toEqual(FRESH);
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
