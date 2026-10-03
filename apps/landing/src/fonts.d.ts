/**
 * Last validated: 2026-09-01
 * Status: Active
 *
 * Ambient-декларації CSS-only пакетів шрифтів для side-effect імпортів у
 * `main.tsx`. Повний `tsc -p tsconfig.json` резолвить `@fontsource-variable/manrope`
 * через `"main": "index.css"` + `vite/client`, але `tsc-files` у pre-commit
 * (`scripts/staged-typecheck.mjs`) переписує tsconfig без `include`, і той
 * самий імпорт падає з TS2882. Файл зареєстровано в мапі глобальних d.ts
 * того скрипта; без нього будь-який staged .tsx поруч з `main.tsx` валить хук.
 */
declare module "@fontsource-variable/manrope";
declare module "@fontsource/unbounded/*";
