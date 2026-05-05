# Superpowers

> **Last validated:** 2026-05-05 by Devin. **Next review:** 2026-08-04.
> **Status:** Active

«Superpowers» — high-leverage, single-page guides для cross-cutting capabilities, які зачіпають кілька шарів коду одночасно (sync engine, i18n, RAG memory тощо). Кожен файл під `plans/` — це actionable implementation plan, який агент може взяти і виконати task-by-task; статуси й прогрес трекаються в самому плані.

## Структура

```
docs/superpowers/
├── README.md  ← ви тут
└── plans/     одностайні implementation plans (один файл = один plan)
```

## Активні плани

| План                                                                                               | Capability                                                                | Статус                                                    |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| [`plans/2026-05-06-sync-engine-writer-wiring.md`](./plans/2026-05-06-sync-engine-writer-wiring.md) | Web runtime wiring для Stage 5 sync v2 writer engine (outbox + scheduler) | Active — task list відкритий; виконують агенти або людина |

## Конвенція

- Назва файлу: `YYYY-MM-DD-{kebab-case-capability}.md` (date-prefix = коли план створено).
- Кожен план має чіткий **Goal**, **Architecture**, **Tech stack**, далі — пронумеровані Tasks з checkbox-списком кроків.
- Закриті плани лишаються у `plans/` як historical record; статус-блок зверху файла вказує на завершення.
- Cross-link на трекери (`docs/initiatives/*` або `docs/planning/*`), якщо план — це шматок ширшої ініціативи.

## Як працювати з планами

1. Беремо один файл як SSOT для конкретного pull-request-серії.
2. Помічаємо checkbox-кроки `- [x]` після завершення; PR-описи лінкають назад на крок плану.
3. Для агентського виконання: див. вкладений блок `REQUIRED SUB-SKILL` у конкретному плані.
