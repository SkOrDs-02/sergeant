# Codemods

> **Last validated:** 2026-05-13 by @Skords-01 / Devin. **Next review:** 2026-08-11.
> **Status:** Active

Одноразові міграційні скрипти, які запускались **один раз** у певному PR, виконали structural rewrite у репі і більше не потрібні в нормальному workflow. Зберігаються тут для:

- forensics (хтось ловить regression і хоче зрозуміти, як саме код перероблено);
- re-run на старій гілці чи fork-у, де rewrite ще не виконано;
- як reference-приклад при написанні наступного codemod-у.

**Це не CI tooling.** CI / lint скрипти живуть у `scripts/` root. Якщо цей README чи піддиректорія раптом потрапляє в `package.json` як `pnpm <task>` — це сигнал, що його треба переписати у звичайний script у `scripts/`, не в codemod.

## Layout

Кожен codemod — окрема піддиректорія з:

- `script.mjs` — сам кодомод (виконуваний `node` script).
- `README.md` — що робив, коли запускався, чому залишається тут, як re-run.

## Caталог

| Codemod                                          | Запущено              | Що робив                                                                                                                                                                                                                                                                                                                | Long-term enforcement                                                                                                                                                |
| ------------------------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`strip-js-extensions/`](./strip-js-extensions/) | до 2026-05-03         | Видалив `.js` / `.jsx` з 436 first-party-імпортів у 180 файлах під `apps/web/src`                                                                                                                                                                                                                                       | `eslint-plugin-import` + `import/extensions: never` (PR #1411)                                                                                                       |
| [`i18n-burndown/`](./i18n-burndown/)             | 2026-05-05 (round 15) | Long-running burndown for item #18 (i18n). AST-rewrites JSX text + JSX-attribute UA literals у allowlist-файлах на `messages.<group>.<key>` із `apps/web/src/shared/i18n/uk.ts` і вибиває fully-migrated шляхи з `apps/web/eslint.i18n-allowlist.json`. Idempotent — пере-запускається при кожному розширенні каталогу. | ESLint rule `sergeant-design/no-cyrillic-jsx-literal` (warn-mode + allowlist; promote до `error` після `[]`). Codemod НЕ є CI-drift-check — burndown gradual per-PR. |

> Removed: `syncedKV/` (2026-05-03 — `safeWriteLS(<tracked>, …) → safeWriteSyncedLS(…)`).
> Dropped in PR #053a (KVStore deprecate, web phase) along with the
> `syncedKV` factory wrapper itself — there are no remaining
> `safeWriteSyncedLS` call-sites under `apps/web/src` for the codemod
> to operate on, and the cross-platform sync registry now writes per-row
> via the v2 op-log writer-runtime (`apps/web/src/core/syncEngine/`).

## Adding a new codemod

1. Створи піддиректорію `scripts/codemods/<descriptive-name>/`.
2. Поклади `script.mjs` усередину (стиль — як у решти `scripts/*.mjs`: shebang, top-of-file коментар з призначенням, dry-run за замовчанням, явний `--write` для застосування).
3. Поклади `README.md`, дотримуючись формату existing codemod-ів: «що робив», «коли запускався», «idempotency note», «long-term enforcement» (як забезпечується, що drift не повернеться).
4. Зареєструй у каталозі вище.
5. Якщо drift, який цей codemod виправляє, можна спіймати через ESLint / Hard Rule / CI script — додай його в тому ж PR. Codemod без long-term enforcement = регресія через 6 місяців.
