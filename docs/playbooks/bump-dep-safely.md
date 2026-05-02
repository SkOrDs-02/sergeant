# Playbook: Bump Dependency Safely

> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
> **Status:** Active

**Trigger:** "Оновити X до версії Y" / Renovate PR з major-bump / security advisory на залежність.

---

## Steps

### 1. Перевірити поточну версію та scope

```bash
# Де саме використовується пакет?
pnpm why <pkg> --recursive

# Яка поточна версія?
grep "<pkg>" pnpm-lock.yaml | head -5
```

### 2. Прочитати CHANGELOG між версіями

Перед оновленням — прочитати CHANGELOG або release notes між поточною та цільовою версією:

- Breaking changes?
- Deprecated API?
- Нові peer dependencies?

### 3. Оновити залежність

```bash
# Оновити в конкретних workspace-ах
pnpm --filter <workspace> up <pkg>@<version>

# Або по всьому монорепо
pnpm up <pkg>@<version> --recursive

# Перевстановити lockfile
pnpm install
```

### 4. Build та тести

```bash
pnpm build       # має пройти
pnpm typecheck   # має пройти
pnpm test        # має пройти
pnpm lint        # має пройти
```

Якщо є breaking changes — виправити код відповідно до migration guide.

### 5. Візуальна перевірка (для UI-залежностей)

Якщо оновлений пакет впливає на UI (React, Tailwind, UI-бібліотека тощо):

- Запустити `pnpm --filter @sergeant/web dev`
- Перевірити ключові сторінки
- Зробити screenshot для PR description

### 6. Створити PR

- Branch: `devin/<unix-ts>-chore-bump-<pkg>`
- Commit: `chore(deps): bump <pkg> from <old> to <new>`
- PR description:
  - Яка залежність оновлена і в яких workspace-ах
  - Breaking changes (якщо є) та як адаптовано
  - Лінк на CHANGELOG / release notes

---

## Verification

- [ ] `pnpm lint` — green
- [ ] `pnpm typecheck` — green
- [ ] `pnpm test` — green
- [ ] `pnpm build` — green
- [ ] Lockfile diff виглядає очікувано (немає неочікуваних transitive змін)
- [ ] Screenshot ключових сторінок (якщо UI-dep)

## Notes

- **Окремий PR** — не змішувати dependency bumps з feature work (AGENTS.md soft rule).
- Renovate автоматично створює PR-и для minor/patch — для major потрібен manual review.
- Перевірити `THIRD_PARTY_LICENSES.md` — може потребувати регенерації (`pnpm licenses:gen`).
- Якщо оновлюється `@types/*` — це зазвичай safe, але все одно `pnpm typecheck`.

## See also

- [AGENTS.md](../../AGENTS.md) — soft rule про dependency bumps
- [renovate-usage.md](../integrations/renovate-usage.md) — як працює Renovate в цьому репо
