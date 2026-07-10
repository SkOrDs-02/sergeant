/**
 * @sergeant/dualwrite-core — platform-neutral dual-write framework (ADR-0073).
 *
 * Крок 1: op-loop і числові конвертери, перенесені з
 * `apps/web/src/shared/lib/sqliteWriter/core.ts` (web-шлях лишається re-export-ом).
 * Наступні кроки додадуть TableSpec/SQL-білдери та orchestrator-фабрику.
 */

export * from "./apply.js";
export * from "./convert.js";
export * from "./createApplyOps.js";
export * from "./tableSpec.js";
