import type { Request, Response } from "express";
import { z } from "zod";
import type { ZodTypeAny } from "zod";

import { ValidationError } from "../obs/errors.js";

export type ValidationResult<T> = { ok: true; data: T } | { ok: false };

/**
 * Валідація тіла запиту за zod-схемою.
 *
 * Повертає `{ ok: true, data }` з розпарсеним тілом або `{ ok: false }` після
 * того, як уже відправлено 400 з деталями. Обробник має одразу повернути
 * керування:
 *
 *   const parsed = validateBody(schema, req, res);
 *   if (!parsed.ok) return;
 *   const { foo } = parsed.data;
 *
 * Помилки локалізовані українською, деталі — масив `{ path, message }` для
 * клієнта, який хоче підсвітити поля.
 *
 * Цей хелпер історичний — нові handler-и краще писати з `parseBody`
 * (throw-based), бо `asyncHandler` + центральний `errorHandler` віддасть
 * однаковий 400 з `code: "VALIDATION"` без ручного `if (!parsed.ok) return`.
 */
export function validateBody<S extends ZodTypeAny>(
  schema: S,
  req: Request,
  res: Response,
): ValidationResult<z.infer<S>> {
  const body = req.body ?? {};
  const result = schema.safeParse(body);
  if (result.success) {
    return { ok: true, data: result.data as z.infer<S> };
  }
  const issues = result.error.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
  }));
  res.status(400).json({
    error: "Некоректні дані запиту",
    details: issues,
  });
  return { ok: false };
}

/**
 * Те саме, але для query-параметрів (req.query).
 */
export function validateQuery<S extends ZodTypeAny>(
  schema: S,
  req: Request,
  res: Response,
): ValidationResult<z.infer<S>> {
  const query = req.query ?? {};
  const result = schema.safeParse(query);
  if (result.success) {
    return { ok: true, data: result.data as z.infer<S> };
  }
  const issues = result.error.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
  }));
  res.status(400).json({
    error: "Некоректні параметри запиту",
    details: issues,
  });
  return { ok: false };
}

/**
 * Throw-based варіант `validateBody`. Кидає `ValidationError` (status 400,
 * code `VALIDATION`) з payload-ом `{ details: [{ path, message }] }` у
 * `cause`. Працює у тандемі з `asyncHandler` + центральним
 * `errorHandler` — обидва вже знають про `AppError`-ієрархію, тому новий
 * handler стає однорядковим:
 *
 *   const { foo } = parseBody(MySchema, req);
 *   // ...
 *
 * Перевага над `validateBody`-сентинелем — не треба памʼятати `if
 * (!parsed.ok) return`; забутий `return` був історичним джерелом 500-к на
 * проді. Хелпер additive — старі callsite-и продовжують працювати без
 * змін; нові handler-и краще писати через цей варіант (див.
 * `docs/audits/2026-05-13-backend-performance-roast.md`).
 */
export function parseBody<S extends ZodTypeAny>(
  schema: S,
  req: Request,
): z.infer<S> {
  const body = req.body ?? {};
  const result = schema.safeParse(body);
  if (result.success) return result.data as z.infer<S>;
  const details = result.error.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
  }));
  throw new ValidationError("Некоректні дані запиту", {
    cause: { details },
  });
}

/**
 * Throw-based варіант `validateQuery`. Кидає `ValidationError` з details
 * у `cause` так само, як `parseBody`.
 */
export function parseQuery<S extends ZodTypeAny>(
  schema: S,
  req: Request,
): z.infer<S> {
  const query = req.query ?? {};
  const result = schema.safeParse(query);
  if (result.success) return result.data as z.infer<S>;
  const details = result.error.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
  }));
  throw new ValidationError("Некоректні параметри запиту", {
    cause: { details },
  });
}

export { z };
