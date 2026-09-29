import type { Request, Response } from "express";
import {
  SilpoCartApplyRequestSchema,
  SilpoCartDtoSchema,
  SilpoCartPreviewRequestSchema,
  SilpoCartPreviewResponseSchema,
} from "../http/schemas.js";
import { parseBody } from "../http/validate.js";
import {
  applyCart,
  clearCart,
  getCart,
  previewCart,
} from "../modules/silpo/cart.js";
import {
  assertSilpoEnabled,
  getUserId,
  type AuthedRequest,
} from "../modules/silpo/routeHelpers.js";

/**
 * `/api/silpo/cart/*` (Track G - «У кошик Сільпо» зі списку покупок).
 * Винесено з `routes/silpo.ts` (Hard Rule #18, max-lines 600); мовтується
 * звідти ж (`createSilpoRouter()`), той самий kill-switch і auth-гейт.
 */

/**
 * `POST /api/silpo/cart/preview` - search-only, never writes. Body:
 * `{items: [{name, quantity?}]}` (1..100, names trimmed/non-empty - Zod
 * rejects a whitespace-only name with 400 before the handler runs).
 */
export async function cartPreviewHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const { items } = parseBody(SilpoCartPreviewRequestSchema, req);
  const results = await previewCart(userId, items);
  res.status(200).json(SilpoCartPreviewResponseSchema.parse({ results }));
}

/**
 * `POST /api/silpo/cart/apply` - confirm-before-write. Body:
 * `{selections: [{lagerId, quantity}]}` (1..100). Adds EXACTLY the passed
 * positions (`applyCart` uses `addQuantity: false`), then returns the
 * post-write cart state.
 */
export async function cartApplyHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const { selections } = parseBody(SilpoCartApplyRequestSchema, req);
  const cart = await applyCart(userId, selections);
  res.status(200).json(SilpoCartDtoSchema.parse(cart));
}

/**
 * `POST /api/silpo/cart/clear` - empty the external cart, then return the
 * post-write (empty) state. Body-less: there is exactly one cart per user.
 */
export async function cartClearHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const cart = await clearCart(userId);
  res.status(200).json(SilpoCartDtoSchema.parse(cart));
}

/** `GET /api/silpo/cart` - current cart state. */
export async function cartGetHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const cart = await getCart(userId);
  res.status(200).json(SilpoCartDtoSchema.parse(cart));
}
