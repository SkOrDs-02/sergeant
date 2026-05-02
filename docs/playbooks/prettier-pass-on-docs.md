# Playbook: Prettier Pass on `docs/`

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-28.
> **Status:** Active

**Trigger:** `pnpm format:check` фейлиться на `docs/**/*.md` / треба прогнати prettier по одному / кільком doc-файлах (як [PR #447](https://github.com/Skords-01/Sergeant/pull/447)).

---

## Steps

### 1. Підтвердити, що target не в `.prettierignore`

```bash
cat .prettierignore | grep -E "docs|\.md"
```

Якщо файл явно ignored — STOP. Не форсуй формат для ignored-файлів; спершу зʼясуй із власником, чому ігнор там стоїть.

### 2. Подивитись, що саме non-conforming

```bash
pnpm exec prettier --check '<target-glob>'
# Приклади:
pnpm exec prettier --check 'docs/mobile/react-native-migration.md'
pnpm exec prettier --check 'docs/**/*.md'
```

Запиши вивід — список файлів = очікуваний обсяг diff-у.

### 3. Прогнати prettier

```bash
pnpm exec prettier --write '<target-glob>'
git diff --stat '<target-glob>'
```

### 4. Перевірити diff на semantic-зміни

```bash
git diff '<target-glob>' | head -80
```

Має бути **тільки**:

- Whitespace / line-wrap.
- Перестановка markdown table column padding.
- Marker-перестановка списків (`-` ↔ `*`, нумерація).
- Blank-line normalisation.

Якщо бачиш зміну тексту, посилань, заголовків — відкоти цей файл і досліди (`prettier` так не робить за замовчуванням; може бути конфлікт із markdownlint або inline-HTML).

### 5. Створити PR

- Branch: `devin/<unix-ts>-chore-docs-prettier`.
- Commit: `chore(docs): apply prettier to <path-or-glob>` (scope `docs`, AGENTS.md rule #5; саме така форма використана в [PR #447](https://github.com/Skords-01/Sergeant/pull/447)).
- PR description (`.github/PULL_REQUEST_TEMPLATE.md`):
  - Target glob / path.
  - Явно: «formatting-only, no content changes».
  - Список модифікованих файлів.

---

## Verification

- [ ] `pnpm exec prettier --check '<target>'` — green на гілці.
- [ ] `git diff` проти base показує тільки форматування (нічого з контенту).
- [ ] PR-діф містить **тільки** файли під `docs/`.
- [ ] CI: `format:check` зелений в `check` job.
- [ ] Branch і commit conform до AGENTS.md rule #5 (scope `docs`).

## Notes

- Завжди запускай prettier через `pnpm exec prettier` (бере pinned версію `prettier@^3.8.2` з repo, не глобальну).
- НЕ розширюй glob: якщо користувач сказав один файл — формат тільки його.
- НЕ змішуй з lint-фіксами або dep-bump-ами — окремий PR.
- Якщо diff несподівано великий і чіпає файли, які виглядають свідомо вручну вирівняними (ASCII-діаграми, alignment-sensitive таблиці) — додай їх до `.prettierignore` в **окремому** PR замість того, щоб ламати їхнє форматування.

## See also

- [sync-rn-migration-progress.md](sync-rn-migration-progress.md) — частий випадок, коли цей playbook треба відразу після sync-у.
- [`.prettierrc.json`](../../.prettierrc.json), [`.prettierignore`](../../.prettierignore) — конфіг.
- [AGENTS.md](../../AGENTS.md) — rule #5 (commit scope), rule #7 (no `--no-verify`).
