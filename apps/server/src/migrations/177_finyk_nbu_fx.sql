-- 177: офіційний курс НБУ для операцій валютних карток Monobank.
--
-- Спека: docs/work/specs/finyk-fx-nbu.md. Рішення власника 2026-11-25:
-- операції валютних рахунків входять у статистику Фініка в гривневому
-- еквіваленті за курсом НБУ на київську дату операції.
--
-- `nbu_fx_rate` - кеш курсів, спільний для всіх користувачів (курс
-- публічний, персональних даних тут немає). Курс на минулу дату не
-- змінюється, тож рядок пишеться раз і не перезаписується (ADR-0079,
-- минуле заморожене). `source_date` - дата, на яку НБУ реально віддав
-- курс: при порожній відповіді на `rate_date` береться найближча
-- попередня дата.
CREATE TABLE IF NOT EXISTS nbu_fx_rate (
  currency_code SMALLINT NOT NULL,
  rate_date DATE NOT NULL,
  uah_per_unit NUMERIC(18, 6) NOT NULL CHECK (uah_per_unit > 0),
  source_date DATE NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (currency_code, rate_date)
);

COMMENT ON TABLE nbu_fx_rate IS
  'Офіційний курс НБУ (гривень за одиницю валюти) на дату. Пишеться раз, не перезаписується. Спека finyk-fx-nbu.md.';

-- Гривнева сума операції не-гривневого рахунку в копійках. NULL для
-- гривневих рахунків (гривнева сума = amount) і для валютних операцій,
-- курсу до яких ще немає: такі рядки не входять у підсумки, доки читання
-- `/api/mono/transactions` не добере курс. Лише ADD без DEFAULT: метадані,
-- без переписування таблиці.
ALTER TABLE mono_transaction
  ADD COLUMN IF NOT EXISTS amount_uah BIGINT;

COMMENT ON COLUMN mono_transaction.amount_uah IS
  'Гривнева сума (копійки) операції не-гривневого рахунку за курсом НБУ на київську дату операції; для операції в гривні - operation_amount. NULL: рахунок гривневий або курсу ще немає.';
