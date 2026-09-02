// DOM-free helper-и Фініка. Web-only частини (`lsStats`, `finykStorage`,
// `finykBackup`, `storageManager`, `demoData`) лишаються в `apps/web`.
export * from "./accounts.js";
export * from "./categories.js";
export * from "./debt.js";
export * from "./formatting.js";
export * from "./goals.js";
export * from "./transactions.js";
export * from "./spending.js";
export * from "./dailySpendSeries.js";
// W1-CANON-AGG стадія 1: канонічний «всесвіт витрат» (excluded-set + merge
// ручних витрат). Споживачів поки немає за задумом — див. AI-CONTEXT у metrics.ts.
export * from "./metrics.js";
export * from "./quickStats.js";
export * from "./limitCategorySpend.js";
export * from "./recurringDetect.js";
export * from "./forecastEngine.js";
