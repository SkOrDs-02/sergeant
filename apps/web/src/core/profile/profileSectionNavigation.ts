/** Спільні цілі посилань на підрозділи Профілю. */
export const PROFILE_SECTION_HASHES = {
  memory: "#profile-memory",
  "account-deletion": "#profile-account-deletion",
} as const;

export type ProfileSectionId = keyof typeof PROFILE_SECTION_HASHES;

export function readProfileSectionHash(hash: string): ProfileSectionId | null {
  if (hash === PROFILE_SECTION_HASHES.memory) return "memory";
  if (hash === PROFILE_SECTION_HASHES["account-deletion"])
    return "account-deletion";
  return null;
}
