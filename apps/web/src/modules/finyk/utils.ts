// Barrel для `@finyk/utils`. Чисті (DOM-free) helper-и беремо з пакета
// `@sergeant/finyk-domain`; web-специфічний `lsStats` (читає localStorage)
// залишається у `./lib/lsStats.ts` і додається лише тут.
export * from "@sergeant/finyk-domain/utils";
export * from "./lib/lsStats";
