// Barrel для чистих (DOM-free) helper-ів Фініка, що були в `apps/web/src/modules/finyk/utils.ts`.
// Web-специфічний `lsStats` (читає localStorage) навмисно тут НЕ реекспортується —
// він лишається у `apps/web/src/modules/finyk/lib/lsStats.ts` і додається у
// веб-обгортку `apps/web/src/modules/finyk/utils.ts`.
export * from "./lib/categories.js";
export * from "./lib/formatting.js";
export * from "./lib/accounts.js";
export * from "./lib/debt.js";
export * from "./lib/transactions.js";
export * from "./lib/goals.js";
export * from "./lib/spending.js";
export * from "./lib/quickStats.js";
