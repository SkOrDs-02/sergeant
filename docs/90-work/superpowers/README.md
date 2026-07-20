# Superpowers

> **Last validated:** 2026-07-20 by @cursoragent (post fast-forward archive). **Next review:** 2026-10-18.
> **Status:** Active

«Superpowers» — high-leverage, single-page guides для cross-cutting capabilities, які зачіпають кілька шарів коду одночасно (sync engine, i18n, RAG memory тощо). Кожен файл під `plans/` — actionable implementation plan; після `Closed`/`Done` план переїжджає у `plans/archive/`.

## Структура

```
docs/90-work/superpowers/
├── README.md  ← ви тут
└── plans/
    └── archive/     завершені implementation plans
```

## Активні плани

_Жодного відкритого плану_ (`open-work.md` § Superpowers = 0).

## Архів

| План                                                                                                             | Capability                                                                | Статус                      |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------- |
| [`plans/archive/2026-05-06-sync-engine-writer-wiring.md`](plans/archive/2026-05-06-sync-engine-writer-wiring.md) | Web runtime wiring для Stage 5 sync v2 writer engine (outbox + scheduler) | Archived (Batch 2026-07-20) |

## Конвенція

- Назва файлу: `YYYY-MM-DD-{kebab-case-capability}.md` (date-prefix = коли план створено).
- Кожен план має чіткий **Goal**, **Architecture**, **Tech stack**, далі — пронумеровані Tasks з checkbox-списком кроків.
- Новий план кладеться у `plans/`; після `Closed`/`Done` — `git mv` у `plans/archive/` + оновити inbound-лінки.
- Cross-link на трекери (`docs/90-work/initiatives/*` або `docs/90-work/planning/*`), якщо план — шматок ширшої ініціативи.

## Як працювати з планами

1. Беремо один файл як SSOT для конкретного pull-request-серії.
2. Помічаємо checkbox-кроки `- [x]` після завершення; PR-описи лінкають назад на крок плану.
3. Для агентського виконання: див. вкладений блок `REQUIRED SUB-SKILL` у конкретному плані.
