# SPEC: Сканування чеків — QR/ДПС + vision, автовитрата з позиціями

> **Last validated:** 2026-08-01 by @claude (spec-інтервʼю з founder-ом, brainstorming-сесія). **Next review:** 2027-11-20.
> **Status:** Active — дизайн затверджено founder-ом 2026-08-01; відкритий гейт: токен публічної частини ДПС (§ Ризики)

## Проблема

Готівкові та «чужокарткові» покупки не потрапляють у finyk автоматично — їх
треба вбивати руками через ManualExpenseSheet. А для карткових покупок
mono-webhook дає лише одну суму «Сільпо −847.50» без розшифровки, що саме
куплено. Чек з магазину — єдиний артефакт, який містить і суму, і позиції,
але сьогодні finyk його ніяк не вміє прийняти. Спека
[silpo-mcp-integration.md](./silpo-mcp-integration.md) закриває це лише для
Сільпо; ця спека — для чеків з **будь-якого** магазину.

## Мета

Користувач у web/PWA натискає «Сканувати чек», наводить камеру на QR
фіскального чека (або фоткає чек без QR) — і за кілька секунд бачить
чернетку витрати з магазином, сумою, датою і списком позицій. Після
підтвердження: якщо знайдено відповідну mono-транзакцію — чек лінкується до
неї (без дубля), якщо ні — створюється manual expense. Транзакція з чеком
розгортається у список покупок.

## Рішення дизайну

Зафіксовані founder-ом на інтервʼю 2026-08-01:

- **QR first, vision fallback — обидва в v1.** Основний шлях: QR фіскального
  чека → офіційний API ДПС → точні структуровані позиції, $0/чек. Fallback
  (нема QR, ДПС лежить/лаг, нефіскальний чек): фото → vision-LLM.
  Відкинуто «тільки vision» (дорожче, точність цін не гарантована) і
  «тільки QR» (базари, закордон, пошкоджені чеки випадають).
- **Vision через OpenRouter + `google/gemini-2.5-flash-lite`.** OpenRouter
  уже вшитий в apps/server (env `OPENROUTER_API_KEY`, per-домен провайдери),
  Flash-Lite — уже дефолт для nutrition/mono; ціна ~$0.0004/чек. Відкинуто
  Anthropic-direct (Haiku ~10× дорожчий, хоч і теж копійки) — але патерн
  валідації зображення береться з `analyze-photo.ts`.
- **Токен ДПС — один, серверний, founder-а.** API публічної частини
  (`/ws/api_public/rro/chkAll`) авторизується персональним токеном з
  Електронного кабінету (вкладка «Токени публічної частини», вхід з КЕП).
  Дані чека публічні, тож користувачам свої кабінети не потрібні. Ліміт
  1000 запитів/добу на токен; кожен чек тягнеться один раз і зберігається
  (природний кеш). Відкинуто per-user токени — зайвий онбординг-барʼєр.
- **Поверхня v1 — web/PWA.** Кнопка «Сканувати чек» поруч із «+ Витрата»
  на сторінці транзакцій finyk. Камера через getUserMedia + zxing
  (переюз патерну `useBarcodeScanner.ts` з nutrition, QR-режим) + file
  upload як альтернатива. Mobile (Expo) — пізніше, патерн капчура вже є в
  `pickImageJpegForNutritionApi.ts`. Відкинуто «mobile first» — акцент
  продукту зараз на web/PWA.
- **Позиції зберігаються + розгортка.** Транзакція з чеком розгортається у
  список покупок. БЕЗ пер-позиційної категоризації/TxSplit у v1 (це етапи
  C/D silpo-спеки). Відкинуто «лише сума+магазин» — парсинг покупок і є
  головна цінність.
- **Дедуп — matcher як у silpo-спеці.** Чек спершу шукає mono-транзакцію
  (сума + дата ±1 доба Kyiv; `mono_transaction.receipt_id` — сильний лінк).
  Знайшов → лінк без нової витрати. Не знайшов → manual expense.
  Unmatched-чек — першокласний стан, не помилка (платник ≠ покупець,
  готівка, інший банк). Matcher **ніколи не видаляє і не зливає** дані.
- **Review-екран обовʼязковий.** Патерн усіх конкурентів (Expensify, Zoho,
  Easy Expense): скан → редагована чернетка → підтвердження. Нічого не
  зберігається без явного «Зберегти» користувача.

## Архітектура

### Флоу v1

```
[Кнопка «Сканувати чек»]
  → камера getUserMedia + zxing (QR-режим) АБО file upload
  ├─ QR прочитано → клієнт парсить URL виду
  │    https://cabinet.tax.gov.ua/cashregs/check?id=..&date=..&time=..&fn=..&sm=..
  │    → POST /api/finyk/receipts/lookup {fn, id, date, time, sm}
  │    → сервер GET https://cabinet.tax.gov.ua/ws/api_public/rro/chkAll
  │         ?id=..&fn=..&date=..&type=1 (оригінальний XML) + token
  │    → парсинг XML: магазин (назва, адреса, ЄДРПОУ), дата/час, сума,
  │      позиції {назва, кількість, ціна, сума}
  ├─ QR нема / не читається / ДПС недоступна → користувачу пропонується фото
  │    → POST /api/finyk/receipts/analyze {image_base64, mime_type}
  │    → валідація magic-bytes (переюз validateImageBase64, 5MB cap)
  │    → OpenRouter chat/completions, model gemini-2.5-flash-lite,
  │      image_url (data URI) + промпт «поверни JSON {store, date, total,
  │      items[]}» (укр. системний промпт, патерн analyze-photo.ts)
  └─ Обидва шляхи → response draft → review-екран (магазин, сума, дата,
       категорія (одна на чек), позиції — усе редаговане)
     → «Зберегти» → POST /api/finyk/receipts
       → matcher: mono-транзакція (сума ±0, дата ±1 доба Kyiv)?
         ├─ так → створити receipt + items + tx_receipt_link (mono)
         └─ ні  → створити receipt + items + manual expense + link (manual)
```

- QR-скан → ДПС-лаг: чек може зʼявитись у реєстрі не миттєво. Відповідь
  404/порожня від chkAll → повідомлення «Чек ще не зʼявився в реєстрі ДПС —
  спробуй за кілька хвилин або сфоткай чек» (обидві опції на екрані).
- vision-результат позначається `source: 'vision'` і на review-екрані
  показується бейдж «розпізнано з фото — перевір суми».

### Модель даних

Узагальнення таблиць silpo-спеки (координація: якщо silpo-етап уже створив
`silpo_receipts` — розширити ту міграцію, НЕ створювати паралельну сімʼю;
якщо ні — ця спека створює спільні таблиці, а silpo пише в них же):

- `receipts` — id, user_id, source (`dps` | `vision` | `silpo`),
  fiscal_num (nullable), store_name, store_tax_id (nullable),
  purchased_at (timestamptz), total_kopiykas (bigint → **coerce до number
  у серіалізаторі**, Hard Rule #1), raw_payload JSONB (XML/JSON з джерела).
  Unique: `(user_id, source, fiscal_num)` де fiscal_num не null —
  повторний скан того самого чека = ідемпотентний no-op.
- `receipt_items` — id, receipt_id FK, position, name, qty (numeric),
  price_kopiykas, sum_kopiykas.
- `finyk_tx_receipt_links` — receipt_id, tx_kind (`mono` | `manual`),
  tx_ref (mono_tx_id або ext_id manual expense), unique на receipt_id.

Міграція — наступний вільний номер у `apps/server/src/migrations/`,
послідовно, без пропусків (Hard Rule #4).

### API-контракт

Три ендпоінти в `apps/server/src/routes/finyk.ts` + модуль
`apps/server/src/modules/finyk/receipts/`:

- `POST /api/finyk/receipts/lookup` — {fn, id, date, time, sm} → draft
  (без запису в БД).
- `POST /api/finyk/receipts/analyze` — {image_base64, mime_type} → draft
  (без запису в БД).
- `POST /api/finyk/receipts` — draft (відредагований) → зберігає receipt +
  items + link/expense, повертає створене.
- `GET /api/finyk/receipts/:id` — чек з позиціями для розгортки транзакції.

Суми через API — **kopiykas як number** (домен-інваріант). Типи
відповідей дзеркаляться у `packages/api-client` + `.contract.test.ts`
(Hard Rule #3, триплет рухається разом).

### Web UI

- `apps/web/src/modules/finyk/components/ReceiptScanSheet.tsx` — сканер
  (zxing QR через переюз/узагальнення `useBarcodeScanner`-патерну; кнопка
  «Завантажити фото»; стани: сканую / lookup / analyze / review / помилка).
- Review-екран: редаговані поля, категорія — дропдаун (рішення founder-а
  2026-07-24: категорії — дропдаун, не чипи), позиції списком.
- Розгортка: у списку транзакцій рядок з привʼязаним чеком отримує
  індикатор і expand до `receipt_items`.
- RQ-ключі — ТІЛЬКИ через `finykKeys` у
  `apps/web/src/shared/lib/api/queryKeys.ts` (Hard Rule #2). Нові ключі:
  `finykKeys.receipt(id)`, інвалідація транзакційних ключів після save.
- Touch targets ≥44px, тексти укр. за style-guide
  (`docs/01-product/copy/style-guide.uk.md`).

### Env

- `DPS_API_TOKEN` (новий) — Coolify env; без нього lookup-шлях відповідає
  503 з повідомленням, vision-шлях працює.
- OpenRouter — наявні `OPENROUTER_API_KEY`; нова пара
  `LLM_RECEIPT_PROVIDER` (default `openrouter`) +
  `OPENROUTER_RECEIPT_MODEL` (default `google/gemini-2.5-flash-lite`),
  за патерном інших доменів у `env.ts`.
- Логи: НЕ логувати image_base64 і сирий XML з ПІБ/адресами понад
  redaction-політику pino (Hard Rule #21).

## Вартість (довідково, розрахунок 2026-08-01)

QR/ДПС-шлях — $0. Vision (~1800 ткн вхід + ~600 вихід на чек):
Flash-Lite ≈ $0.0004/чек ($0.42 на 1000 чеків/міс); Haiku 4.5 ≈ $0.005/чек.
Бюджет-гейт не потрібен на поточному масштабі.

## Поверхня змін

- `apps/server/src/migrations/NNN_receipts.sql` — нові таблиці.
- `apps/server/src/modules/finyk/receipts/` — lookup (ДПС-клієнт +
  XML-парсер), analyze (vision), save (matcher + create), серіалізатори.
- `apps/server/src/routes/finyk.ts`, `apps/server/src/http/schemas.ts`.
- `apps/server/src/env/env.ts` — DPS_API_TOKEN, LLM_RECEIPT_*.
- `packages/api-client` — типи + contract-тест.
- `packages/db-schema` — типи нових таблиць.
- `apps/web/src/modules/finyk/` — ReceiptScanSheet, review, розгортка,
  ключі в `queryKeys.ts`.
- Канон `docs/01-product/model/finyk.md` — оновити в тому ж PR (Hard
  Rule #15 / правило канону).
- Owner-скіли: `sergeant-feature-delivery` (первинний),
  `sergeant-server-api` + `sergeant-web-ui` по поверхнях,
  `sergeant-data-and-migrations` для міграції.

## Поза скоупом v1

- Пер-позиційна категоризація і TxSplit (етапи C/D silpo-спеки).
- Звʼязка позицій чека з nutrition/коморою (силпо-спека, етап E).
- Mobile (Expo) капчур — фаза 2; патерн готовий у
  `pickImageJpegForNutritionApi.ts`.
- Автоматичне підтягування чеків за `mono_transaction.receipt_id` без
  сканування (окрема поставка; сильний кандидат на наступний крок).
- Batch-скан кількох чеків поспіль; історія «моїх чеків» як окремий екран.

## Верифікація (обовʼязково)

1. `pnpm check` зелений; `pnpm --filter @sergeant/web test`,
   `pnpm --filter @sergeant/server test`.
2. Unit: XML-парсер ДПС на 2–3 збережених фікстурах реальних чеків
   (різні РРО/ПРРО); matcher (match / unmatch / ідемпотентний повторний
   скан); vision-промпт — контракт-тест схеми JSON-відповіді.
3. Click-through (dev server, справжній чек із супермаркета):
   «Сканувати чек» → QR → draft з позиціями ≤5с → редагування категорії →
   «Зберегти» → витрата зʼявилась у списку → expand показує позиції →
   повторний скан того ж чека НЕ створює дубль.
4. Vision-шлях: фото чека без QR → draft з бейджем «з фото» → save.
5. Дедуп: скан чека за карткову покупку з mono-транзакцією в базі →
   лінк до неї, manual expense НЕ створено.
6. UI — скриншот у PR.

## Ризики та відкриті питання

- **[ГЕЙТ] Токен ДПС.** Founder генерує токен у кабінеті (КЕП) і кладе в
  env. Перший крок реалізації — smoke-тест chkAll на реальному чеку;
  якщо API поводиться інакше, ніж задокументовано (формат XML, ліміти) —
  повернутись до спеки. До токена вся ДПС-гілка блокована, vision — ні.
- XML-схема чека РРО vs ПРРО може відрізнятись — закривається фікстурами
  з різних магазинів на кроці smoke-тесту.
- Лаг появи чека в реєстрі ДПС — UX уже передбачає «спробуй пізніше або
  сфоткай»; якщо лаг систематично >хвилин — підняти пріоритет
  vision-шляху в UI.
- Ліміт 1000/добу спільний на всіх користувачів — моніторити після бети;
  мітигація: другий токен, черга, кеш уже є by design.
- zxing і `BarcodeDetector` читають QR добре, але живий чек буває мʼятий —
  якщо скан-UX слабкий, розглянути `jsQR`/збільшення роздільності
  getUserMedia (рішення на click-through, не зараз).
- Приватність: чек містить адресу магазину і назви покупок — покриття
  формулюванням приватності узгодити з відкритим гейтом silpo-спеки
  (finyk §6.4), однією редакцією на обидві фічі.
