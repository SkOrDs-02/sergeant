// Публічна поверхня пакета `@sergeant/fizruk-domain` — DOM-free бізнес-логіка
// Фізрука, яку можуть споживати `apps/web` і майбутній `apps/mobile` без
// будь-яких платформних залежностей (`localStorage`, `window`, `document`).
export * from "./constants.js";
export * from "./domain/index.js";
export * as FizrukData from "./data/index.js";
export * from "./lib/index.js";
