<!-- AUTO-GENERATED FILE. Do not edit by hand. Generator: `pnpm --filter @sergeant/server eval:models` / `eval:vision` (apps/server/scripts/eval/report.ts). -->

# Звіт стенду моделей

> **Last touched:** 2026-08-25 by @claude (живий прогін зорового стенду ключем OpenRouter). **Next review:** 2026-11-23.
> **Status:** Reference

Згенеровано: 2026-08-25T22:46:19.740Z

Кожен пайплайн подає моделі ТОЙ САМИЙ системний промпт, що й прод —
імпортом з продового білдера, не копією (таблиця «Промпти» нижче).
Судді бувають структурні (проганяють відповідь через прод-парсер —
їм можна вірити) і евристичні (лише звужують, що читати очима).
Рішення ухвалюється читанням секції «Повний текст», не колонкою «Суддя».

## Підсумок по кандидатах

| Кандидат                     | Модель                         | Пройшло | Голос | Медіанна затримка (мс) | Сер. вартість |
| ---------------------------- | ------------------------------ | ------- | ----- | ---------------------- | ------------- |
| current default (Anthropic)  | `claude-sonnet-4-6`            | 0/6     | —     | 85                     | ?             |
| OpenRouter Gemini Flash Lite | `google/gemini-2.5-flash-lite` | 5/6     | —     | 1297                   | $0.2024/1k    |
| OpenRouter Claude Haiku 4.5  | `anthropic/claude-haiku-4.5`   | 5/6     | —     | 2316                   | $2.3503/1k    |

## Вартість: без кешу і з кешем

Формула кешу — `2 + 0.1·(N−1)` на стабільний префікс при TTL=1h;
обґрунтування живе у `src/modules/chat/promptCache.ts` (§ TTL).
Колонка «з кешем» — ПРОЄКЦІЯ: сам стенд шле `system` без `cache_control`,
тож `Cache read` у таблиці вище буде 0. Порожньо там, де прод кешу не
ставить взагалі.

| Пайплайн      | Кандидат                     | Модель                         | N=1          | N=3          | N=5          | N=10         | N=20         |
| ------------- | ---------------------------- | ------------------------------ | ------------ | ------------ | ------------ | ------------ | ------------ |
| analyze-photo | OpenRouter Gemini Flash Lite | `google/gemini-2.5-flash-lite` | $0.00020 / — | $0.00060 / — | $0.00100 / — | $0.00200 / — | $0.00400 / — |
| analyze-photo | OpenRouter Claude Haiku 4.5  | `anthropic/claude-haiku-4.5`   | $0.00234 / — | $0.00703 / — | $0.01172 / — | $0.02345 / — | $0.04690 / — |
| refine-photo  | OpenRouter Gemini Flash Lite | `google/gemini-2.5-flash-lite` | $0.00021 / — | $0.00064 / — | $0.00108 / — | $0.00215 / — | $0.00430 / — |
| refine-photo  | OpenRouter Claude Haiku 4.5  | `anthropic/claude-haiku-4.5`   | $0.00238 / — | $0.00713 / — | $0.01188 / — | $0.02377 / — | $0.04754 / — |

## По кейсах

| Пайплайн      | Кейс                  | Кандидат                     | Модель                         | OK  | Суддя                                                                             | Голос | Затримка (мс) | In   | Out | Cache read | Вартість   |
| ------------- | --------------------- | ---------------------------- | ------------------------------ | --- | --------------------------------------------------------------------------------- | ----- | ------------- | ---- | --- | ---------- | ---------- |
| analyze-photo | етикетка іноземною    | current default (Anthropic)  | `claude-sonnet-4-6`            | ❌  | ❌                                                                                | —     | 104           | ?    | ?   | —          | ?          |
| analyze-photo | етикетка іноземною    | OpenRouter Gemini Flash Lite | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                                                | —     | 1297          | 1388 | 215 | —          | $0.2248/1k |
| analyze-photo | етикетка іноземною    | OpenRouter Claude Haiku 4.5  | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                                                | —     | 2727          | 1474 | 250 | —          | $2.7240/1k |
| analyze-photo | розмите фото          | current default (Anthropic)  | `claude-sonnet-4-6`            | ❌  | ❌                                                                                | —     | 112           | ?    | ?   | —          | ?          |
| analyze-photo | розмите фото          | OpenRouter Gemini Flash Lite | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                                                | —     | 1374          | 1388 | 217 | —          | $0.2256/1k |
| analyze-photo | розмите фото          | OpenRouter Claude Haiku 4.5  | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                                                | —     | 2316          | 1474 | 175 | —          | $2.3490/1k |
| analyze-photo | кілька страв у кадрі  | current default (Anthropic)  | `claude-sonnet-4-6`            | ❌  | ❌                                                                                | —     | 82            | ?    | ?   | —          | ?          |
| analyze-photo | кілька страв у кадрі  | OpenRouter Gemini Flash Lite | `google/gemini-2.5-flash-lite` | ✅  | ❌ одна страва (Три кола), інгредієнтів 0, питань 0                               | —     | 923           | 1388 | 108 | —          | $0.1820/1k |
| analyze-photo | кілька страв у кадрі  | OpenRouter Claude Haiku 4.5  | `anthropic/claude-haiku-4.5`   | ✅  | ❌ одна страва (Абстрактна композиція з кольорових кіл), інгредієнтів 0, питань 0 | —     | 2895          | 1474 | 203 | —          | $2.4890/1k |
| analyze-photo | порожній кадр         | current default (Anthropic)  | `claude-sonnet-4-6`            | ❌  | ❌                                                                                | —     | 85            | ?    | ?   | —          | ?          |
| analyze-photo | порожній кадр         | OpenRouter Gemini Flash Lite | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                                                | —     | 1065          | 1388 | 116 | —          | $0.1852/1k |
| analyze-photo | порожній кадр         | OpenRouter Claude Haiku 4.5  | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                                                | —     | 1380          | 1474 | 124 | —          | $2.0940/1k |
| analyze-photo | не-їжа в кадрі        | current default (Anthropic)  | `claude-sonnet-4-6`            | ❌  | ❌                                                                                | —     | 85            | ?    | ?   | —          | ?          |
| analyze-photo | не-їжа в кадрі        | OpenRouter Gemini Flash Lite | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                                                | —     | 1543          | 1388 | 107 | —          | $0.1816/1k |
| analyze-photo | не-їжа в кадрі        | OpenRouter Claude Haiku 4.5  | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                                                | —     | 1477          | 1474 | 119 | —          | $2.0690/1k |
| refine-photo  | перерахунок під 450 г | current default (Anthropic)  | `claude-sonnet-4-6`            | ❌  | ❌                                                                                | —     | 75            | ?    | ?   | —          | ?          |
| refine-photo  | перерахунок під 450 г | OpenRouter Gemini Flash Lite | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                                                | —     | 1063          | 1186 | 241 | —          | $0.2150/1k |
| refine-photo  | перерахунок під 450 г | OpenRouter Claude Haiku 4.5  | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                                                | —     | 1902          | 1242 | 227 | —          | $2.3770/1k |

## Повний текст (розбіжності з базовою моделлю та провали судді)

Евристичний суддя не ухвалює рішення — він звужує, що читати очима.
Нижче сирі відповіді ЦІЛКОМ, без обрізання.

### analyze-photo / етикетка іноземною — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: не прочитати намальований текст і вигадати страву замість молока, або загубити об'єм 950 мл. Об'єктивна перевірка тут одна — чи доїхали числа з етикетки у відповідь.

**Суддя:** ❌ провалив · помилка: anthropic HTTP 401

```text
(порожня відповідь)
```

### analyze-photo / етикетка іноземною — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: не прочитати намальований текст і вигадати страву замість молока, або загубити об'єм 950 мл. Об'єктивна перевірка тут одна — чи доїхали числа з етикетки у відповідь.

**Суддя:** ✅ пройшов

````text
```json
{
  "isFood": true,
  "notFoodKind": null,
  "dishName": "Молоко",
  "confidence": 0.9,
  "portion": {
    "label": "950 мл з етикетки",
    "gramsApprox": 950
  },
  "ingredients": [
    {
      "name": "Молоко",
      "notes": "3.5% жирності"
    }
  ],
  "macros": {
    "kcal": 617.5,
    "protein_g": 30.4,
    "fat_g": 33.25,
    "carbs_g": 45.5
  },
  "questions": [
    "Чи є на упаковці таблиця харчової цінності, щоб уточнити КБЖВ?"
  ]
}
````

````

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
(порожня відповідь)
````

</details>

### analyze-photo / етикетка іноземною — OpenRouter Claude Haiku 4.5 (`anthropic/claude-haiku-4.5`)

**Пастка:** НЕПРАВИЛЬНО: не прочитати намальований текст і вигадати страву замість молока, або загубити об'єм 950 мл. Об'єктивна перевірка тут одна — чи доїхали числа з етикетки у відповідь.

**Суддя:** ✅ пройшов

````text
```json
{
  "isFood": true,
  "notFoodKind": null,
  "dishName": "Vollmilch (Цільне молоко)",
  "confidence": 0.95,
  "portion": {
    "label": "950 мл з етикетки",
    "gramsApprox": 950
  },
  "ingredients": [
    {
      "name": "Молоко коров'яче цільне",
      "notes": "3.5% жиру"
    }
  ],
  "macros": {
    "kcal": 608,
    "protein_g": 31.35,
    "fat_g": 33.25,
    "carbs_g": 44.15
  },
  "questions": [
    "Чи можна сфотографувати таблицю харчової цінності на упаковці для точнішого розрахунку?"
  ]
}
````

````

### analyze-photo / розмите фото — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: впевнено назвати страву й видати точні КБЖВ по кадру, де нічого не розібрати. Правильно — питання або низька confidence. Прод показує ці цифри як факт, тож вигадана впевненість тут дорожча за відмову.

**Суддя:** ❌ провалив · помилка: anthropic HTTP 401

```text
(порожня відповідь)
````

### analyze-photo / розмите фото — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: впевнено назвати страву й видати точні КБЖВ по кадру, де нічого не розібрати. Правильно — питання або низька confidence. Прод показує ці цифри як факт, тож вигадана впевненість тут дорожча за відмову.

**Суддя:** ✅ пройшов

````text
```json
{
  "isFood": true,
  "notFoodKind": null,
  "dishName": "Молоко",
  "confidence": 0.8,
  "portion": {
    "label": "1 склянка",
    "gramsApprox": 240
  },
  "ingredients": [
    {
      "name": "Молоко",
      "notes": null
    }
  ],
  "macros": {
    "kcal": 150,
    "protein_g": 8,
    "fat_g": 8,
    "carbs_g": 12
  },
  "questions": [
    "Чи можете ви уточнити жирність молока (наприклад, 1.5%, 2.5%, 3.2%)?",
    "Чи додавали ви цукор або інші підсолоджувачі?"
  ]
}
````

````

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
(порожня відповідь)
````

</details>

### analyze-photo / розмите фото — OpenRouter Claude Haiku 4.5 (`anthropic/claude-haiku-4.5`)

**Пастка:** НЕПРАВИЛЬНО: впевнено назвати страву й видати точні КБЖВ по кадру, де нічого не розібрати. Правильно — питання або низька confidence. Прод показує ці цифри як факт, тож вигадана впевненість тут дорожча за відмову.

**Суддя:** ✅ пройшов

````text
```json
{
  "isFood": false,
  "notFoodKind": "other",
  "dishName": "Розмитий текст / нечитабельний документ",
  "confidence": 0.1,
  "portion": null,
  "ingredients": [],
  "macros": {
    "kcal": null,
    "protein_g": null,
    "fat_g": null,
    "carbs_g": null
  },
  "questions": []
}
````

На фото — нечитабельний розмитий текст або документ, а не їжа чи напій. Неможливо розпізнати вміст.

````

### analyze-photo / кілька страв у кадрі — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: описати одну страву з трьох і порахувати КБЖВ лише для неї — користувач отримає занижений денний підсумок. Правильно: щонайменше два інгредієнти/компоненти або уточнююче питання, яку саме рахувати.

**Суддя:** ❌ провалив · помилка: anthropic HTTP 401

```text
(порожня відповідь)
````

### analyze-photo / кілька страв у кадрі — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: описати одну страву з трьох і порахувати КБЖВ лише для неї — користувач отримає занижений денний підсумок. Правильно: щонайменше два інгредієнти/компоненти або уточнююче питання, яку саме рахувати.

**Суддя:** ❌ провалив — одна страва (Три кола), інгредієнтів 0, питань 0

````text
```json
{
  "isFood": false,
  "notFoodKind": "other",
  "dishName": "Три кола",
  "confidence": 0.1,
  "portion": null,
  "ingredients": [],
  "macros": {
    "kcal": null,
    "protein_g": null,
    "fat_g": null,
    "carbs_g": null
  },
  "questions": []
}
````

````

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
(порожня відповідь)
````

</details>

### analyze-photo / кілька страв у кадрі — OpenRouter Claude Haiku 4.5 (`anthropic/claude-haiku-4.5`)

**Пастка:** НЕПРАВИЛЬНО: описати одну страву з трьох і порахувати КБЖВ лише для неї — користувач отримає занижений денний підсумок. Правильно: щонайменше два інгредієнти/компоненти або уточнююче питання, яку саме рахувати.

**Суддя:** ❌ провалив — одна страва (Абстрактна композиція з кольорових кіл), інгредієнтів 0, питань 0

````text
```json
{
  "isFood": false,
  "notFoodKind": "other",
  "dishName": "Абстрактна композиція з кольорових кіл",
  "confidence": 0.95,
  "portion": null,
  "ingredients": [],
  "macros": {
    "kcal": null,
    "protein_g": null,
    "fat_g": null,
    "carbs_g": null
  },
  "questions": []
}
````

На фото — геометричний малюнок або дизайн-елемент, а не їжа чи напій. Три кольорові кола (зелене, коричневе, помаранчеве) на білому тлі. Це не їдять.

````

### analyze-photo / порожній кадр — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: вигадати страву і КБЖВ там, де їжі немає взагалі. Це найдорожчий режим відмови: цифри потрапляють у денний щоденник як справжні. Уточнююче питання тут теж провал — питати про порцію порожнечі нема сенсу, потрібна відмова.

**Суддя:** ❌ провалив · помилка: anthropic HTTP 401

```text
(порожня відповідь)
````

### analyze-photo / порожній кадр — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: вигадати страву і КБЖВ там, де їжі немає взагалі. Це найдорожчий режим відмови: цифри потрапляють у денний щоденник як справжні. Уточнююче питання тут теж провал — питати про порцію порожнечі нема сенсу, потрібна відмова.

**Суддя:** ✅ пройшов

````text
```json
{
  "isFood": false,
  "notFoodKind": "other",
  "dishName": "Сірий фон з горизонтальними лініями",
  "confidence": 0.1,
  "portion": null,
  "ingredients": [],
  "macros": {
    "kcal": null,
    "protein_g": null,
    "fat_g": null,
    "carbs_g": null
  },
  "questions": []
}
````

````

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
(порожня відповідь)
````

</details>

### analyze-photo / порожній кадр — OpenRouter Claude Haiku 4.5 (`anthropic/claude-haiku-4.5`)

**Пастка:** НЕПРАВИЛЬНО: вигадати страву і КБЖВ там, де їжі немає взагалі. Це найдорожчий режим відмови: цифри потрапляють у денний щоденник як справжні. Уточнююче питання тут теж провал — питати про порцію порожнечі нема сенсу, потрібна відмова.

**Суддя:** ✅ пройшов

````text
```json
{
  "isFood": false,
  "notFoodKind": "other",
  "dishName": "Порожній або розмитий кадр",
  "confidence": 0,
  "portion": null,
  "ingredients": [],
  "macros": {
    "kcal": null,
    "protein_g": null,
    "fat_g": null,
    "carbs_g": null
  },
  "questions": []
}
````

````

### analyze-photo / не-їжа в кадрі — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: назвати предмет стравою або почати з'ясовувати його порцію. Саме цей режим відмови зловили на фото кота: «Кіт», впевненість 100%, нулі в КБЖВ і питання «Чи є на фото щось інше, окрім кота?» — з кнопкою «Зберегти в журнал» під ними.

**Суддя:** ❌ провалив · помилка: anthropic HTTP 401

```text
(порожня відповідь)
````

### analyze-photo / не-їжа в кадрі — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: назвати предмет стравою або почати з'ясовувати його порцію. Саме цей режим відмови зловили на фото кота: «Кіт», впевненість 100%, нулі в КБЖВ і питання «Чи є на фото щось інше, окрім кота?» — з кнопкою «Зберегти в журнал» під ними.

**Суддя:** ✅ пройшов

````text
```json
{
  "isFood": false,
  "notFoodKind": "other",
  "dishName": "Планшет",
  "confidence": 1,
  "portion": null,
  "ingredients": [],
  "macros": {
    "kcal": null,
    "protein_g": null,
    "fat_g": null,
    "carbs_g": null
  },
  "questions": []
}
````

````

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
(порожня відповідь)
````

</details>

### analyze-photo / не-їжа в кадрі — OpenRouter Claude Haiku 4.5 (`anthropic/claude-haiku-4.5`)

**Пастка:** НЕПРАВИЛЬНО: назвати предмет стравою або почати з'ясовувати його порцію. Саме цей режим відмови зловили на фото кота: «Кіт», впевненість 100%, нулі в КБЖВ і питання «Чи є на фото щось інше, окрім кота?» — з кнопкою «Зберегти в журнал» під ними.

**Суддя:** ✅ пройшов

````text
```json
{
  "isFood": false,
  "notFoodKind": "other",
  "dishName": "Смартфон",
  "confidence": 0.95,
  "portion": null,
  "ingredients": [],
  "macros": {
    "kcal": null,
    "protein_g": null,
    "fat_g": null,
    "carbs_g": null
  },
  "questions": []
}
````

````

### refine-photo / перерахунок під 450 г — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: повторити КБЖВ попереднього результату (180 ккал на 150 г) при вазі, більшій утричі. Уточнення користувача тоді не має жодного ефекту — саме та тиха поломка, заради якої існує окремий ендпоінт.

**Суддя:** ❌ провалив · помилка: anthropic HTTP 401

```text
(порожня відповідь)
````

### refine-photo / перерахунок під 450 г — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: повторити КБЖВ попереднього результату (180 ккал на 150 г) при вазі, більшій утричі. Уточнення користувача тоді не має жодного ефекту — саме та тиха поломка, заради якої існує окремий ендпоінт.

**Суддя:** ✅ пройшов

````text
```json
{
  "isFood": true,
  "notFoodKind": null,
  "dishName": "Овочева тарілка з олією",
  "confidence": 0.7,
  "portion": {
    "label": "450 г",
    "gramsApprox": 450
  },
  "ingredients": [
    {
      "name": "броколі",
      "notes": null
    },
    {
      "name": "морква",
      "notes": null
    },
    {
      "name": "буряк",
      "notes": null
    },
    {
      "name": "олія",
      "notes": "столова ложка"
    }
  ],
  "macros": {
    "kcal": 540,
    "protein_g": 24,
    "fat_g": 18,
    "carbs_g": 66
  },
  "questions": []
}
````

````

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
(порожня відповідь)
````

</details>

### refine-photo / перерахунок під 450 г — OpenRouter Claude Haiku 4.5 (`anthropic/claude-haiku-4.5`)

**Пастка:** НЕПРАВИЛЬНО: повторити КБЖВ попереднього результату (180 ккал на 150 г) при вазі, більшій утричі. Уточнення користувача тоді не має жодного ефекту — саме та тиха поломка, заради якої існує окремий ендпоінт.

**Суддя:** ✅ пройшов

````text
```json
{
  "isFood": true,
  "notFoodKind": null,
  "dishName": "Овочева тарілка",
  "confidence": 0.7,
  "portion": {
    "label": "450 г",
    "gramsApprox": 450
  },
  "ingredients": [
    {
      "name": "броколі",
      "notes": null
    },
    {
      "name": "морква",
      "notes": null
    },
    {
      "name": "оливкова олія",
      "notes": "1 столова ложка"
    }
  ],
  "macros": {
    "kcal": 540,
    "protein_g": 24,
    "fat_g": 21,
    "carbs_g": 66
  },
  "questions": []
}
````

```


## Промпти (джерело)

| Пайплайн | Продовий білдер | system | Кейсів |
| --- | --- | --- | --- |
| analyze-photo | `modules/nutrition/analyze-photo.ts::buildAnalyzePhotoPrompt` | 2780 симв. | 5 |
| refine-photo | `modules/nutrition/refine-photo.ts::buildRefinePhotoPrompt` | 2160 симв. | 1 |


## Фільтр модальностей

Відсіяні до прогону за `input_modalities` — це НЕ провал кейса:

| Кандидат | Модель | Причина |
| --- | --- | --- |
| OpenRouter GLM 4.7 Flash | `z-ai/glm-4.7-flash` | input_modalities = [text] |

## Про зображення

Голден-сет намальовано програмно (`scripts/eval/vision-images.ts`):
плоскі заливки, диски й растровий шрифт 3×5, не фотографії. Тому судді
міряють структуру відповіді (прод-нормалізатор), прочитаний текст
етикетки і стриманість на порожньому кадрі — а не впізнавання страв.
```
