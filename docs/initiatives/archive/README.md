# Initiatives — Архів

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-03.
> **Status:** Empty (поки що жодна ініціатива не пройшла 90-денне вікно стабілізації після `Closed`).

Цей каталог тримає **архівовані ініціативи** — файли, що пройшли повний lifecycle `Proposed → In progress → Done → Closed → Archived` та лежали ≥90 днів без регресій / нових follow-up-ів. Архівація — це **фізичний переніс** файлу з `docs/initiatives/<file>.md` сюди, з 1-рядковим redirect-stub-ом у [`../README.md` § Архів](../README.md#архів).

## Чим це не є

- **Не tombstone для Withdrawn-ініціатив.** `Withdrawn` означає «передумови зникли, ніколи не починали реалізувати». Такі файли лишаються в активному списку у `../README.md` зі статусом `Withdrawn` для аудит-сліду; сюди не переносяться.
- **Не source of truth для канонічних правил.** Якщо ініціатива породила Hard Rule / lint-правило / ADR — канонічна копія живе у [`AGENTS.md`](../../../AGENTS.md), [`docs/governance/`](../../governance/) або відповідному ESLint-плагіні. Архівований файл — це **історичний контекст**, а не контракт.

## Як архівувати ініціативу

Покрокова процедура — у [`../README.md` § Гайдлайн → крок 6 (Архівація)](../README.md#гайдлайн-для-авторів). Коротко:

1. Перевірити: статус у файлі = `Closed`, дата переходу у `Closed` ≥ 90 днів тому, у `follow-ups.md` немає нових unchecked-пунктів з цієї ініціативи.
2. `git mv docs/initiatives/<NNNN-slug>.md docs/initiatives/archive/<NNNN-slug>.md`.
3. У `../README.md`: видалити рядок з § Нещодавно завершені, додати 1-рядковий stub у § Архів формату:
   ```
   - [archive/<NNNN-slug>.md](./archive/<NNNN-slug>.md) — archived YYYY-MM-DD; superseded by <посилання на successor / canonical home>.
   ```
4. Перевірити, що канонічні правила (Hard Rules, lint-правила, ADR-и), які ініціатива породила, все ще живі у `AGENTS.md` / `docs/governance/`. Якщо ні — спочатку винести їх туди, тоді архівувати.
5. Запустити `pnpm lint:initiative-status-sync` + `pnpm docs:check-links` локально перед PR-ом. CI-гейт `lint:initiative-status-sync` розуміє Archive-stub-формат і не падає на «row without file».

## Поточний вміст

_Поки порожньо — найстарший `Closed` (0008, 0012, з 2026-05-04) ще у вікні стабілізації (мінімум +90 днів = 2026-08-02)._
