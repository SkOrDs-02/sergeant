export type BackupToken = string | string[] | undefined;

export function safeBackupKeyFromToken(token: BackupToken): string {
  const raw = token ? String(token) : "public";
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
