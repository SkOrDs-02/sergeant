/**
 * Last validated: 2026-07-22
 * Status: Active
 *
 * Single resolver for the id every local-first storage boot reads and
 * writes under — authenticated, demo, or anonymous.
 *
 * AI-CONTEXT: the per-module SQLite boot hooks each resolved this
 * inline, and drifted into three different answers: read-boot fell back
 * to a synthetic demo id, write-boot fell back to `null` (which
 * disables the dual-write context entirely), and Finyk's read-boot had
 * no fallback at all. The consequence was that an anonymous visitor's
 * first habit/expense reached the warm cache but never SQLite, so it
 * vanished on reload — silently. See
 * `docs/90-work/planning/specs/anonymous-local-first-persistence.md`.
 *
 * Read- and write-boot MUST resolve the same id: a write under an id
 * the read path never boots is a row nobody reads back. Route both
 * through this hook rather than re-deriving it per module.
 *
 * `loading` resolves to `null` deliberately. Handing out the anonymous
 * id while the session is still in flight would land an authenticated
 * user's first writes in the anonymous SQLite partition
 * (`sergeant-anon.db`), which `setSqliteUser()` then swaps away from.
 */

import { DEMO_LOCAL_USER_ID, isDemoActive } from "../onboarding/onboardingGate";
import { useAuth } from "./AuthContext";

/**
 * Synthetic id scoping the rows an anonymous visitor writes. Lives in
 * the `anon` SQLite partition, isolated from every real account id.
 *
 * Decision Р2(а) in the spec above: on the first authorised boot these
 * rows migrate onto the real `userId` and the `local-anon` copies are
 * dropped. That migration is NOT implemented yet — until it ships, a
 * visitor who works anonymously and then signs in sees an empty
 * account. Do not treat this constant as private to the boot hooks;
 * the migration will need it too.
 */
export const LOCAL_ANON_USER_ID = "local-anon";

export function useLocalUserId(): string | null {
  const { user, status } = useAuth();
  if (user?.id) return user.id;
  if (status === "loading") return null;
  return isDemoActive() ? DEMO_LOCAL_USER_ID : LOCAL_ANON_USER_ID;
}
