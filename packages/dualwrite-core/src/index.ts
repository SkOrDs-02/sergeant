/**
 * @sergeant/dualwrite-core — platform-neutral dual-write framework (ADR-0073).
 *
 * `createApplyOps` (крок 2) is the op-loop factory every module adapter
 * builds on; `convert.js` holds the numeric coercion helpers.
 */

export * from "./apply.js";
export * from "./convert.js";
export * from "./createApplyOps.js";
export * from "./tableSpec.js";
