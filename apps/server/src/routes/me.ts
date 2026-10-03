import { Router } from "express";
import type { Request, Response } from "express";
import {
  MeDeleteBodySchema,
  MeDeleteResponseSchema,
  MeDeletionStatusResponseSchema,
  MeExportResponseSchema,
  MeRestoreResponseSchema,
  MeResponseSchema,
  UserPreferencesPatchSchema,
  UserPreferencesSchema,
  UserProfilePutBodySchema,
  UserProfileResponseSchema,
  type MeResponse,
} from "@sergeant/shared";
import {
  parseBody,
  rateLimitExpress,
  requireFreshSession,
  requireSession,
  setModule,
} from "../http/index.js";
import { pool } from "../db.js";
import { AppError } from "../obs/errors.js";
import {
  buildMeExport,
  getAccountDeletionStatus,
  getUserPreferences,
  requestAccountDeletion,
  restoreAccount,
  upsertUserPreferences,
} from "../modules/me/dataRights.js";
import { getUserProfile, upsertUserProfile } from "../modules/me/profile.js";
import { verifyAccountPassword } from "../modules/me/verifyAccountPassword.js";
import { mirrorProfileMemoryEntries } from "../modules/ai-memory/profileMirror.js";

type AuthedUser = {
  id: string;
  email?: string;
  name?: string;
  image?: string | null;
  emailVerified?: boolean;
  // Better Auth повертає `createdAt` як `Date`; нормалізуємо у ISO-рядок
  // нижче (схема `UserSchema` очікує `string | null`). Допускаємо `string`
  // на випадок, якщо адаптер сесії віддасть уже серіалізоване значення.
  createdAt?: Date | string;
};

function toIsoOrNull(value: Date | string | undefined): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string" && value.length > 0) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/**
 * `/api/me` — уніфікований endpoint "хто я" для web cookie-сесій та
 * mobile bearer-токенів.
 *
 * Реалізація навмисно банальна: `requireSession()` делегує резолюцію
 * сесії у `getSessionUser()` → `auth.api.getSession(headers)`. Better Auth
 * bearer-плагін підхоплює `Authorization: Bearer <token>` ДО виклику
 * cookie-парсера, перекладає його у in-memory cookie і далі код не
 * розрізняє канал. Тому один роут працює для обох клієнтів.
 *
 * Доступний і на `/api/me`, і на `/api/v1/me` (див. `apiVersionRewrite`
 * у `server/app.ts`). Формат відповіді сумісний із `auth.api.getSession`,
 * але обрізаний до публічних полів — не повертаємо internal timestamps
 * чи id сесії.
 */
/**
 * `user.id` тих, чий експорт зараз збирається. Живе на модулі, а не в
 * замиканні роутера: роутер створюється один раз на процес, тож різниці
 * в поведінці немає, зате стан видно тестам.
 */
const exportsInFlight = new Set<string>();

export function createMeRouter(): Router {
  const r = Router();
  r.use("/api/me", setModule("me"));

  // `/export` і `DELETE /api/me` — дві з трьох поверхонь, заради яких існує
  // `getFreshSessionUser` (третя — банк, див. `mono-webhook.ts` /
  // `banks.ts`). Решта роутів файлу лишається на кешованому
  // `requireSession()`: 5-хвилинне вікно для читання профілю прийнятне,
  // для вивантаження всіх даних чи знищення акаунта — ні.
  r.get(
    "/api/me/export",
    requireFreshSession(),
    // Найважчий запит у застосунку — і єдиний дорогий, що лишався зовсім
    // без лімітера. `buildMeExport` пускає девʼять паралельних запитів,
    // два з них `LIMIT 5000` (`mono_transaction` з `ORDER BY time DESC`,
    // `ai_memories`), а `requireFreshSession()` зверху додає окремий
    // лукап сесії в обхід cookie-кешу на КОЖЕН виклик. Тобто цикл із
    // однією валідною сесією бив по базі сильніше, ніж будь-який
    // AI-роут, які всі лімітовані.
    //
    // Порядок навмисний — лімітер ПІСЛЯ сесії, щоб `rateLimitSubject`
    // дав `u:<id>`, а не `ip:<addr>` (та сама конвенція, що в
    // `PUT /api/me/profile` нижче, і її стереже
    // `scripts/check-auth-before-rate-limit.mjs`).
    //
    // 5/год на людину: експорт — дія «раз на кілька місяців», навіть
    // найактивніша легітимна поведінка (перевірити, перезавантажити,
    // повторити) у стелю не впирається. `ipLimit` — вторинний бакет під
    // спільний NAT.
    rateLimitExpress({
      key: "api:me:export",
      limit: 5,
      windowMs: 60 * 60_000,
      ipLimit: 20,
    }),
    async (req: Request, res: Response) => {
      const user = serializeMeUser(
        (req as Request & { user: AuthedUser }).user,
      );
      // Один активний експорт на людину, поверх годинного лімітера вище.
      // Відколи файл віддає всі таблиці чотирьох модулів без `LIMIT`, два
      // паралельні виклики того самого акаунта тримають два повні набори
      // рядків у памʼяті процесу одночасно — а це найважчий запит у
      // застосунку.
      //
      // ponytail: замок у памʼяті процесу, тобто на один інстанс. Якщо
      // бекенд колись поїде в кілька реплік, це місце міняється на
      // `pg_try_advisory_lock` по `user.id` — семантика та сама.
      if (exportsInFlight.has(user.id)) {
        res.status(409).json({
          error: "export_in_flight",
          message: "Твій експорт уже готується. Дочекайся файлу і спробуй ще.",
          requestId: (req as Request & { requestId?: string }).requestId,
        });
        return;
      }
      exportsInFlight.add(user.id);
      try {
        const payload = MeExportResponseSchema.parse(
          await buildMeExport(pool, user),
        );
        res.json(payload);
      } finally {
        exportsInFlight.delete(user.id);
      }
    },
  );

  r.get(
    "/api/me/preferences",
    requireSession(),
    async (req: Request, res: Response) => {
      const user = (req as Request & { user: AuthedUser }).user;
      const payload = UserPreferencesSchema.parse(
        await getUserPreferences(pool, user.id),
      );
      res.json(payload);
    },
  );

  r.patch(
    "/api/me/preferences",
    requireSession(),
    async (req: Request, res: Response) => {
      const user = (req as Request & { user: AuthedUser }).user;
      const patch = parseBody(UserPreferencesPatchSchema, req);
      const payload = UserPreferencesSchema.parse(
        await upsertUserPreferences(pool, user.id, patch),
      );
      res.json(payload);
    },
  );

  // Write-through профіль/біометрія (migration 115) — НЕ oplog-sync,
  // звичайний GET/PUT upsert по user_id (див. modules/me/profile.ts).
  r.get(
    "/api/me/profile",
    requireSession(),
    async (req: Request, res: Response) => {
      const user = (req as Request & { user: AuthedUser }).user;
      const payload = UserProfileResponseSchema.parse(
        await getUserProfile(pool, user.id),
      );
      res.json(payload);
    },
  );

  r.put(
    "/api/me/profile",
    // L-8 Фаза 2 (2026-08-09). Цей роут перестав бути дешевим upsert-ом:
    // після дзеркалення він кладе в чергу інжесту до
    // `PROFILE_MEMORY_MAX_ENTRIES` (200) job-ів, кожен з яких — окремий
    // Voyage-ембеддинг. Тобто це рівно той «дорогий шлях», який
    // `routes/ai-memory.ts` захищає своїм `heavyRateLimit` із коментарем
    // «черга ingest-у + Voyage-ембеддинги».
    //
    // Дифу самого по собі мало: незмінний профіль справді no-op-ить, але
    // скрипт, що щоразу МІНЯЄ текст фактів, змушує ембедити наново на
    // кожному запиті. `me` лишався єдиним роутером репо взагалі без
    // лімітера (решта вісімнадцяти файлів у `routes/` його мають), і саме
    // ця зміна зробила прогалину дорогою.
    //
    // 60/5хв — свідомо щедріше за `heavyRateLimit` (30/5хв): веб пушить
    // профіль після КОЖНОГО локального редагування біометрії чи банку
    // памʼяті (`profileWriteThrough.ts`), тож людина, яка правит кілька
    // полів поспіль, легко дає десяток запитів за хвилину і не має
    // впертись у стелю. Скрипт — впреться.
    //
    // ПОРЯДОК: `requireSession()` СТОЇТЬ ПЕРШИМ, і це свідомо інакше, ніж
    // у решти роутерів репо (`ai-memory`, `finyk`, `nutrition`, `sync`
    // ставлять лімітер попереду). Причина — `rateLimitSubject()`
    // (`http/rateLimit.ts`) повертає `u:<id>` лише коли `req.user` уже
    // виставлений; до сесії він віддає `ip:<clientIp>`. Тобто з лімітером
    // попереду мій власний коментар вище був би неправдою: бакет ділився б
    // НЕ між запитами однієї людини, а між усіма за одним egress-ом (NAT
    // оператора, офіс), і 60/5хв ловило б сусідів, а не скрипт.
    //
    // Ціна перестановки — неавтентифікований флуд доходить до резолюції
    // сесії перед 401. Прийнятно саме тут: усі інші роути цього ж файлу
    // (`GET /api/me`, `/export`, `PATCH /preferences`) і так починаються з
    // `requireSession()` взагалі без лімітера, тож флуд у `me.ts` уже
    // коштує рівно стільки ж.
    //
    // `ipLimit` — вторинний бакет M9: тримає машинний стель незалежно від
    // того, скільки акаунтів на ній заведено. 300/5хв ≈ пʼятеро легітимних
    // людей за одним NAT на повній швидкості, але скрипт із півсотнею
    // акаунтів упреться. Це перший продакшн-роут, який його вмикає взагалі
    // — досі `ipLimit` жив лише в тестах `rateLimit.test.ts`.
    requireSession(),
    rateLimitExpress({
      key: "api:me:profile",
      limit: 60,
      windowMs: 5 * 60_000,
      ipLimit: 300,
    }),
    async (req: Request, res: Response) => {
      const user = (req as Request & { user: AuthedUser }).user;
      const body = parseBody(UserProfilePutBodySchema, req);
      const payload = UserProfileResponseSchema.parse(
        await upsertUserProfile(pool, user.id, body.profile),
      );
      // L-8 Фаза 2 (2026-08-09): дзеркалимо `memoryBank`-факти в
      // `ai_memories` (source='profile') ПІСЛЯ успішного upsert-у профілю.
      // Побічний ефект, best-effort — `mirrorProfileMemoryEntries` НІКОЛИ
      // не кидає (Voyage down / circuit open / AI_MEMORY_ENABLED=false /
      // вимкнений консент усі no-op-ляться всередині), тож профіль уже
      // збережено і відповідь 200 не залежить від результату дзеркалення.
      //
      // `payload.profile` - ЗБЕРЕЖЕНИЙ (можливо, LWW-мерджений
      // `upsertUserProfile`) стан, НЕ `body.profile`. Рішення власника
      // 2026-09-23: коли памʼятковий LWW-guard лишає збережену секцію
      // `memoryBank` замість застарілого тіла запиту, дзеркалення мусить
      // бачити те саме, що щойно збережено в `user_profile`, інакше
      // застарілий пристрій, чий пуш сервер відхилив, усе одно
      // воскрешав би вже видалений факт у `ai_memories`.
      await mirrorProfileMemoryEntries(pool, user.id, payload.profile);
      res.json(payload);
    },
  );

  // Прохання видалити акаунт. НЕ видаляє: ставить мітку, гасить сесії,
  // зупиняє списання; незворотну частину через
  // `ACCOUNT_DELETION_GRACE_DAYS` днів виконує `AccountDeletionPoller`
  // (спека docs/work/specs/user-deletion-grace-window.md).
  //
  // Це ЄДИНИЙ живий шлях видалення. `POST /api/auth/delete-user` (Better
  // Auth) вимкнений — `user.deleteUser.enabled: false` в `auth.ts`, бо на
  // його хуку вікно нездійсненне; пін на це стоїть у `auth.test.ts`. Гварди
  // цього роуту (пароль + свіжа сесія) закріплені в
  // `routes/me.delete.route.test.ts`.
  r.delete(
    "/api/me",
    requireFreshSession(),
    async (req: Request, res: Response) => {
      const user = (req as Request & { user: AuthedUser }).user;

      // Пароль звіряємо ТУТ, бо живий шлях переїхав сюди з вимкненого
      // `POST /api/auth/delete-user` (див. `user.deleteUser` в `auth.ts`).
      // Без цього кроку планка впала б зі «знає пароль» до «має живу
      // сесію», і вкрадена сесія могла б запустити 30-денний відлік.
      const body = MeDeleteBodySchema.parse(req.body ?? {});
      const check = await verifyAccountPassword(user.id, body.password);
      if (!check.ok) {
        throw new AppError("Неправильний пароль", {
          status: 400,
          code: "INVALID_PASSWORD",
        });
      }

      const payload = MeDeleteResponseSchema.parse(
        await requestAccountDeletion(pool, user.id),
      );
      res.json(payload);
    },
  );

  // Два роути нижче свідомо проходять повз гейт вікна: інакше вони
  // заблокували б самі себе, і людина у вікні не змогла б ані побачити
  // дату, ані скасувати видалення (рішення 4 спеки).
  r.get(
    "/api/me/deletion-status",
    requireSession({ allowPendingDeletion: true }),
    async (req: Request, res: Response) => {
      const user = (req as Request & { user: AuthedUser }).user;
      const payload = MeDeletionStatusResponseSchema.parse(
        await getAccountDeletionStatus(pool, user.id),
      );
      res.json(payload);
    },
  );

  // `requireFreshSession`, а не звичайна: скасування видалення — це та сама
  // висока планка, що й саме видалення, і сесія мусить бути перевірена в
  // БД, а не взята з 5-хвилинного cookie-кешу.
  r.post(
    "/api/me/restore",
    requireFreshSession({ allowPendingDeletion: true }),
    async (req: Request, res: Response) => {
      const user = (req as Request & { user: AuthedUser }).user;
      const restored = await restoreAccount(pool, user.id);
      if (!restored) {
        // Скасовувати не було чого. 404, а не 200: «відновив активний
        // акаунт» не є успіхом, і клієнт має відрізнити це від реального
        // скасування.
        throw new AppError("Немає активного прохання видалити акаунт", {
          status: 404,
          code: "NO_PENDING_DELETION",
        });
      }
      const payload = MeRestoreResponseSchema.parse({
        ok: true as const,
        restoredAt: new Date().toISOString(),
      });
      res.json(payload);
    },
  );

  r.get("/api/me", requireSession(), async (req: Request, res: Response) => {
    const user = (req as Request & { user: AuthedUser }).user;
    // Прогоняємо відповідь через канонічну Zod-схему з `@sergeant/shared`
    // (те саме, що валідує `@sergeant/api-client` на клієнті). Це гарантує,
    // що веб і майбутній мобільний клієнт отримають ідентичну форму, і
    // не дає випадково просочити новому полю в response без оновлення
    // схеми.
    // `email` має валідацію `.email()` у схемі — тож порожній рядок ""
    // валитиме parse. Використовуємо `||` замість `??`, щоб і falsy-рядки
    // (якщо колись прийшов "") нормалізувались до `null`.
    const payload: MeResponse = MeResponseSchema.parse({
      user: serializeMeUser(user),
    });
    res.json(payload);
  });
  return r;
}

function serializeMeUser(user: AuthedUser): MeResponse["user"] {
  return {
    id: user.id,
    email: user.email || null,
    name: user.name ?? null,
    image: user.image ?? null,
    emailVerified: Boolean(user.emailVerified),
    createdAt: toIsoOrNull(user.createdAt),
  };
}
