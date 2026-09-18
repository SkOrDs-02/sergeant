// Публічна поверхня пакета `@sergeant/finyk-domain` — DOM-free бізнес-логіка
// Фініка, яку можуть споживати `apps/web` і майбутній `apps/mobile` без
// будь-яких платформних залежностей (`localStorage`, `window`, `document`).
export * from "./constants.js";
export * from "./utils.js";
export * from "./storageKeys.js";
export * from "./backup.js";
export * as FinykDomain from "./domain/index.js";
