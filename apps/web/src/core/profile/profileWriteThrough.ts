/**
 * Write-through sync for `hub_biometrics_v1` against `GET/PUT /api/me/profile`
 * (migration 115). **NOT an oplog** — a single JSONB row per user, upserted
 * wholesale on every save and read wholesale on login. See the module
 * comment in `./biometrics.ts` for why this cache had no server leg at all
 * until now (device-local, no `OP_LOG_TABLE_REGISTRY` entry).
 *
 * Two integration points, both best-effort (never throw to the caller):
 *
 *   - `pushBiometricsToServer` — fired after every local save
 *     (`useBiometrics.saveBiometrics`) when the user is authenticated.
 *   - `reconcileBiometricsWithServerProfile` — run once per authenticated
 *     boot by `useProfileWriteThroughBoot`, against the RQ-cached
 *     `GET /api/me/profile` response (`hubKeys.profile`).
 *
 * LWW by `updatedAt`, decided here:
 *
 *   - local never written locally (`EPOCH` sentinel) + server has a row →
 *     hydrate local from the server.
 *   - server has no row yet (`updatedAt: null`) → nothing to hydrate; if
 *     local has real data, push it up so the row starts existing.
 *   - both have data → newer `updatedAt` wins: newer-local pushes to the
 *     server, newer-or-equal-server hydrates local.
 */
import { meApi, type UserProfileResponse } from "@shared/api";
import { logger } from "@shared/lib";
import {
  BIOMETRICS_DEFAULT,
  BiometricsSchema,
  readBiometrics,
  writeBiometrics,
  type Biometrics,
} from "./biometrics";

/**
 * `true` when `b` still equals the all-null default — i.e. this device has
 * never locally saved biometrics (a fresh install always starts at the
 * `EPOCH` sentinel `updatedAt`).
 */
function isLocalBiometricsEmpty(b: Biometrics): boolean {
  return b.updatedAt === BIOMETRICS_DEFAULT.updatedAt;
}

/**
 * Best-effort PUT of a biometrics snapshot to `/api/me/profile`. Network /
 * validation failures are logged, never thrown — a local biometrics save
 * must always succeed even when the write-through leg fails (offline, 5xx,
 * session expired mid-edit).
 */
export async function pushBiometricsToServer(b: Biometrics): Promise<void> {
  try {
    await meApi.updateProfile(b);
  } catch (err) {
    logger.warn("[profileWriteThrough] PUT /api/me/profile failed", err);
  }
}

/**
 * Reconciles the local `hub_biometrics_v1` cache against an already-fetched
 * `GET /api/me/profile` response. Pure of network reads (the caller supplies
 * `serverProfile`, typically from the `hubKeys.profile` RQ cache) but still
 * async because the "local wins" branch pushes over the network.
 */
export async function reconcileBiometricsWithServerProfile(
  serverProfile: UserProfileResponse,
): Promise<void> {
  const local = readBiometrics();
  const parsedServer = BiometricsSchema.safeParse(serverProfile.profile);
  const serverHasRow = serverProfile.updatedAt !== null && parsedServer.success;

  if (!serverHasRow) {
    if (!isLocalBiometricsEmpty(local)) {
      await pushBiometricsToServer(local);
    }
    return;
  }

  const serverBiometrics = parsedServer.data;
  if (isLocalBiometricsEmpty(local)) {
    writeBiometrics(serverBiometrics);
    return;
  }

  const localMs = Date.parse(local.updatedAt);
  const serverMs = Date.parse(serverBiometrics.updatedAt);
  const localIsNewer =
    Number.isFinite(localMs) &&
    (!Number.isFinite(serverMs) || localMs > serverMs);

  if (localIsNewer) {
    await pushBiometricsToServer(local);
  } else {
    writeBiometrics(serverBiometrics);
  }
}
