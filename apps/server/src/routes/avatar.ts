/**
 * Last validated: 2026-10-20
 * Status: Active
 */
import { Router } from "express";
import type { Request, Response } from "express";
import {
  AVATAR_CONTENT_TYPES,
  AVATAR_MAX_BYTES,
  AvatarDeleteResponseSchema,
  AvatarPutResponseSchema,
} from "@sergeant/shared";
import { rateLimitExpress, requireSession, setModule } from "../http/index.js";
import { pool } from "../db.js";
import { AppError } from "../obs/errors.js";
import {
  detectImageType,
  loadAvatar,
  removeAvatar,
  saveAvatar,
} from "../modules/avatar/avatar.js";

type AuthedUser = { id: string };

/** `Content-Type` без параметрів (`image/webp; charset=…`) і в нижньому регістрі. */
function mimeOf(req: Request): string {
  const raw = req.headers["content-type"];
  return typeof raw === "string"
    ? (raw.split(";")[0] ?? "").trim().toLowerCase()
    : "";
}

/**
 * `/api/avatar` - аватар користувача, байти в Postgres (ux-14, migration 160).
 *
 *  - `PUT    /api/avatar`         сире зображення (webp|png|jpeg, до 50 КБ),
 *                                 upsert + `user.image` = короткий URL;
 *  - `GET    /api/avatar/:userId` байти. Лише ВЛАСНИК сесії: чужий `userId` і
 *                                 відсутній аватар однаково 404 (без oracle).
 *  - `DELETE /api/avatar`         прибрати рядок і обнулити `user.image`.
 *
 * AI-CONTEXT: чому GET не публічний. Аватар показується лише власнику (екран
 * профілю), публічного перегляду чужих профілів у продукті нема, тож
 * найпростіше безпечне - вимагати сесію й порівнювати `userId`. Якщо колись
 * з'являться спільні екрани (команда, друзі), це місце розширюється явним
 * правилом, а не відкриттям усім.
 *
 * Тіло PUT парсить `express.raw({ type: "image/*", limit: 50kb })` із
 * `http/bodySizePolicy.ts`: 413 віддає body-parser ще до хендлера, а 415 -
 * хендлер (чужий MIME або magic bytes не збігаються із заявленим типом).
 *
 * Порядок: `requireSession()` ПЕРЕД лімітером, щоб `rateLimitSubject` дав
 * `u:<id>`, а не `ip:<addr>` (та сама конвенція, що в `PUT /api/me/profile`,
 * її стереже `scripts/check-auth-before-rate-limit.mjs`).
 *
 * Hard Rule #21: байти й `req.body` не логуються.
 */
export function createAvatarRouter(): Router {
  const r = Router();
  r.use("/api/avatar", setModule("avatar"));

  r.put(
    "/api/avatar",
    requireSession(),
    // Зміна фото - рідка дія: 20/год на людину з запасом на «не те обрав, ще
    // раз». `ipLimit` - вторинний бакет під спільний NAT.
    rateLimitExpress({
      key: "api:avatar:write",
      limit: 20,
      windowMs: 60 * 60_000,
      ipLimit: 100,
    }),
    async (req: Request, res: Response) => {
      const user = (req as Request & { user: AuthedUser }).user;
      const declared = mimeOf(req);
      if (!(AVATAR_CONTENT_TYPES as readonly string[]).includes(declared)) {
        throw new AppError("Підтримуються лише WebP, PNG і JPEG.", {
          status: 415,
          code: "UNSUPPORTED_MEDIA_TYPE",
        });
      }
      const body: unknown = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        throw new AppError("Порожнє зображення.", {
          status: 400,
          code: "VALIDATION",
        });
      }
      // Страховка поверх body-parser: ліміт той самий, але хендлер не має
      // залежати від того, що парсер змонтовано правильно.
      if (body.length > AVATAR_MAX_BYTES) {
        throw new AppError("Зображення завелике.", {
          status: 413,
          code: "PAYLOAD_TOO_LARGE",
        });
      }
      const detected = detectImageType(body);
      if (detected === null || detected !== declared) {
        throw new AppError("Вміст файлу не відповідає заявленому типу.", {
          status: 415,
          code: "UNSUPPORTED_MEDIA_TYPE",
        });
      }
      const saved = await saveAvatar(pool, user.id, detected, body);
      res.json(
        AvatarPutResponseSchema.parse({
          image: saved.image,
          updatedAt: saved.updatedAt.toISOString(),
        }),
      );
    },
  );

  r.get(
    "/api/avatar/:userId",
    requireSession(),
    // Картинка кешується immutable під `?v=`, тож реальний трафік малий;
    // ліміт лише ловить цикл по сесії.
    rateLimitExpress({
      key: "api:avatar:read",
      limit: 300,
      windowMs: 5 * 60_000,
      ipLimit: 1500,
    }),
    async (req: Request, res: Response) => {
      const user = (req as Request & { user: AuthedUser }).user;
      const userId = req.params["userId"];
      // Чужий id і «аватара нема» - та сама 404, щоб не світити, чи існує
      // аватар у іншого користувача.
      if (userId !== user.id) {
        throw new AppError("Аватара немає.", {
          status: 404,
          code: "NOT_FOUND",
        });
      }
      const avatar = await loadAvatar(pool, user.id);
      if (!avatar) {
        throw new AppError("Аватара немає.", {
          status: 404,
          code: "NOT_FOUND",
        });
      }
      res.setHeader("Content-Type", avatar.contentType);
      res.setHeader("Content-Length", String(avatar.data.length));
      res.setHeader("X-Content-Type-Options", "nosniff");
      // `/api/*` за замовчуванням `no-store`; для аватара перекриваємо.
      // `private` - у спільних кешах (CDN, проксі) картинка не живе; `immutable`
      // безпечний лише з `?v=`, який змінюється з кожним аплоадом.
      res.setHeader(
        "Cache-Control",
        req.query["v"] !== undefined
          ? "private, max-age=31536000, immutable"
          : "private, no-cache",
      );
      // `requireSession` ставить CORP=same-origin (H8), а веб (app.*) і API
      // (api.*) - різні origin одного сайту: `<img>` із same-origin CORP
      // блокується. `same-site` дозволяє піддомени, лишаючись закритим для
      // чужих сайтів.
      res.setHeader("Cross-Origin-Resource-Policy", "same-site");
      res.status(200).end(avatar.data);
    },
  );

  r.delete(
    "/api/avatar",
    requireSession(),
    rateLimitExpress({
      key: "api:avatar:write",
      limit: 20,
      windowMs: 60 * 60_000,
      ipLimit: 100,
    }),
    async (req: Request, res: Response) => {
      const user = (req as Request & { user: AuthedUser }).user;
      await removeAvatar(pool, user.id);
      res.json(AvatarDeleteResponseSchema.parse({ ok: true }));
    },
  );

  return r;
}
