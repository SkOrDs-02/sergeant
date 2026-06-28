# Audience Discovery Kit — готові інструменти дослідження ЦА

> **Last touched:** 2026-06-28 by @claude. **Next review:** 2026-09-26.
> **Status:** Active

> Робочий набір під дизайн із [`../2026-06-28-audience-discovery-trackers.md`](../2026-06-28-audience-discovery-trackers.md).
> Тут — не теорія, а файли, якими працюєш: форма, гайди, трекери, scoreboard.

## Що всередині

| Файл | Для чого | Як юзати |
| --- | --- | --- |
| [`google-form-generator.gs`](./google-form-generator.gs) | згенерувати **живу Google-форму** опитування зі skip-логікою одним запуском | див. § «Шлях A» нижче |
| [`tally-build-spec.md`](./tally-build-spec.md) | зібрати ту саму форму в **Tally** вручну (блок-за-блоком + logic jumps) | див. § «Шлях B» |
| [`interview-runsheet.md`](./interview-runsheet.md) | друкований сценарій інтервʼю з місцем під нотатки | роздрукуй / тримай у вкладці на кожну розмову |
| [`interview-notes-template.md`](./interview-notes-template.md) | шаблон нотаток на одного респондента | копіюй файл під кожне інтервʼю |
| [`recruitment-tracker.csv`](./recruitment-tracker.csv) | вирва рекрутингу: хто, сегмент, статус, канал | імпорт у Sheets / Notion |
| [`interview-tracker.csv`](./interview-tracker.csv) | розклад і статус інтервʼю + сигнал saturation | імпорт у Sheets / Notion |
| [`analysis-affinity-tracker.csv`](./analysis-affinity-tracker.csv) | тегування болів через усі інтервʼю (affinity) | імпорт у Sheets / Notion |
| [`insights-scoreboard.md`](./insights-scoreboard.md) | табло гіпотез H1–H4 + метрики | заповнюєш по ходу, фінальний висновок |

## Воркфлоу від нуля до висновку

```
1. РЕКРУТИНГ      → recruitment-tracker.csv: накидай 15–20 кандидатів по 3 сегментах
2. ІНТЕРВʼЮ (8–12) → interview-runsheet.md (сценарій) + interview-notes-template.md (нотатки)
                     → interview-tracker.csv: статуси + дивись saturation
3. АНАЛІЗ QUAL    → analysis-affinity-tracker.csv: витягни болі/цитати, постав теги
4. ОПИТУВАННЯ     → Шлях A (Google) або Шлях B (Tally), питання з реальної мови інтервʼю
                     → роздай у спільнотах + мережі, ціль n ≥ 50
5. ВИСНОВОК       → insights-scoreboard.md: познач H1–H4, порахуй метрики, 1 сторінка рішень
```

> Порядок жорсткий: **інтервʼю → потім форма**. Варіанти відповідей у формі бери з того,
> що реально казали люди на інтервʼю (крок 3 живить крок 4).

## Шлях A — Google-форма за 2 хвилини (рекомендовано, бо найшвидше до живої форми)

1. Відкрий <https://script.google.com> → **New project**.
2. Видали порожній `myFunction`, встав увесь вміст [`google-form-generator.gs`](./google-form-generator.gs).
3. Зверху обери функцію `buildAudienceSurvey` → натисни **Run**.
4. Перший раз Google попросить дозвіл (Authorize) — підтверди своїм акаунтом.
5. У логах (**View → Logs**) зʼявиться `Edit URL` і `Live URL`. Edit — щоб допиляти, Live — щоб роздавати.

Skip-логіка вже зашита: хто обрав **«Ніколи не вів»** → одразу на контрольну гілку, Q7/Q8 (час до кидання / причина) пропускаються, тож H1/H3 не засмічуються.

## Шлях B — Tally вручну

Tally не має імпорту з файлу, тому збираєш руками за [`tally-build-spec.md`](./tally-build-spec.md):
кожне питання + тип поля + варіанти + куди стрибає logic. Займає ~15 хв, зате гарніший UX і вищий completion.

## Принцип трекерів

CSV-файли — це **стартові схеми**, не дані. Імпортуєш у Google Sheets (`File → Import → Upload`) або
Notion (`Import → CSV`), далі ведеш живими. Перший рядок — заголовки; нижче 1–2 приклади-зразки, які видаляєш.
