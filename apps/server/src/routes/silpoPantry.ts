import type { Request, Response } from "express";
import { logger } from "../obs/logger.js";
import { parseBody } from "../http/validate.js";
import {
  SilpoPantryClaimRequestSchema,
  SilpoPantryClaimResponseSchema,
  SilpoPantryReleaseRequestSchema,
  SilpoPantryReleaseResponseSchema,
  SilpoSettingsRequestSchema,
  SilpoSettingsResponseSchema,
} from "../http/schemas.js";
import {
  claimPantryItems,
  releasePantryItems,
  setPantryAutoImport,
} from "../modules/silpo/pantryClaim.js";
import {
  assertSilpoEnabled,
  getUserId,
  type AuthedRequest,
} from "../modules/silpo/routeHelpers.js";

/**
 * Автоімпорт чеків Сільпо в комору + позначка «вже в коморі» (спека
 * `docs/work/specs/silpo-pantry-auto-import.md`). Винесено з
 * `routes/silpo.ts` (Hard Rule #18, max-lines 600); мовтується звідти ж
 * (`createSilpoRouter()`), той самий kill-switch і auth-гейт.
 */

function readReceiptId(req: Request, res: Response): string | null {
  const receiptIdParam = req.params["id"];
  const receiptId =
    typeof receiptIdParam === "string" ? receiptIdParam : undefined;
  if (!receiptId) {
    res.status(400).json({ error: "Missing receipt id", code: "VALIDATION" });
    return null;
  }
  return receiptId;
}

/**
 * `PUT /api/silpo/settings` - тумблер «Додавати продукти з чеків у комору
 * автоматично» (спека § Рішення дизайну - «Дані тумблера на сервері»).
 * Один рядок на користувача, тож стан однаковий на всіх пристроях.
 */
export async function settingsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const { pantryAutoImport } = parseBody(SilpoSettingsRequestSchema, req);
  const result = await setPantryAutoImport(userId, pantryAutoImport);
  logger.info({ msg: "silpo.pantry_auto_import_setting_updated" });
  res.status(200).json(SilpoSettingsResponseSchema.parse(result));
}

/**
 * `POST /api/silpo/receipts/:id/pantry-claim` - атомарне бронювання позицій
 * ПЕРЕД записом у комору (спека § «Позначка живе на сервері, з атомарним
 * бронюванням»). Клієнт пише в комору лише `claimedItemIds` з відповіді, не
 * весь запит - другий пристрій, що прийшов пізніше з тим самим `auto`-чеком,
 * отримує тут порожній масив.
 */
export async function pantryClaimHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;
  const receiptId = readReceiptId(req, res);
  if (!receiptId) return;

  const { itemIds, mode } = parseBody(SilpoPantryClaimRequestSchema, req);
  const claimedItemIds = await claimPantryItems(
    userId,
    receiptId,
    itemIds,
    mode,
  );
  res
    .status(200)
    .json(SilpoPantryClaimResponseSchema.parse({ claimedItemIds }));
}

/**
 * `POST /api/silpo/receipts/:id/pantry-release` - знімає бронювання.
 * `decline: true` - «Повернути» в тості автоімпорту: додатково ставить
 * `pantry_auto_declined_at`, тож найближчий автоімпорт цей чек більше не
 * чіпає (ручний імпорт лишається доступним).
 */
export async function pantryReleaseHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;
  const receiptId = readReceiptId(req, res);
  if (!receiptId) return;

  const { itemIds, decline } = parseBody(SilpoPantryReleaseRequestSchema, req);
  await releasePantryItems(userId, receiptId, itemIds, decline);
  res.status(200).json(SilpoPantryReleaseResponseSchema.parse({ ok: true }));
}
