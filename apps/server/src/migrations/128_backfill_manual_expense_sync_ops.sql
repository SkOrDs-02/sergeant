-- 128: backfill `sync_op_log` для server-created ручних витрат, які
-- ніколи не доїхали на пристрої.
--
-- Проблема (звіт власника 2026-08-28). Імпорт виписки створює
-- `finyk_manual_expenses` прямим SQL INSERT-ом
-- (`modules/finyk/import/commit.ts`), а `syncV2Pull` читає ВИКЛЮЧНО
-- `sync_op_log` (`modules/sync/syncV2.ts`) — тож такий рядок не міг
-- доїхати ЖОДНИМ pull-ом. Єдиним каналом лишався клієнтський
-- write-through, і він вимикався цілком, щойно в батчі траплявся бодай
-- один пропущений рядок. Наслідок: імпорт «спрацював», повторне
-- завантаження того самого файлу чесно казало «схоже, вони вже є»
-- (превʼю дедупу дивиться саме в цю таблицю), а на сторінці «Операції»
-- рядків не було НІКОЛИ.
--
-- Код уже виправлено: commit тепер сам емітить оп на кожен живий рядок
-- (`modules/finyk/import/syncOps.ts` + `modules/sync/serverOpLog.ts`).
-- Але це лікує лише МАЙБУТНІ імпорти — рядки, що вже лежать у базі,
-- лишились би невидимими назавжди. Розраховувати на «просто заімпортуй
-- файл ще раз» не можна: превʼю позначає такі рядки як дублі і ЗНІМАЄ з
-- них галочку, тобто самолікування вимагало б від людини свідомо
-- вибрати рядки, які застосунок щойно назвав зайвими. Звідси цей
-- одноразовий backfill.
--
-- Критерій відбору — «живий рядок, про який оп-лог нічого не знає», а не
-- «рядок з import_batches»:
--
--   * рядки, які створив КЛІЄНТ (звичайне ручне додавання, demo-seed),
--     уже мають свій оп — його написав їхній же push, тож вони під умову
--     не потрапляють і зайвого трафіку не створюють;
--   * рядки, які створив СЕРВЕР, опа не мають — і це рівно ті, що
--     невидимі. Крім імпорту, так само народжується чековий
--     manual-expense fallback (`modules/finyk/receipts/save.ts`), який
--     страждає від тієї самої дірки; звужувати вибірку до імпорту
--     означало б свідомо лишити невилікуваними рядки того самого класу.
--
-- Tombstone-рядки (`deleted_at IS NOT NULL`) свідомо ПОЗА вибіркою:
-- відправити на пристрій видалене гірше, ніж не відправити нічого.
--
-- `client_ts` — це `updated_at` САМОГО рядка, не час міграції: клієнт
-- застосовує оп через per-row LWW (`applyPullOp.ts`), тож із «зараз»
-- backfill перекрив би свіжішу локальну правку. З фактичним `updated_at`
-- оп програє локальній версії там, де вона новіша, і виграє там, де
-- локально порожньо, — тобто рівно там, де й треба.
--
-- `origin_device_id = NULL` — оп бачать УСІ пристрої (pull відсіює лише
-- збіг із власним device id; міграція 027 прямо передбачає цей випадок:
-- «NULL is legal … server-side replays»).
--
-- Ключ ідемпотентності `srvbf1:<md5(id)>` — `md5()` core-функція, без
-- pgcrypto; префікс розводить backfill-опи від рантаймових
-- (`srvimp:<batchId>:…`, `syncOps.ts`), а `ON CONFLICT DO NOTHING`
-- робить повторний прогін no-op.
--
-- Data-only: жодного ALTER, жодного DROP.

INSERT INTO sync_op_log
  (user_id, idempotency_key, table_name, op, row, client_ts,
   origin_device_id, status, reject_reason)
SELECT
  e.user_id,
  'srvbf1:' || md5(e.id),
  'finyk_manual_expenses',
  'insert',
  jsonb_build_object(
    'id', e.id,
    'user_id', e.user_id,
    'data_json', e.data_json,
    'created_at', to_char(
      e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'updated_at', to_char(
      e.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'deleted_at', NULL
  ),
  e.updated_at,
  NULL,
  'applied',
  NULL
FROM finyk_manual_expenses e
WHERE e.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
      FROM sync_op_log l
     WHERE l.user_id = e.user_id
       AND l.table_name = 'finyk_manual_expenses'
       AND l.row->>'id' = e.id
  )
ON CONFLICT (user_id, idempotency_key) DO NOTHING;
