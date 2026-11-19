import {
  WeeklyDigestReportSchema,
  type WeeklyDigestReport,
} from "../../http/schemas.js";
import { getMemory, type CoachMemory } from "../chat/coach.js";

/** Звіт тижня, уже збережений у памʼяті коуча. */
export interface StoredDigest {
  report: WeeklyDigestReport;
  generatedAt: string;
}

/**
 * Звіт тижня `weekKey` з памʼяті коуча у формі відповіді
 * `POST /api/weekly-digest` або `null` (С-3 (а), 2026-11-18).
 *
 * Памʼять коуча після кожної генерації отримує повний звіт від клієнта
 * (`useWeeklyDigest` → `POST /api/coach/memory`, один запис на `weekKey`).
 * Умови ті самі, що в клієнтському `serverDigestFromMemory`
 * (`apps/web/src/core/insights/digestServerCopy.ts`): запис зламаної форми чи
 * без жодного модуля вважається відсутнім, тоді звіт генерується. Службові
 * `correlations` у відповідь не потрапляють.
 */
export function storedDigestFromMemory(
  memory: CoachMemory | null,
  weekKey: string,
): StoredDigest | null {
  const digests = memory?.weeklyDigests;
  if (!Array.isArray(digests)) return null;
  const entry = digests.find((d) => d && d.weekKey === weekKey) as
    Record<string, unknown> | undefined;
  if (!entry || typeof entry["generatedAt"] !== "string") return null;

  const parsed = WeeklyDigestReportSchema.safeParse({
    finyk: entry["finyk"] ?? null,
    fizruk: entry["fizruk"] ?? null,
    nutrition: entry["nutrition"] ?? null,
    routine: entry["routine"] ?? null,
    overallRecommendations: entry["overallRecommendations"] ?? [],
  });
  if (!parsed.success) return null;
  const r = parsed.data;
  if (!(r.finyk || r.fizruk || r.nutrition || r.routine)) return null;
  return { report: r, generatedAt: entry["generatedAt"] };
}

/** Читає памʼять коуча людини і повертає звіт тижня або `null`. */
export async function readStoredDigest(
  userId: string,
  weekKey: string,
): Promise<StoredDigest | null> {
  return storedDigestFromMemory(await getMemory(userId), weekKey);
}
