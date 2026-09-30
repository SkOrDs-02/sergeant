import { z } from "zod";

/**
 * Shared zod-coercion helpers for `env.ts`. Split out purely to shave lines
 * off `env.ts` (Hard Rule #18 — `max-lines: 600`, `skipBlankLines` +
 * `skipComments`) after a security-audit merge on `main` pushed it over the
 * limit; zero behaviour change — every helper here is a byte-for-byte move,
 * not a rewrite. Deliberately domain-neutral (no AI-model / routing
 * semantics) so it can't conflict with parallel model-routing work.
 */

export const coerceInt = z.coerce.number().int();

export const intFromEnv = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return defaultValue;
      const n = Number.parseInt(v, 10);
      return Number.isNaN(n) ? defaultValue : n;
    });

export const floatFromEnv = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return defaultValue;
      const n = Number.parseFloat(v);
      return Number.isFinite(n) ? n : defaultValue;
    });

export const boolFromEnv = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined) return defaultValue;
      const lower = v.toLowerCase();
      if (lower === "true" || lower === "1") return true;
      if (lower === "false" || lower === "0") return false;
      return defaultValue;
    });

/**
 * Fail-loud варіант `boolFromEnv` для прапорців, що керують витратами
 * (`ANTHROPIC_BUDGET_*`). Тихий дефолт на `yes`/`on` під час інциденту витрат
 * лишає «справжню стелю» вимкненою без жодного сигналу (аудит ai-pipeline B15).
 * Приймає лише true/false/1/0 (регістр і крайні пробіли не важливі); порожнє
 * або відсутнє значення дає дефолт; решта — ZodIssue, тобто throw на старті.
 * Зразок — `STRIPE_ENABLED` в `env.ts`.
 */
export const strictBoolFromEnv = (name: string, defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v.trim() === "") return defaultValue;
      const lower = v.trim().toLowerCase();
      if (lower === "true" || lower === "1") return true;
      if (lower === "false" || lower === "0") return false;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${name} must be one of true/false/1/0 (got ${JSON.stringify(v)}) — refusing to guess on a cost-control flag`,
      });
      return z.NEVER;
    });

/**
 * `AI_QUOTA_FOUNDER_IDS`: comma-separated Better Auth user id (opaque string,
 * не UUID). Кожен запис після trim — непорожній і без пробільних символів
 * усередині (типова помилка: пропущена кома дає «id1 id2», який мовчки не
 * збігається з жодним юзером). Порожні сегменти (кінцева кома) ігноруються.
 * Значення повертається як є — ран-тайм читає `process.env` напряму.
 */
export const founderIdsFromEnv = (name: string) =>
  z
    .string()
    .optional()
    .superRefine((v, ctx) => {
      if (v === undefined) return;
      for (const raw of v.split(",")) {
        const id = raw.trim();
        if (id === "") continue;
        if (/\s/.test(id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${name} entry ${JSON.stringify(id)} contains whitespace — ids must be comma-separated opaque strings`,
          });
        }
      }
    });

/**
 * Ран-тайм-двійник `boolFromEnv` для модулів, які свідомо читають
 * `process.env` напряму (щоб тест міг перемкнути прапорець без ре-імпорту
 * модуля, а ops — без редеплою).
 *
 * Семантика мусить збігатися з `boolFromEnv` рядок-у-рядок: інакше та сама
 * змінна означає різне у схемі й у ран-таймі. Саме такий розкол тримав
 * `CHAT_VIA_OPENROUTER` у двох станах одночасно — схема казала «ON за
 * замовчуванням», а ран-тайм читав відсутнє значення як OFF.
 */
export const boolFromProcessEnv = (
  name: string,
  defaultValue: boolean,
): boolean => {
  const v = process.env[name];
  if (v === undefined) return defaultValue;
  const lower = v.toLowerCase();
  if (lower === "true" || lower === "1") return true;
  if (lower === "false" || lower === "0") return false;
  return defaultValue;
};

export const stringWithDefault = (defaultValue: string) =>
  z
    .string()
    .optional()
    .transform((v) => v ?? defaultValue);

// `llmProviderEnum` жив тут до мержу з main: PR #634 переніс усі
// LLM_*-ключі у `aiRoutingEnv.ts`, який тримає власну копію хелпера.
// Тут він лишився б мертвим експортом і світив би у Knip.

export const optionalUrl = () =>
  z
    .string()
    .optional()
    .transform((v) => v ?? "")
    .refine(
      (v) => {
        if (v === "") return true;
        try {
          new URL(v);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Invalid URL" },
    );
