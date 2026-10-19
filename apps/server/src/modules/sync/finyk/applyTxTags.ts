import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../../http/schemas.js";
import { isWithinTextBound } from "../syncV2-core.js";
import type { AppliedStatus } from "../syncV2-types.js";
import { applyFinykPerTxJsonbArray } from "./applyTxMappings.js";

/**
 * Межа на кількість тегів однієї операції на кордоні довіри. Продуктові
 * межі (довжина, кількість) тримає клієнт через finyk-domain; тут лише
 * захист від `curl`, що пхає мегабайтний масив у `tags_json`.
 */
export const TX_TAGS_MAX_COUNT = 50;

function parseTags(raw: unknown): unknown[] | null {
  if (raw == null) return [];
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return Array.isArray(value) ? value : null;
}

/**
 * `finyk_tx_tags` - теги користувача до операцій (міграція 157, спека
 * finyk-analytics-v3 Р6.3). Ключ, LWW і soft-delete ті самі, що в
 * `finyk_tx_splits` (tombstone-и 156): delete ставить `deleted_at`, застарілий
 * upsert за tombstone-ом відсіюється як `lww_conflict`, новіший воскрешає
 * рядок. Тут лише валідація вмісту `tags_json` до запису.
 */
export async function applyFinykTxTags(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  if (op.op !== "delete") {
    const tags = parseTags(op.row["tags_json"]);
    if (tags === null || tags.some((t) => typeof t !== "string")) {
      return { status: "rejected", reason: "missing_data_json" };
    }
    if (
      tags.length > TX_TAGS_MAX_COUNT ||
      tags.some((t) => !isWithinTextBound(t as string))
    ) {
      return { status: "rejected", reason: "text_too_long" };
    }
    const transactionId = op.row["transaction_id"];
    if (
      typeof transactionId === "string" &&
      !isWithinTextBound(transactionId)
    ) {
      return { status: "rejected", reason: "text_too_long" };
    }
  }
  return applyFinykPerTxJsonbArray(
    client,
    op,
    userId,
    clientTs,
    "finyk_tx_tags",
    "tags_json",
  );
}
