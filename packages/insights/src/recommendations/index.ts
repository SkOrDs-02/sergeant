// Barrel для API рекомендацій. Споживачі (`apps/web/core/lib/recommendationEngine.ts`,
// майбутній `apps/mobile`) імпортують правила і типи звідси; білдер контексту
// (з доступом до `localStorage` / платформного сховища) живе на рівні додатка.

export * from "./types.js";
export * from "./registry.js";
export * from "./financeContext.js";
export * from "./finance/index.js";
