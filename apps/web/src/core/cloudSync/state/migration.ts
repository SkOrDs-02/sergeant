import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { MIGRATION_DONE_KEY } from "../config";

type MigrationMap = Record<string, string>;

export function isMigrationDone(userId: string | undefined | null): boolean {
  if (!userId) return false;
  const map = safeReadLS<MigrationMap>(MIGRATION_DONE_KEY, {}) || {};
  return !!map[userId];
}

export function markMigrationDone(userId: string | undefined | null): void {
  if (!userId) return;
  const map = safeReadLS<MigrationMap>(MIGRATION_DONE_KEY, {}) || {};
  map[userId] = new Date().toISOString();
  safeWriteLS(MIGRATION_DONE_KEY, map);
}
