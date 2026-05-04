/**
 * Багатоверсійний key-ring для AES-256-GCM ключів шифрування токенів.
 *
 * H4 (`docs/security/hardening/H4-encryption-key-rotation.md`): до цієї картки
 * `MONO_TOKEN_ENC_KEY` і `BETTER_AUTH_TOKEN_ENC_KEY` були single-value env-vars.
 * Ротація після leak-у вимагала offline-проходу: розшифрувати кожен row старим
 * ключем і перешифрувати новим — multi-hour outage без rollback-у.
 *
 * Цей хелпер дає dual-key window: env-var формату `v1:hex,v2:hex` (CSV пар
 * `version:hex64`) + `*_CURRENT_VERSION=v2` каже, який ключ використовувати
 * для **запису**. На **читанні** ми обираємо ключ за версією, що зашита у
 * самому ciphertext-і (`enc:v2:<keyVersion>:...`) або у DB-колонці
 * `token_key_version` (Mono BYTEA case).
 *
 * Зворотна сумісність: якщо `*_KEYS` не задане, але задане старе `*_KEY`,
 * keyRing повертає `{ current: { version: 1, key: <legacyKey> },
 * byVersion: Map([1, <legacyKey>]) }`. Це означає, що цей PR **нічого** не
 * ламає для існуючих deploy-ів — вони працюють як `v1`-only ring.
 *
 * Failure modes:
 *   - дублікат версії у CSV → throw на parse-time
 *   - hex не 64 chars → throw
 *   - `CURRENT_VERSION` не у map → throw
 *   - усе пусто → null (caller вирішує, чи це fatal: для prod — fatal,
 *     для dev — warn-and-skip)
 */

const HEX_KEY_RE = /^[0-9a-f]{64}$/i;
const VERSION_RE = /^v(\d+)$/;
const KEY_BYTES = 32;

export interface VersionedKey {
  version: number;
  key: Buffer;
}

export interface KeyRing {
  current: VersionedKey;
  byVersion: ReadonlyMap<number, Buffer>;
  /** Список версій у key-ring-у (відсортований за зростанням), для логування / debugging. */
  versions: readonly number[];
}

export interface ParseKeyRingInput {
  /** Multi-key CSV: `v1:hex,v2:hex,...`. Якщо порожньо/undefined — fallback на legacyKey. */
  keysCsv?: string | null;
  /** Версія, яка використовується для запису, e.g. `v2`. Якщо порожньо — current = найвища версія у keysCsv. */
  currentVersion?: string | null;
  /** Legacy single-key env-var (e.g. `MONO_TOKEN_ENC_KEY`). Використовується якщо `keysCsv` порожнє. */
  legacyKey?: string | null;
  /** Префікс для error-повідомлень (e.g. "MONO_TOKEN_ENC_KEY"). */
  envName: string;
}

function parseVersion(label: string, sourceEnvName: string): number {
  const m = VERSION_RE.exec(label);
  if (!m) {
    throw new Error(
      `${sourceEnvName}: invalid version label "${label}" — expected format "vN" with N a positive integer`,
    );
  }
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(
      `${sourceEnvName}: invalid version label "${label}" — version must be a positive integer`,
    );
  }
  return n;
}

function parseHexKey(
  hex: string,
  sourceEnvName: string,
  version: number,
): Buffer {
  if (!HEX_KEY_RE.test(hex)) {
    throw new Error(
      `${sourceEnvName}: key for version v${version} must be exactly 64 hex chars (32 bytes)`,
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Розпарсити key-ring із env-var-ів.
 *
 * Повертає `null` якщо нічого не задано (ні multi-key, ні legacy). Це дозволяє
 * caller-у вирішити, чи це fatal (production) чи warn-only (dev).
 *
 * Pure function — не читає `process.env` напряму, всі inputs приходять параметром.
 * Тестується in-memory.
 */
export function parseKeyRing(input: ParseKeyRingInput): KeyRing | null {
  const { keysCsv, currentVersion, legacyKey, envName } = input;

  const keysEnvName = `${envName}S`;
  const currentEnvName = `${envName}_CURRENT_VERSION`;

  const trimmedCsv = keysCsv?.trim() ?? "";
  if (trimmedCsv.length > 0) {
    const byVersion = new Map<number, Buffer>();
    const pairs = trimmedCsv
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (pairs.length === 0) {
      throw new Error(`${keysEnvName}: parsed to empty list`);
    }

    for (const pair of pairs) {
      const colon = pair.indexOf(":");
      if (colon < 0) {
        throw new Error(
          `${keysEnvName}: malformed entry "${pair}" — expected "vN:<64-hex>"`,
        );
      }
      const label = pair.slice(0, colon).trim();
      const hex = pair.slice(colon + 1).trim();
      const version = parseVersion(label, keysEnvName);
      if (byVersion.has(version)) {
        throw new Error(`${keysEnvName}: duplicate version v${version}`);
      }
      byVersion.set(version, parseHexKey(hex, keysEnvName, version));
    }

    let currentVersionNum: number;
    const trimmedCurrent = currentVersion?.trim() ?? "";
    if (trimmedCurrent.length > 0) {
      currentVersionNum = parseVersion(trimmedCurrent, currentEnvName);
      if (!byVersion.has(currentVersionNum)) {
        throw new Error(
          `${currentEnvName}=${trimmedCurrent} but v${currentVersionNum} is not in ${keysEnvName}`,
        );
      }
    } else {
      currentVersionNum = Math.max(...byVersion.keys());
    }

    const currentKey = byVersion.get(currentVersionNum);
    if (!currentKey) {
      throw new Error(
        `${keysEnvName}: no key for current version v${currentVersionNum} (internal invariant)`,
      );
    }

    return {
      current: { version: currentVersionNum, key: currentKey },
      byVersion,
      versions: Array.from(byVersion.keys()).sort((a, b) => a - b),
    };
  }

  // Legacy single-key fallback
  const trimmedLegacy = legacyKey?.trim() ?? "";
  if (trimmedLegacy.length > 0) {
    if (!HEX_KEY_RE.test(trimmedLegacy)) {
      throw new Error(`${envName}: must be exactly 64 hex chars (32 bytes)`);
    }
    const buf = Buffer.from(trimmedLegacy, "hex");
    const byVersion = new Map<number, Buffer>([[1, buf]]);
    return {
      current: { version: 1, key: buf },
      byVersion,
      versions: [1],
    };
  }

  return null;
}

/**
 * Шорткат для формування key-ring-у з `process.env` для конкретного префіксу
 * (наприклад, "MONO_TOKEN_ENC_KEY" або "BETTER_AUTH_TOKEN_ENC_KEY").
 *
 * Convention:
 *   - `${prefix}_KEYS` — CSV multi-key (`v1:hex,v2:hex`)
 *   - `${prefix}_CURRENT_VERSION` — current version label (`v2`)
 *   - `${prefix}` — legacy single-key (тільки fallback)
 */
export function keyRingFromEnv(
  envSource: NodeJS.ProcessEnv,
  prefix: string,
): KeyRing | null {
  return parseKeyRing({
    keysCsv: envSource[`${prefix}S`],
    currentVersion: envSource[`${prefix}_CURRENT_VERSION`],
    legacyKey: envSource[prefix],
    envName: prefix,
  });
}

/**
 * Отримати ключ за версією. Кидає, якщо версії немає у key-ring-у — caller
 * повинен трактувати це як "ciphertext неможливо розшифрувати, бо ключ
 * відкликаний з env" (exit-rotation сценарій).
 */
export function getKeyForVersion(ring: KeyRing, version: number): Buffer {
  const key = ring.byVersion.get(version);
  if (!key) {
    throw new Error(
      `key version v${version} is not present in key-ring (versions available: ${ring.versions.map((v) => `v${v}`).join(", ")})`,
    );
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `key version v${version} has wrong byte length (expected ${KEY_BYTES}, got ${key.length})`,
    );
  }
  return key;
}
