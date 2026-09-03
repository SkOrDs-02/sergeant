/**
 * Write-through sync for `hub_biometrics_v1` AND `hub_user_profile_v1`
 * (банк памʼяті ШІ) against `GET/PUT /api/me/profile` (migration 115).
 * **NOT an oplog** — a SINGLE JSONB row per user, upserted wholesale on
 * every save and read wholesale on login. See the module comment in
 * `./biometrics.ts` for why biometrics had no server leg at all until this
 * landed; memory bank's own server leg is L-8
 * (`docs/90-work/audits/2026-08-08-profile-settings-deep-audit.md`) — the
 * bank had zero server presence and did not survive logout.
 *
 * L-8's central trap: the row is wholesale-upserted, so a push that carries
 * only ONE half would silently erase the other on the server. Every push
 * funnels through {@link buildProfilePayload}, which ALWAYS reads both
 * halves fresh from local storage and sends them together — see
 * `pushBiometricsToServer` / `pushMemoryBankToServer` below.
 *
 * Той самий трап на рівень нижче (browser-QA 2026-09-03, звіт власника
 * «біометрія регулярно зникає»): слати обидві половини мало, бо ПОРОЖНЯ
 * половина стирає серверну так само надійно, як відсутня. Локальна копія
 * на EPOCH-сентинелі означає «на цьому пристрої сюди ще не писали», а не
 * «у людини цього немає» — див. AI-DANGER над
 * {@link resolveHalvesAgainstServer}, який добирає таку половину з
 * сервера замість неї.
 *
 * Four integration points, all best-effort (never throw to the caller):
 *
 *   - `pushBiometricsToServer` — fired after every local biometrics save
 *     (`useBiometrics.saveBiometrics`) when the user is authenticated.
 *   - `pushMemoryBankToServer` — fired after every local memory-bank write
 *     (`memoryBank.ts`'s `subscribeLocalMemoryEdit`, wired from
 *     `useProfileWriteThroughBoot`) when the user is authenticated.
 *   - `reconcileBiometricsWithServerProfile` — run once per authenticated
 *     boot by `useProfileWriteThroughBoot`, against the RQ-cached
 *     `GET /api/me/profile` response (`hubKeys.profile`).
 *   - `reconcileMemoryBankWithServerProfile` — same boot, same cached
 *     response, independent LWW clock (see its own doc comment).
 *
 * LWW by `updatedAt`, decided here (mirrored for both halves):
 *
 *   - local never written locally (`EPOCH` sentinel) + server has data →
 *     hydrate local from the server.
 *   - server has no data yet → nothing to hydrate; if local has real data
 *     owned by the current session, push it up so the row starts existing.
 *   - both have data → newer `updatedAt` wins: newer-local pushes to the
 *     server, newer-or-equal-server hydrates local.
 */
import { z } from "zod";
import {
  meApi,
  type UserProfilePayload,
  type UserProfileResponse,
} from "@shared/api";
import { USER_PROFILE_MAX_BYTES } from "@sergeant/shared";
import { logger } from "@shared/lib";
import {
  BIOMETRICS_DEFAULT,
  BiometricsSchema,
  readBiometrics,
  readBiometricsOwnerId,
  setBiometricsOwner,
  writeBiometrics,
  type Biometrics,
} from "./biometrics";
import {
  MEMORY_BANK_META_EPOCH,
  normalizeMemoryEntry,
  readMemoryBankMeta,
  readMemoryEntries,
  setMemoryBankOwner,
  writeMemoryEntriesFromServer,
} from "./memoryBank";
import type { MemoryEntry } from "./types";

/**
 * `true` when `b` still equals the all-null default — i.e. this device has
 * never locally saved biometrics (a fresh install always starts at the
 * `EPOCH` sentinel `updatedAt`).
 */
function isLocalBiometricsEmpty(b: Biometrics): boolean {
  return b.updatedAt === BIOMETRICS_DEFAULT.updatedAt;
}

/** Wire shape of the memory-bank half of the `/api/me/profile` payload. */
interface MemoryBankWirePayload {
  entries: MemoryEntry[];
  updatedAt: string;
}

/**
 * L-8, central trap fix: the ONLY place that assembles a `PUT
 * /api/me/profile` body. The row is a wholesale upsert (no column-level
 * schema, migration 115's own comment), so a push that carries just one
 * half would silently ERASE the other on the server — a biometrics-only
 * `updateProfile(b)` wipes the memory bank, and a memory-bank-only
 * `updateProfile(entries)` wipes biometrics. Both `pushBiometricsToServer`
 * and `pushMemoryBankToServer` funnel through this builder, always reading
 * the OTHER half fresh from local storage first.
 */
function buildProfilePayload(
  biometrics: Biometrics,
  memoryBank: MemoryBankWirePayload,
): UserProfilePayload {
  return { ...biometrics, memoryBank };
}

function payloadByteSize(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * L-8, trap #2 (16KB cap): `USER_PROFILE_MAX_BYTES` bounds the WHOLE
 * payload — biometrics + memory bank TOGETHER — and the failure path used
 * to be silent (`pushXToServer` only `logger.warn`s on a rejected PUT, so
 * an oversized push meant the facts just never arrived while the UI kept
 * believing they had). Repeating that silence for a finding whose whole
 * point is "data dies invisibly" would be a mockery of the audit, so we
 * pre-emptively fit the OUTGOING payload under the cap here: drop the
 * OLDEST facts (by `createdAt`) first, one at a time, until it fits.
 *
 * The LOCAL copy is never touched by this — only the wire payload shrinks.
 * A user who genuinely fills 16KB of facts keeps every one of them on this
 * device; only the synced snapshot lags until the payload naturally drops
 * back under the cap (deleting old facts) or a future PR adds a visible
 * "partially synced" UI state (blocked here: `MemoryBankSection.tsx` is
 * out of scope for this PR — see the L-8 completion report).
 */
function fitMemoryBankPayload(
  biometrics: Biometrics,
  entries: MemoryEntry[],
  updatedAt: string,
): { payload: UserProfilePayload; trimmedCount: number } {
  const full = buildProfilePayload(biometrics, { entries, updatedAt });
  if (payloadByteSize(full) <= USER_PROFILE_MAX_BYTES) {
    return { payload: full, trimmedCount: 0 };
  }

  // Найновіші факти важливіші за старі в обмеженому бюджеті — сортуємо
  // за `createdAt` спаданням і відсікаємо з хвоста.
  const newestFirst = [...entries].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );
  let candidate = newestFirst;
  let payload = buildProfilePayload(biometrics, {
    entries: candidate,
    updatedAt,
  });
  let trimmedCount = 0;
  while (
    candidate.length > 0 &&
    payloadByteSize(payload) > USER_PROFILE_MAX_BYTES
  ) {
    candidate = candidate.slice(0, -1);
    trimmedCount += 1;
    payload = buildProfilePayload(biometrics, {
      entries: candidate,
      updatedAt,
    });
  }
  return { payload, trimmedCount };
}

function readMemoryBankForWire(): MemoryBankWirePayload {
  return {
    entries: readMemoryEntries(),
    updatedAt: readMemoryBankMeta().updatedAt,
  };
}

/**
 * `true` коли в банк памʼяті на ЦЬОМУ пристрої ще ніколи не писали —
 * порожній список саме на EPOCH-сентинелі.
 *
 * Порожній банк із СПРАВЖНЬОЮ міткою часу — це не те саме: так виглядає
 * «Забути все» (`PrivacySection` → `writeMemoryEntries([])`), тобто
 * усвідомлене очищення, яке МАЄ доїхати на сервер. Різницю дає рівно
 * мітка, тому тут перевіряються обидві умови, а не сама лише довжина.
 */
function isMemoryBankUnwritten(mb: MemoryBankWirePayload): boolean {
  return mb.entries.length === 0 && mb.updatedAt === MEMORY_BANK_META_EPOCH;
}

/**
 * AI-DANGER: **половина, у яку локально ще не писали, — це «ми не знаємо»,
 * а не «у людини цього немає».** Відправити її у wholesale-PUT означає
 * стерти серверну копію.
 *
 * L-8 закрив пастку «пуш однієї половини стирає другу» тим, що
 * {@link buildProfilePayload} завжди шле обидві. Але «обидві» рятує лише
 * від відсутньої половини й НЕ рятує від порожньої: між логіном і
 * завершенням boot-звірки (а також на будь-якому пристрої, де звірка не
 * пройшла — офлайн, 5xx) локальні копії стоять на EPOCH-сентинелі, і
 * перший-ліпший пуш у цьому вікні відправляє їх на сервер як факт.
 *
 * Дві реальні гілки, обидві досяжні:
 *   • запис факту в банк памʼяті з чату (`memoryHandlers` →
 *     `writeMemoryEntries` → `subscribeLocalMemoryEdit`) до гідратації —
 *     на сервер їде біометрика з `updatedAt: EPOCH` і всіма `null`, тобто
 *     зріст, стать і дата народження зникають; далі boot-звірка чесно
 *     гідратує локальну копію цією порожнечею, і для людини це виглядає
 *     як «біометрія знову зникла»;
 *   • дзеркально — збереження біометрики стирає банк памʼяті ШІ.
 *
 * Тому невідома половина береться з сервера, а не з локального сентинела.
 * `serverProfile` передають викликачі, які його вже мають (boot-звірка);
 * решта дочитує його одним GET — цей шлях рідкісний за побудовою, бо
 * після звірки жодна половина вже не на сентинелі.
 *
 * `null` означає «не змогли дізнатись» (GET не пройшов) — тоді пуш
 * скасовується цілком: втратити ОДНЕ збереження гірше, ніж стерти все
 * введене раніше, і наступна boot-звірка все одно віднесе локальне
 * нагору за LWW.
 */
async function resolveHalvesAgainstServer(
  biometrics: Biometrics,
  memoryBank: MemoryBankWirePayload,
  serverProfile?: UserProfileResponse,
): Promise<{
  biometrics: Biometrics;
  memoryBank: MemoryBankWirePayload;
} | null> {
  const biometricsUnknown = isLocalBiometricsEmpty(biometrics);
  const memoryUnknown = isMemoryBankUnwritten(memoryBank);
  if (!biometricsUnknown && !memoryUnknown) return { biometrics, memoryBank };

  let server = serverProfile ?? null;
  if (!server) {
    try {
      server = await meApi.getProfile();
    } catch (err) {
      logger.warn(
        "[profileWriteThrough] GET /api/me/profile failed while filling an unwritten half — push skipped so it cannot erase the server copy",
        err,
      );
      return null;
    }
  }

  // Рядка на сервері ще немає — стирати нічого, локальні сентинели їдуть
  // як є (саме так народжується перший рядок профілю).
  let nextBiometrics = biometrics;
  let nextMemoryBank = memoryBank;
  if (biometricsUnknown) {
    const parsed = BiometricsSchema.safeParse(server.profile);
    if (server.updatedAt !== null && parsed.success) {
      nextBiometrics = parsed.data;
    }
  }
  if (memoryUnknown) {
    const serverBank = extractServerMemoryBank(server);
    if (serverBank) nextMemoryBank = serverBank;
  }
  return { biometrics: nextBiometrics, memoryBank: nextMemoryBank };
}

/**
 * Best-effort PUT of a COMBINED profile snapshot to `/api/me/profile`.
 * Network / validation failures are logged, never thrown — a local save
 * must always succeed even when the write-through leg fails (offline, 5xx,
 * session expired mid-edit). Shared tail of `pushBiometricsToServer` and
 * `pushMemoryBankToServer` below.
 *
 * Перед відправкою половини проходять через
 * {@link resolveHalvesAgainstServer} — див. AI-DANGER там.
 */
async function pushCombinedProfile(
  localBiometrics: Biometrics,
  localMemoryBank: MemoryBankWirePayload,
  serverProfile?: UserProfileResponse,
): Promise<void> {
  const resolved = await resolveHalvesAgainstServer(
    localBiometrics,
    localMemoryBank,
    serverProfile,
  );
  if (!resolved) return;
  const { biometrics, memoryBank } = resolved;
  const { payload, trimmedCount } = fitMemoryBankPayload(
    biometrics,
    memoryBank.entries,
    memoryBank.updatedAt,
  );
  if (trimmedCount > 0) {
    logger.warn(
      `[profileWriteThrough] L-8: profile payload exceeded ${USER_PROFILE_MAX_BYTES}B — trimmed ${trimmedCount} oldest memory-bank fact(s) before PUT. Local copy is untouched; only the synced snapshot is smaller until it drops back under the cap.`,
    );
  }
  try {
    await meApi.updateProfile(payload);
  } catch (err) {
    logger.warn("[profileWriteThrough] PUT /api/me/profile failed", err);
  }
}

/**
 * Best-effort PUT of a biometrics snapshot to `/api/me/profile`, COMBINED
 * with the current local memory bank (L-8 trap #1 — see
 * `buildProfilePayload`). Network / validation failures are logged, never
 * thrown — a local biometrics save must always succeed even when the
 * write-through leg fails (offline, 5xx, session expired mid-edit).
 */
export async function pushBiometricsToServer(
  b: Biometrics,
  serverProfile?: UserProfileResponse,
): Promise<void> {
  await pushCombinedProfile(b, readMemoryBankForWire(), serverProfile);
}

/**
 * Best-effort PUT of the memory bank to `/api/me/profile`, COMBINED with
 * the current local biometrics (L-8 trap #1). Fired after every local
 * memory-bank write via `memoryBank.ts`'s `subscribeLocalMemoryEdit`
 * (wired in `useProfileWriteThroughBoot`), mirroring how
 * `useBiometrics.saveBiometrics` pushes biometrics.
 */
export async function pushMemoryBankToServer(
  entries: MemoryEntry[],
  serverProfile?: UserProfileResponse,
): Promise<void> {
  await pushCombinedProfile(
    readBiometrics(),
    { entries, updatedAt: readMemoryBankMeta().updatedAt },
    serverProfile,
  );
}

/**
 * Reconciles the local `hub_biometrics_v1` cache against an already-fetched
 * `GET /api/me/profile` response. Pure of network reads (the caller supplies
 * `serverProfile`, typically from the `hubKeys.profile` RQ cache) but still
 * async because the "local wins" branch pushes over the network.
 *
 * `currentUserId` is the authenticated session this reconcile is running
 * for (`useProfileWriteThroughBoot`'s own `userId`) — required for the
 * cross-account upload guard below (CodeRabbit PR #627): `hub_biometrics_v1`
 * is a single global localStorage key, so on a shared device user A's
 * local snapshot can still be sitting there when user B signs in with no
 * server row of their own yet. Uploading it there would silently attach
 * A's biometrics to B's account.
 */
export async function reconcileBiometricsWithServerProfile(
  serverProfile: UserProfileResponse,
  currentUserId: string,
): Promise<void> {
  // Defensive: also stamp the owner here (not just in
  // `useProfileWriteThroughBoot`'s own effect) so this function stays
  // correct in isolation — e.g. called directly from a test, or from any
  // future caller that forgets the boot-hook wiring.
  setBiometricsOwner(currentUserId);

  const local = readBiometrics();
  const parsedServer = BiometricsSchema.safeParse(serverProfile.profile);
  const serverHasRow = serverProfile.updatedAt !== null && parsedServer.success;

  if (!serverHasRow) {
    // Only upload when the local snapshot is stamped as belonging to
    // THIS session's user. A legacy value with no owner tag (written
    // before this fix shipped) or one stamped for a different account on
    // this shared device must never be uploaded under someone else's
    // session — see the regression test for the exact A-then-B scenario.
    if (
      !isLocalBiometricsEmpty(local) &&
      readBiometricsOwnerId() === currentUserId
    ) {
      await pushBiometricsToServer(local, serverProfile);
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

  // Той самий owner-гейт, що й у гілці `!serverHasRow` вище (CodeRabbit
  // PR #627, друга ітерація). LWW сам по собі його НЕ замінює: на спільному
  // пристрої снапшот юзера A майже завжди свіжіший за серверний профіль
  // щойно залогіненого юзера B (A користувався пристроєм останнім), тож
  // «локальне новіше» відправило б біометрику A під сесією B. Коли власник
  // не збігається — сервер завжди виграє, а локальний кеш гідратується
  // профілем B.
  const localBelongsToCurrentUser = readBiometricsOwnerId() === currentUserId;

  if (localIsNewer && localBelongsToCurrentUser) {
    await pushBiometricsToServer(local, serverProfile);
  } else {
    writeBiometrics(serverBiometrics);
  }
}

/** Tolerant shape of the `memoryBank` sub-object inside the wire payload. */
const MemoryBankWireSchema = z.object({
  entries: z.array(z.unknown()),
  updatedAt: z.string().min(1),
});

/**
 * Extracts and normalizes the `memoryBank` section from an already-fetched
 * `GET /api/me/profile` response. `null` covers BOTH "no row at all"
 * (`profile: {}`) AND "row exists but predates L-8" (real prod rows today
 * — biometrics write-through shipped first, so an existing user's row
 * carries flat biometrics fields with no `memoryBank` key at all). Either
 * way there is nothing to compare against — treated as "server has never
 * seen this device's memory bank".
 */
function extractServerMemoryBank(
  serverProfile: UserProfileResponse,
): MemoryBankWirePayload | null {
  const raw = (serverProfile.profile as Record<string, unknown> | null)?.[
    "memoryBank"
  ];
  const parsed = MemoryBankWireSchema.safeParse(raw);
  if (!parsed.success) return null;
  const entries = parsed.data.entries
    .map((item) => normalizeMemoryEntry(item))
    .filter((entry): entry is MemoryEntry => entry !== null);
  return { entries, updatedAt: parsed.data.updatedAt };
}

/**
 * L-8 (2026-08-08): mirrors `reconcileBiometricsWithServerProfile` for the
 * memory bank (`hub_user_profile_v1`). Same LWW contract, own clock:
 *
 *   - server has no `memoryBank` section (no row yet, OR a pre-L-8 row
 *     that only ever carried biometrics) + local has real facts owned by
 *     the current session → push local up.
 *   - local is empty (`entries.length === 0` — a fresh device, or right
 *     after `purgeAppOwnedLocalData()` on logout) + server has data →
 *     hydrate local from the server. This is the L-8 regression itself:
 *     without this branch, the bank never survives logout/login.
 *   - both have data → newer `updatedAt` wins. Deliberately compares the
 *     EMBEDDED `memoryBank.updatedAt` (travels with the section, bumped
 *     only by a genuine memory-bank write — see `memoryBank.ts`'s
 *     `writeMemoryEntries`), NOT the row-level `serverProfile.updatedAt`:
 *     the row-level timestamp advances on ANY push (including a
 *     biometrics-only one that re-sends an UNCHANGED memory bank), so
 *     using it here would make an unrelated biometrics edit on another
 *     device look like a fresher memory-bank edit and could overwrite a
 *     genuine, not-yet-synced local memory-bank change.
 *
 * `entries.length === 0` (not `meta.updatedAt === EPOCH`) is the
 * emptiness check for the upload branch — trap #5: every EXISTING user's
 * memory bank predates this fix, so its meta is `EPOCH` by construction
 * even though the facts are real. Gating on the timestamp would mean
 * legacy facts NEVER migrate to the server. Cross-account guard mirrors
 * biometrics exactly (CodeRabbit PR #627): a legacy/foreign `ownerId` is
 * never treated as "belongs to the current session", even mid-LWW.
 */
export async function reconcileMemoryBankWithServerProfile(
  serverProfile: UserProfileResponse,
  currentUserId: string,
): Promise<void> {
  // Defensive, same rationale as `reconcileBiometricsWithServerProfile`'s
  // own stamp: keeps this function correct in isolation.
  setMemoryBankOwner(currentUserId);

  const localEntries = readMemoryEntries();
  const localMeta = readMemoryBankMeta();
  const localBelongsToCurrentUser = localMeta.ownerId === currentUserId;
  const serverMemoryBank = extractServerMemoryBank(serverProfile);

  if (!serverMemoryBank) {
    if (localEntries.length > 0 && localBelongsToCurrentUser) {
      await pushMemoryBankToServer(localEntries, serverProfile);
    }
    return;
  }

  if (localEntries.length === 0) {
    writeMemoryEntriesFromServer(
      serverMemoryBank.entries,
      serverMemoryBank.updatedAt,
    );
    return;
  }

  const localMs = Date.parse(localMeta.updatedAt);
  const serverMs = Date.parse(serverMemoryBank.updatedAt);
  const localIsNewer =
    Number.isFinite(localMs) &&
    (!Number.isFinite(serverMs) || localMs > serverMs);

  if (localIsNewer && localBelongsToCurrentUser) {
    await pushMemoryBankToServer(localEntries, serverProfile);
  } else {
    writeMemoryEntriesFromServer(
      serverMemoryBank.entries,
      serverMemoryBank.updatedAt,
    );
  }
}
