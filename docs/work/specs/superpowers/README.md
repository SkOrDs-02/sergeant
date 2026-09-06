# Superpowers

> **Last validated:** 2026-09-06 by Codex. **Next review:** 2027-09-06.
> **Status:** Active

«Superpowers» — legacy compatibility-вхід для high-leverage планів. Нові
cross-cutting capabilities оформлюються як спеки; завершені implementation
plans доступні через immutable Git history.

## Структура

```
docs/work/specs/superpowers/
└── README.md  ← ви тут
```

## Активні плани

_Жодного відкритого плану_ (`open-work.md` § Superpowers = 0).

## Архів

| План                                                                                                                                                                                                          | Capability                                                                | Статус                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------- |
| [2026-05-06-sync-engine-writer-wiring.md](https://github.com/Skords-01/Sergeant/blob/d1a37e0bed4e403477376eae9ee9a078e4179da8/docs/90-work/superpowers/plans/archive/2026-05-06-sync-engine-writer-wiring.md) | Web runtime wiring для Stage 5 sync v2 writer engine (outbox + scheduler) | Historical Git snapshot |

## Конвенція

- Назва файлу: `YYYY-MM-DD-{kebab-case-capability}.md` (date-prefix = коли план створено).
- Кожен план має чіткий **Goal**, **Architecture**, **Tech stack**, далі — пронумеровані Tasks з checkbox-списком кроків.
- Новий план окремого жанру не створюємо: використовуй `docs/work/specs/`.
- Cross-link на трекери (`docs/work/specs/initiatives/*` або `docs/work/specs/planning/*`), якщо план — шматок ширшої ініціативи.

## Як працювати з планами

1. Беремо один файл як SSOT для конкретного pull-request-серії.
2. Помічаємо checkbox-кроки `- [x]` після завершення; PR-описи лінкають назад на крок плану.
3. Для агентського виконання: див. вкладений блок `REQUIRED SUB-SKILL` у конкретному плані.
