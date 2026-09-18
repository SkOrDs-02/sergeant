/**
 * `@sergeant/fizruk-domain/domain/programs` — pure types, selectors,
 * resolvers, and formatters backing the Fizruk Programs screen.
 *
 * Everything in this module is platform-neutral: no DOM, no MMKV, no
 * `Date`-global stubs. Apps wrap the selectors in their own
 * persistence hooks (`apps/mobile/src/modules/fizruk/hooks/usePrograms`
 * for mobile, `apps/web/src/modules/fizruk/hooks/useTrainingProgram`
 * on web).
 */

export * from "./types.js";
export * from "./catalogue.js";
export * from "./selectors.js";
export * from "./today.js";
export * from "./state.js";
export * from "./format.js";
