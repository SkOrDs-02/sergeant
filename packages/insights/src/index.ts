// Публічна поверхня пакета `@sergeant/insights` — DOM-free логіка пошуку і
// рекомендацій, яку можуть споживати `apps/web` і майбутній `apps/mobile` без
// будь-яких платформних залежностей (`localStorage`, `window`, `document`).
//
// Обгортки навколо платформо-специфічного сховища живуть у відповідних
// додатках (див. `apps/web/src/core/hubSearchRecents.ts` і
// `apps/web/src/core/lib/recommendations/financeContext.ts`).

export * from "./search/index.js";
export * as Recommendations from "./recommendations/index.js";
export * from "./activation.js";
