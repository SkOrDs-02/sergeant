import { isApiError } from "@shared/api";

/**
 * Чи це 429 вичерпаного тижневого відра з конкретним кодом
 * (`AI_PHOTO_QUOTA`, `AI_FINYK_VISION_QUOTA`, `AI_QUOTA`). Знімок доступу
 * може застаріти між двома запитами, тож call-site відкриває пейвол і за
 * відповіддю сервера, а не лише за лічильником.
 */
export function isQuotaError(err: unknown, code: string): boolean {
  if (!isApiError(err) || err.status !== 429) return false;
  const body = err.body;
  return (
    !!body &&
    typeof body === "object" &&
    (body as { code?: unknown }).code === code
  );
}
