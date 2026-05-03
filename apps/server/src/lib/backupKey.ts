import crypto from "node:crypto";

export type BackupToken = string | string[] | undefined;

/**
 * Resolves the storage key used for nutrition backup files. Authorization
 * is bound to the authenticated `userId` (Better Auth opaque id) so that
 * even leaked client `x-token` headers cannot reach another user's backup.
 *
 * The previous implementation used 32-bit FNV-1a без серверного секрету —
 * це давало ~4.3 млрд можливих імен файлів, тому атакер міг перебрати
 * простір за хвилини і витягти будь-чий nutrition-blob (IDOR). Тут уже
 * HMAC-SHA256 з серверним секретом, ключ — `userId\0token`, тож:
 *   - без секрету ключ непередбачуваний навіть при відомих userId/token,
 *   - різні юзери з однаковим `x-token` потрапляють у різні файли,
 *   - простір ключів — 2^128 (truncated digest), brute-force нерелевантний.
 *
 * Повертає 32 hex-символи (128 біт) — досить для унікальності у файловій
 * системі і коротко для шляху.
 */
export function safeBackupKeyFromToken(
  userId: string,
  token: BackupToken,
  secret: string,
): string {
  if (!secret) {
    throw new Error("safeBackupKeyFromToken: missing server secret");
  }
  if (!userId) {
    throw new Error("safeBackupKeyFromToken: missing userId");
  }
  const tokenStr = token ? String(token) : "public";
  return crypto
    .createHmac("sha256", secret)
    .update(`${userId}\u0000${tokenStr}`)
    .digest("hex")
    .slice(0, 32);
}
