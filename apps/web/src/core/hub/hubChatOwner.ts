import {
  resolveLsStore,
  safeRemoveLS,
  safeRemoveLSDurable,
} from "@shared/lib/storage/storage";
import { bumpAtRestWipeEpoch } from "../security/aiAtRestEpoch";

export const SESSIONS_STORAGE_KEY = "hub_chat_sessions_v1";
export const ACTIVE_SESSION_KEY = "hub_chat_active_session_v1";
/**
 * Privacy F12 (браузерна верифікація 2026-08-06): чат-ключі плоскі —
 * без цього стампа історія розмов попереднього акаунта (фінанси,
 * здоровʼя) читалась наступним залогіненим юзером на тому ж пристрої.
 */
export const CHAT_OWNER_KEY = "hub_chat_owner_v1";
/**
 * Синхронне localStorage-дзеркало сесій. Існує лише щоб пережити релоад,
 * який випередив асинхронний запис у SQLite — розбір у `loadSessions`.
 */
export const SESSIONS_MIRROR_KEY = "hub_chat_sessions_mirror_v1";
const ANON_OWNER = "__anon__";
const LEGACY_KEY = "hub_chat_history";

/**
 * Wipe chat history when the device identity changes (F12 privacy).
 *
 * Called from `AuthProvider` whenever the resolved auth identity settles
 * (`userId` — Better Auth id, `null` — signed-out/anonymous). Semantics:
 *
 *  - first ever call (no stored owner) → stamp only, keep sessions: an
 *    anonymous visitor who signs up keeps their draft conversation (same
 *    continuity contract as the anonymous-data migration);
 *  - stored owner differs from the new identity → wipe sessions + active
 *    id + the legacy mirror, then stamp. Covers logout (user → anon) and
 *    a different account signing in on the shared device.
 *
 * @returns `changed` — a previous different owner's chat state was wiped
 *   (the caller's "identity actually changed on this device" signal for
 *   clearing other non-user-scoped residue, e.g. quick-stats);
 *   `prevOwnerWasUser` — that previous owner was an AUTHENTICATED user
 *   (not the anonymous placeholder). Only this stricter signal may
 *   trigger the heavy teardown (React-Query clear + persisted-snapshot
 *   purge + reload): an `anon → user` transition must stay soft so the
 *   anonymous-data migration can carry local drafts into the account.
 */
export interface ChatOwnerReconcileResult {
  changed: boolean;
  prevOwnerWasUser: boolean;
}

/**
 * Чи штампований власник цього пристрою — справжній користувач (а не анонім і
 * не «ще не штамповано»).
 *
 * Потрібен AuthContext-у, щоб відрізнити «залогінений пристрій, `me` тимчасово
 * недоступний» (особистість тримаємо, нічого не стираємо) від анонімного
 * пристрою, якому тримати нічого. Лише читає, нічого не пише.
 */
export function deviceOwnerIsUser(): boolean {
  return readDeviceOwnerId() !== null;
}

/** Id власника-користувача зі штампа; `null` для аноніма і нештампованого. */
export function readDeviceOwnerId(): string | null {
  const owner = readOwnerStamp();
  return owner === null || owner === ANON_OWNER ? null : owner;
}

/**
 * Штамп живе в сирому localStorage, а не в `webKVStore`. KV партиційований:
 * холодний старт читає `anon`-партицію, а вихід і втрата сесії пишуть
 * `"__anon__"` у партицію користувача, тож у `anon` назавжди лишався id
 * користувача, який уже вийшов (крок 0 спеки офлайн холодного старту).
 * Сирий LS спільний для партицій, і purge виходу та teardown знімає його
 * разом з усіма `hub_`-ключами.
 */
function readOwnerStamp(): string | null {
  return resolveLsStore()?.getString(CHAT_OWNER_KEY) ?? null;
}

export function reconcileChatOwnerOnAuthChange(
  userId: string | null,
): ChatOwnerReconcileResult {
  const nextOwner = userId ?? ANON_OWNER;
  const prevOwner = readOwnerStamp();
  if (prevOwner === nextOwner) {
    return { changed: false, prevOwnerWasUser: false };
  }
  // Копія штампа в KV від старих білдів: у `anon`-партиції вона тримала id
  // користувача, який вийшов.
  safeRemoveLS(CHAT_OWNER_KEY);
  const changed = prevOwner !== null;
  if (changed) {
    // Слоти aiAtRest скидають кеш за епохою: запис, що летить, не воскресить стерте.
    bumpAtRestWipeEpoch();
    safeRemoveLS(SESSIONS_STORAGE_KEY);
    safeRemoveLS(ACTIVE_SESSION_KEY);
    safeRemoveLS(LEGACY_KEY);
    // Дзеркало мусить гинути РАЗОМ з основним ключем: інакше приватність F12
    // (нижче в докстрінгу) обходиться через нього — наступний залогінений
    // юзер на тому ж пристрої прочитав би історію попереднього.
    safeRemoveLSDurable(SESSIONS_MIRROR_KEY);
  }
  resolveLsStore()?.setString(CHAT_OWNER_KEY, nextOwner);
  return {
    changed,
    prevOwnerWasUser: changed && prevOwner !== ANON_OWNER,
  };
}
