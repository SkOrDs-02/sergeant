<!-- AUTO-GENERATED: false — authored playbook -->

# Playbook: Cleanup Codex branch after PR

> **Last validated:** 2026-05-18 by @codex. **Next review:** 2026-08-16.
> **Status:** Active

**Trigger:** PR merged / "онови main" / "видали гілку" / "поверни local dirty files" після Codex-гілки.

## Prerequisites

1. PR уже merged або гілка більше не потрібна.
2. Поточний worktree може мати user/Codex-local dirty files; їх треба зберегти.
3. Не використовуй `git reset --hard`.

## Кроки

1. Перевір стан: `git status --short --branch`.
2. Якщо є staged/unstaged/untracked зміни — створи named stash з untracked:
   `git stash push -u -m "codex/preserve-local-dirty-before-main-refresh-YYYY-MM-DD"`.
3. Онови remote refs: `git fetch origin`.
4. Перемкнись на main: `git switch main`.
5. Онови local main: `git rebase origin/main`.
6. Поверни локальні зміни: `git stash pop`.
7. Видали робочу гілку локально: `git branch -D <branch>`.
8. Спробуй видалити remote-гілку: `git push origin --delete <branch>`. Якщо GitHub каже `remote ref does not exist`, це нормально після merge auto-delete.
9. Почисти stale remote refs: `git fetch --prune origin`.
10. Фінальна перевірка: `git status --short --branch` і `git branch --list <branch>; git branch -r --list origin/<branch>`.

## Owner surface

- Primary surface: git workspace hygiene
- Coupled surface: `.codex/` local runtime state
- Governing skill: `sergeant-review-and-merge`

## Verification

- [ ] `main` показує `## main...origin/main` без ahead/behind.
- [ ] Робоча гілка не існує локально.
- [ ] `origin/<branch>` не існує після prune.
- [ ] Dirty files, які були до cleanup, повернулися після stash pop.

## Коли НЕ використовувати

- Коли PR ще не merged і гілка ще потрібна для review.
- Коли dirty files мають бути закомічені в цю ж гілку, а не перенесені на `main`.
- Коли rebase має конфлікти, які потребують продуктового рішення.

## Governing skill

[`sergeant-review-and-merge`](../../.agents/skills/sergeant-review-and-merge/SKILL.md)
