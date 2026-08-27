import { vi } from "vitest";
/**
 * Reconciliation logic between `hub_biometrics_v1` / `hub_user_profile_v1`
 * (local, device-only) and `/api/me/profile` (server write-through row,
 * migration 115).
 *
 * Contract under test (see the module doc comment for the full write-up):
 *
 *   - local empty + server has data → hydrate local from server.
 *   - server has no data → push local, if local has real data owned by
 *     the current session.
 *   - both have data → newer `updatedAt` wins.
 *
 * L-8 (2026-08-08, profile-settings-deep-audit) added the memory-bank leg
 * (previously biometrics-only) — see the dedicated `describe` blocks below
 * for the memory-bank-specific traps: combined payload (#1), 16KB budget
 * (#2), payload nesting depth (#3), cross-account guard (#4), legacy
 * `updatedAt` semantics (#5).
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
import { STORAGE_KEYS, UserProfilePayloadSchema } from "@sergeant/shared";
import type { UserProfileResponse } from "@shared/api";
import {
  BIOMETRICS_DEFAULT,
  readBiometrics,
  setBiometricsOwner,
  writeBiometrics,
  type Biometrics,
} from "./biometrics";
import {
  MEMORY_BANK_META_EPOCH,
  readMemoryBankMeta,
  readMemoryEntries,
  setMemoryBankOwner,
  writeMemoryEntries,
} from "./memoryBank";
import type { MemoryEntry } from "./types";
import { myProfile } from "../lib/chatActions/crossActions/memoryHandlers";
import {
  pushBiometricsToServer,
  pushMemoryBankToServer,
  reconcileBiometricsWithServerProfile,
  reconcileMemoryBankWithServerProfile,
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

/** Wire shape of an empty, never-locally-touched memory bank. */
const EMPTY_WIRE_MEMORY_BANK = {
  entries: [] as MemoryEntry[],
  updatedAt: MEMORY_BANK_META_EPOCH,
};

/**
 * Expected combined `PUT /api/me/profile` body — mirrors
 * `buildProfilePayload` in `profileWriteThrough.ts` (L-8 trap #1: every
 * push must carry BOTH halves).
 */
function combined(
  biometrics: Biometrics,
  memoryBank: {
    entries: MemoryEntry[];
    updatedAt: string;
  } = EMPTY_WIRE_MEMORY_BANK,
) {
  return { ...biometrics, memoryBank };
}

function serverResponse(profile: Biometrics): UserProfileResponse {
  return { profile, updatedAt: profile.updatedAt };
}

const NO_SERVER_ROW: UserProfileResponse = { profile: {}, updatedAt: null };

/** A pre-L-8 server row: real biometrics, but no `memoryBank` key at all. */
const BIOMETRICS_ONLY_SERVER_ROW: UserProfileResponse = serverResponse(FRESH);

function serverMemoryBank(
  entries: MemoryEntry[],
  updatedAt: string,
): UserProfileResponse {
  return {
    profile: { memoryBank: { entries, updatedAt } },
    updatedAt,
  };
}

const FACT_A: MemoryEntry = {
  id: "m1",
  fact: "Любить каву без цукру",
  category: "preference",
  createdAt: "2026-01-01T00:00:00.000Z",
};
const FACT_B: MemoryEntry = {
  id: "m2",
  fact: "Хоче бігати марафон",
  category: "goal",
  createdAt: "2026-02-01T00:00:00.000Z",
};

beforeEach(() => {
  localStorage.clear();
  setBiometricsOwner(null);
  setMemoryBankOwner(null);
  mockUpdateProfile.mockClear();
  mockUpdateProfile.mockResolvedValue(NO_SERVER_ROW);
});

afterEach(() => {
  localStorage.clear();
  setBiometricsOwner(null);
  setMemoryBankOwner(null);
});

describe("pushBiometricsToServer", () => {
  it("PUTs the biometrics snapshot combined with the (empty) local memory bank", async () => {
    await pushBiometricsToServer(FRESH);
    expect(mockUpdateProfile).toHaveBeenCalledWith(combined(FRESH));
  });

  it("never throws when the network call fails", async () => {
    mockUpdateProfile.mockRejectedValueOnce(new Error("network down"));
    await expect(pushBiometricsToServer(FRESH)).resolves.toBeUndefined();
  });

  // L-8 trap #1 — the central trap. A biometrics push must NOT wholesale-
  // replace a memory bank that already exists locally on this device.
  it("combines the CURRENT local memory bank into the push, never a bare biometrics object", async () => {
    setMemoryBankOwner(CURRENT_USER);
    writeMemoryEntries([FACT_A]);
    mockUpdateProfile.mockClear(); // drop the auto-fired push isn't wired here; explicit call below

    await pushBiometricsToServer(FRESH);

    const [sent] = mockUpdateProfile.mock.calls[0]!;
    expect(sent.heightCm).toBe(FRESH.heightCm);
    expect(sent.memoryBank.entries).toEqual([FACT_A]);
  });
});

describe("pushMemoryBankToServer", () => {
  it("PUTs the memory bank combined with the (default) local biometrics", async () => {
    await pushMemoryBankToServer([FACT_A]);
    const [sent] = mockUpdateProfile.mock.calls[0]!;
    expect(sent.heightCm).toBe(BIOMETRICS_DEFAULT.heightCm);
    expect(sent.memoryBank.entries).toEqual([FACT_A]);
  });

  it("never throws when the network call fails", async () => {
    mockUpdateProfile.mockRejectedValueOnce(new Error("network down"));
    await expect(pushMemoryBankToServer([FACT_A])).resolves.toBeUndefined();
  });

  // L-8 trap #1, mirror image — a memory-bank push must NOT wholesale-
  // replace biometrics that already exist locally on this device.
  it("combines the CURRENT local biometrics into the push, never a bare entries array", async () => {
    setBiometricsOwner(CURRENT_USER);
    writeBiometrics(FRESH);

    await pushMemoryBankToServer([FACT_A]);

    const [sent] = mockUpdateProfile.mock.calls[0]!;
    expect(sent.heightCm).toBe(FRESH.heightCm);
    expect(sent.weightKg).toBe(FRESH.weightKg);
    expect(sent.memoryBank.entries).toEqual([FACT_A]);
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

    expect(mockUpdateProfile).toHaveBeenCalledWith(combined(FRESH));
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

    expect(mockUpdateProfile).toHaveBeenCalledWith(combined(NEWER));
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
    expect(mockUpdateProfile).toHaveBeenCalledWith(combined(FRESH));
    expect(readBiometrics()).toEqual(FRESH);
  });

  // L-8: an existing row that ALREADY carries a `memoryBank` section
  // (pushed by a device running the fixed build) must still parse fine —
  // `BiometricsSchema.safeParse` strips unknown keys by default.
  it("ignores an embedded memoryBank section when parsing the biometrics half", async () => {
    setBiometricsOwner(CURRENT_USER);

    await reconcileBiometricsWithServerProfile(
      {
        profile: {
          ...FRESH,
          memoryBank: { entries: [FACT_A], updatedAt: FRESH.updatedAt },
        },
        updatedAt: FRESH.updatedAt,
      },
      CURRENT_USER,
    );

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

    expect(mockUpdateProfile).toHaveBeenCalledWith(combined(FRESH));
  });

  it("treats a legacy snapshot with no ownerId tag (written before this fix) as unknown — never uploads it either", async () => {
    localStorage.setItem(STORAGE_KEYS.HUB_BIOMETRICS, JSON.stringify(FRESH));

    await reconcileBiometricsWithServerProfile(NO_SERVER_ROW, USER_A);

    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  // Друга ітерація гарду (CodeRabbit PR #627): LWW-гілка теж мусить його
  // мати. На спільному пристрої це НЕ екзотика, а типовий випадок —
  // останнім користувався A, тож його локальний снапшот майже завжди
  // свіжіший за серверний профіль щойно залогіненого B.
  it("does NOT upload user A's NEWER local snapshot over user B's older server profile", async () => {
    setBiometricsOwner(USER_A);
    writeBiometrics(NEWER); // A's local data is newer than B's server row.

    setBiometricsOwner(USER_B);
    await reconcileBiometricsWithServerProfile(serverResponse(OLDER), USER_B);

    expect(mockUpdateProfile).not.toHaveBeenCalled();
    // B's own (older) server profile wins and hydrates the local cache —
    // інакше B бачив би на екрані чужі зріст/вагу.
    expect(readBiometrics()).toEqual(OLDER);
  });

  it("still applies LWW normally when the newer local snapshot is the current user's own", async () => {
    setBiometricsOwner(USER_A);
    writeBiometrics(NEWER);

    await reconcileBiometricsWithServerProfile(serverResponse(OLDER), USER_A);

    expect(mockUpdateProfile).toHaveBeenCalledWith(combined(NEWER));
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

// ────────────────────────────────────────────────────────────────────────
// L-8 (2026-08-08, profile-settings-deep-audit): memory-bank write-through.
// Mirrors the biometrics `describe` blocks above, one per trap called out
// in the audit.
// ────────────────────────────────────────────────────────────────────────

describe("reconcileMemoryBankWithServerProfile", () => {
  it("hydrates local from the server when local was never written", async () => {
    expect(readMemoryEntries()).toEqual([]);

    await reconcileMemoryBankWithServerProfile(
      serverMemoryBank([FACT_A], "2026-01-01T00:00:00.000Z"),
      CURRENT_USER,
    );

    expect(readMemoryEntries()).toEqual([FACT_A]);
    expect(readMemoryBankMeta().updatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it("does nothing when both local and server are empty", async () => {
    await reconcileMemoryBankWithServerProfile(NO_SERVER_ROW, CURRENT_USER);

    expect(readMemoryEntries()).toEqual([]);
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it("pushes local up when the server has no row yet but local has real facts owned by the current user", async () => {
    setMemoryBankOwner(CURRENT_USER);
    writeMemoryEntries([FACT_A]);

    await reconcileMemoryBankWithServerProfile(NO_SERVER_ROW, CURRENT_USER);

    const [sent] = mockUpdateProfile.mock.calls[0]!;
    expect(sent.memoryBank.entries).toEqual([FACT_A]);
    // Local is untouched — it was the source of truth in this branch.
    expect(readMemoryEntries()).toEqual([FACT_A]);
  });

  // Realistic first-deploy scenario: an existing user's row ALREADY has a
  // real `updatedAt` (biometrics synced before L-8 shipped), but no
  // `memoryBank` key at all — `extractServerMemoryBank` must still treat
  // this as "server has never seen the bank", not as "server bank is
  // empty and newer" (which would silently discard local facts).
  it("pushes local up when the server row predates L-8 (biometrics-only, no memoryBank key)", async () => {
    setMemoryBankOwner(CURRENT_USER);
    writeMemoryEntries([FACT_A]);

    await reconcileMemoryBankWithServerProfile(
      BIOMETRICS_ONLY_SERVER_ROW,
      CURRENT_USER,
    );

    const [sent] = mockUpdateProfile.mock.calls[0]!;
    expect(sent.memoryBank.entries).toEqual([FACT_A]);
    expect(readMemoryEntries()).toEqual([FACT_A]);
  });

  it("pushes local to the server when local is newer (LWW: local wins)", async () => {
    setMemoryBankOwner(CURRENT_USER);
    writeMemoryEntries([FACT_B]); // FACT_B.createdAt is later, but LWW here
    // is decided by memoryBank.updatedAt (write-time "now"), not createdAt.

    await reconcileMemoryBankWithServerProfile(
      serverMemoryBank([FACT_A], "2020-01-01T00:00:00.000Z"),
      CURRENT_USER,
    );

    const [sent] = mockUpdateProfile.mock.calls[0]!;
    expect(sent.memoryBank.entries).toEqual([FACT_B]);
    expect(readMemoryEntries()).toEqual([FACT_B]);
  });

  it("hydrates local from the server when the server is newer (LWW: server wins)", async () => {
    setMemoryBankOwner(CURRENT_USER);
    writeMemoryEntries([FACT_A]);

    await reconcileMemoryBankWithServerProfile(
      serverMemoryBank([FACT_B], "2099-01-01T00:00:00.000Z"),
      CURRENT_USER,
    );

    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(readMemoryEntries()).toEqual([FACT_B]);
    expect(readMemoryBankMeta().updatedAt).toBe("2099-01-01T00:00:00.000Z");
  });

  it("treats a malformed memoryBank server payload as 'no data' (defensive parse)", async () => {
    setMemoryBankOwner(CURRENT_USER);
    writeMemoryEntries([FACT_A]);

    await reconcileMemoryBankWithServerProfile(
      {
        profile: { memoryBank: { garbage: true } },
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      CURRENT_USER,
    );

    const [sent] = mockUpdateProfile.mock.calls[0]!;
    expect(sent.memoryBank.entries).toEqual([FACT_A]);
  });
});

// L-8 trap #4 — the SAME cross-account upload guard biometrics already has
// (CodeRabbit PR #627), mirrored for the memory bank.
describe("reconcileMemoryBankWithServerProfile — cross-account upload guard", () => {
  const USER_A = "user-a";
  const USER_B = "user-b";

  it("does NOT upload user A's leftover local memory bank under user B's session when the server has no memoryBank for B", async () => {
    setMemoryBankOwner(USER_A);
    writeMemoryEntries([FACT_A]);

    setMemoryBankOwner(USER_B);
    await reconcileMemoryBankWithServerProfile(NO_SERVER_ROW, USER_B);

    expect(mockUpdateProfile).not.toHaveBeenCalled();
    // Left exactly as A wrote it — declined to touch data it can't
    // attribute to the current session.
    expect(readMemoryEntries()).toEqual([FACT_A]);
  });

  it("still uploads when the local memory bank is the current user's own data", async () => {
    setMemoryBankOwner(USER_A);
    writeMemoryEntries([FACT_A]);

    await reconcileMemoryBankWithServerProfile(NO_SERVER_ROW, USER_A);

    const [sent] = mockUpdateProfile.mock.calls[0]!;
    expect(sent.memoryBank.entries).toEqual([FACT_A]);
  });

  it("treats a legacy memory bank with no ownerId tag (written before this fix) as unknown — never uploads it either", async () => {
    // Simulates the PRE-L-8 write path: entries land in PROFILE_KEY, but
    // no `hub_user_profile_meta_v1` row exists (the meta key is brand new
    // in this PR) — i.e. EVERY existing user's memory bank today.
    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify([FACT_A]));

    await reconcileMemoryBankWithServerProfile(NO_SERVER_ROW, USER_A);

    expect(mockUpdateProfile).not.toHaveBeenCalled();
    // Local content is untouched either way — just not auto-uploaded yet.
    expect(readMemoryEntries()).toEqual([FACT_A]);
  });

  it("does NOT upload user A's NEWER local memory bank over user B's older server profile", async () => {
    setMemoryBankOwner(USER_A);
    writeMemoryEntries([FACT_A]); // A's local write is "now" — newer than B's server row below.

    setMemoryBankOwner(USER_B);
    await reconcileMemoryBankWithServerProfile(
      serverMemoryBank([FACT_B], "2020-01-01T00:00:00.000Z"),
      USER_B,
    );

    expect(mockUpdateProfile).not.toHaveBeenCalled();
    // B's own (older) server profile wins and hydrates the local cache —
    // інакше B бачив би чужі факти A під своїм акаунтом.
    expect(readMemoryEntries()).toEqual([FACT_B]);
  });

  it("still applies LWW normally when the newer local memory bank is the current user's own", async () => {
    setMemoryBankOwner(USER_A);
    writeMemoryEntries([FACT_A]);

    await reconcileMemoryBankWithServerProfile(
      serverMemoryBank([FACT_B], "2020-01-01T00:00:00.000Z"),
      USER_A,
    );

    const [sent] = mockUpdateProfile.mock.calls[0]!;
    expect(sent.memoryBank.entries).toEqual([FACT_A]);
  });
});

// L-8 trap #5 — legacy local data without a real `updatedAt` (every
// existing user's memory bank today) must NOT look "newer than
// everything" and must NOT clobber a genuinely newer server row.
describe("reconcileMemoryBankWithServerProfile — legacy updatedAt semantics (trap #5)", () => {
  it("legacy local facts (EPOCH meta) lose LWW to a real, newer server updatedAt — server wins, local is NOT pushed", async () => {
    setMemoryBankOwner(CURRENT_USER);
    // Legacy write path: entries only, no meta row (meta defaults to EPOCH).
    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify([FACT_A]));
    expect(readMemoryBankMeta().updatedAt).toBe(MEMORY_BANK_META_EPOCH);

    await reconcileMemoryBankWithServerProfile(
      serverMemoryBank([FACT_B], "2026-06-01T00:00:00.000Z"),
      CURRENT_USER,
    );

    // If EPOCH had been treated as "newest", this would have pushed A's
    // stale legacy fact over the server's real, newer one instead.
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(readMemoryEntries()).toEqual([FACT_B]);
  });

  it("legacy local facts (EPOCH meta, but owned by the current session) still MIGRATE to a server with no memoryBank yet", async () => {
    // Simulates a real upgrade: the user already saved facts under an OLD
    // build (no meta key existed), the meta key now defaults to EPOCH, but
    // the user IS still the current session's owner (a single-user device
    // — the meta's `ownerId` gets backfilled the moment ANY write happens,
    // and here we simulate that backfill having already occurred while the
    // timestamp itself stayed EPOCH, e.g. a future write path that stamps
    // owner without bumping the clock). The emptiness gate for the upload
    // branch must be `entries.length`, NOT `meta.updatedAt !== EPOCH` —
    // otherwise these real, non-empty facts would NEVER migrate.
    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify([FACT_A]));
    localStorage.setItem(
      "hub_user_profile_meta_v1",
      JSON.stringify({
        updatedAt: MEMORY_BANK_META_EPOCH,
        ownerId: CURRENT_USER,
      }),
    );

    await reconcileMemoryBankWithServerProfile(NO_SERVER_ROW, CURRENT_USER);

    const [sent] = mockUpdateProfile.mock.calls[0]!;
    expect(sent.memoryBank.entries).toEqual([FACT_A]);
  });
});

// ────────────────────────────────────────────────────────────────────────
// L-8 trap #2 — 16KB cap covers the WHOLE payload (biometrics + memory
// bank together), and the failure path must not be silent.
// ────────────────────────────────────────────────────────────────────────
describe("pushMemoryBankToServer — 16KB budget (trap #2)", () => {
  function bigEntries(count: number): MemoryEntry[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `id-${i}`,
      fact: `факт-${i}-` + "x".repeat(500),
      category: "other",
      createdAt: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    }));
  }

  it("trims the OUTGOING payload under the cap and warns, without touching local storage", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const entries = bigEntries(40); // comfortably over 16KB serialized
    setMemoryBankOwner(CURRENT_USER);
    writeMemoryEntries(entries);
    expect(readMemoryEntries()).toHaveLength(40);

    await pushMemoryBankToServer(readMemoryEntries());

    const [sent] = mockUpdateProfile.mock.calls[0]!;
    const sentBytes = new TextEncoder().encode(JSON.stringify(sent)).byteLength;
    expect(sentBytes).toBeLessThanOrEqual(16 * 1024);
    expect(sent.memoryBank.entries.length).toBeLessThan(40);
    // Newest facts (highest index / createdAt) survive the trim.
    expect(
      sent.memoryBank.entries.some((e: MemoryEntry) => e.id === "id-39"),
    ).toBe(true);
    expect(
      sent.memoryBank.entries.some((e: MemoryEntry) => e.id === "id-0"),
    ).toBe(false);
    // Local copy is COMPLETE — trimming only affects the wire payload.
    expect(readMemoryEntries()).toHaveLength(40);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("trimmed"));
    warnSpy.mockRestore();
  });

  it("does not trim (or warn) a payload that already fits", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await pushMemoryBankToServer([FACT_A]);

    const [sent] = mockUpdateProfile.mock.calls[0]!;
    expect(sent.memoryBank.entries).toEqual([FACT_A]);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ────────────────────────────────────────────────────────────────────────
// L-8 trap #3 — combined payload nesting depth. Verified by TEST against
// the REAL `UserProfilePayloadSchema` from `@sergeant/shared` (Hard Rule
// #3 contract), not by eyeballing the shape.
// ────────────────────────────────────────────────────────────────────────
describe("combined payload — nesting depth (trap #3)", () => {
  it("passes UserProfilePayloadSchema at depth 2 (biometrics + memoryBank.entries[])", () => {
    const payload = combined(FRESH, {
      entries: [FACT_A],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(UserProfilePayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("what pushBiometricsToServer/pushMemoryBankToServer actually send passes the schema", async () => {
    setMemoryBankOwner(CURRENT_USER);
    writeMemoryEntries([FACT_A, FACT_B]);
    setBiometricsOwner(CURRENT_USER);
    writeBiometrics(FRESH);

    await pushMemoryBankToServer(readMemoryEntries());

    const [sent] = mockUpdateProfile.mock.calls[0]!;
    expect(UserProfilePayloadSchema.safeParse(sent).success).toBe(true);
  });

  it("regression guard: one MORE level of nesting than the audit's estimate would fail — proves depth is measured, not assumed", () => {
    const tooDeep = combined(FRESH, {
      // @ts-expect-error — deliberately malformed for the depth probe below.
      entries: [{ ...FACT_A, nested: { tooDeep: { evenDeeper: 1 } } }],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(UserProfilePayloadSchema.safeParse(tooDeep).success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────
// L-8 core regression — the audit's own reproduction: memory bank must
// survive a logout/login cycle, and the `my_profile` chat tool must see
// the recovered facts (it reads local storage directly).
// ────────────────────────────────────────────────────────────────────────
describe("L-8 regression: логаут → вхід відновлює банк памʼяті", () => {
  it("a fact saved while authenticated survives logout (local purge) + re-login", async () => {
    // 1. User is signed in, saves a fact — same call path
    //    `remember()` (memoryHandlers.ts) uses.
    setMemoryBankOwner(CURRENT_USER);
    writeMemoryEntries([FACT_A]);
    expect(myProfile({ name: "my_profile", input: {} })).not.toContain(
      "порожній",
    );

    // 2. Simulate the write-through push that `useProfileWriteThroughBoot`
    //    fires after every local edit (`subscribeLocalMemoryEdit` wiring —
    //    covered separately by useProfileWriteThroughBoot.test.tsx).
    await pushMemoryBankToServer(readMemoryEntries());
    const [pushedPayload] = mockUpdateProfile.mock.calls[0]!;
    const serverRowAfterPush: UserProfileResponse = {
      profile: pushedPayload,
      updatedAt: "2026-03-01T00:00:00.000Z",
    };

    // 3. Logout — mirrors `purgeAppOwnedLocalData()` (AuthContext.logout):
    //    every `hub_`-prefixed key, including PROFILE_KEY and the new
    //    meta key, is wiped.
    localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
    localStorage.removeItem("hub_user_profile_meta_v1");
    setMemoryBankOwner(null);

    // This is the ORIGINAL L-8 bug, reproduced: local memory is gone and
    // the chat tool reports it empty.
    expect(readMemoryEntries()).toEqual([]);
    expect(myProfile({ name: "my_profile", input: {} })).toBe(
      "Профіль памʼяті порожній.",
    );

    // 4. Re-login as the SAME user — boot reconcile runs against the
    //    server row that step 2 created.
    setMemoryBankOwner(CURRENT_USER);
    await reconcileMemoryBankWithServerProfile(
      serverRowAfterPush,
      CURRENT_USER,
    );

    // 5. The fact is back — locally AND from the chat tool's point of
    //    view (memoryHandlers.ts reads local storage directly).
    expect(readMemoryEntries()).toEqual([FACT_A]);
    const profileText = myProfile({ name: "my_profile", input: {} });
    expect(profileText).not.toBe("Профіль памʼяті порожній.");
    expect(profileText).toContain(FACT_A.fact);
  });

  it("a DIFFERENT user logging in on the same device after A does NOT inherit A's facts (owner guard)", async () => {
    const USER_A = "user-a";
    const USER_B = "user-b";

    setMemoryBankOwner(USER_A);
    writeMemoryEntries([FACT_A]);
    await pushMemoryBankToServer(readMemoryEntries());
    mockUpdateProfile.mockClear();

    // A logs out — purge wipes local storage.
    localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
    localStorage.removeItem("hub_user_profile_meta_v1");
    setMemoryBankOwner(null);

    // B logs in — B's own server row has no memoryBank yet.
    setMemoryBankOwner(USER_B);
    await reconcileMemoryBankWithServerProfile(NO_SERVER_ROW, USER_B);

    expect(readMemoryEntries()).toEqual([]);
    expect(myProfile({ name: "my_profile", input: {} })).toBe(
      "Профіль памʼяті порожній.",
    );
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });
});
