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

export const stringWithDefault = (defaultValue: string) =>
  z
    .string()
    .optional()
    .transform((v) => v ?? defaultValue);

export const llmProviderEnum = (d: "anthropic" | "openrouter" | "stub") =>
  z.enum(["anthropic", "openrouter", "stub"]).default(d);

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
