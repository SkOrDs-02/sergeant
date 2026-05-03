import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { SYNC_VERSION_KEY } from "../config";

type VersionMap = Record<string, Record<string, number>>;

function getModuleVersions(): VersionMap {
  return safeReadLS<VersionMap>(SYNC_VERSION_KEY, {}) || {};
}

export function setModuleVersion(
  userId: string,
  moduleName: string,
  version: number,
): void {
  const versions = getModuleVersions();
  if (!versions[userId]) versions[userId] = {};
  versions[userId][moduleName] = version;
  safeWriteLS(SYNC_VERSION_KEY, versions);
}

export function getModuleVersion(userId: string, moduleName: string): number {
  const versions = getModuleVersions();
  return versions[userId]?.[moduleName] ?? 0;
}
