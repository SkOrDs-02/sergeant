-- Phase 0 (monetization rails): простий waitlist для майбутнього Pro-тіру.
-- Жодного billing/entitlements — просто email + tier interest + source, щоб
-- виміряти попит до того, як вкладатись у платіжну інфраструктуру.
-- План: docs/launch/01-monetization-and-pricing.md (тіри Free/Plus/Pro).

CREATE TABLE waitlist_entries (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL,
  tier_interest TEXT NOT NULL CHECK (tier_interest IN ('free', 'plus', 'pro', 'unsure')),
  source        TEXT NOT NULL DEFAULT 'pricing_page',
  locale        TEXT,
  user_id       TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at   TIMESTAMPTZ
);

-- Унікальність по email — case-insensitive (без citext-extension, який не
-- гарантовано увімкнений на Railway). Email нормалізуємо до lower-case
-- у сервісі перед INSERT-ом, але індекс додатково захищає від обходу.
CREATE UNIQUE INDEX waitlist_entries_email_uniq
  ON waitlist_entries (LOWER(email));

-- Для адмін-виборки "останні Х entries" та аналітики розподілу по tier-ах.
CREATE INDEX waitlist_entries_created_at_idx
  ON waitlist_entries (created_at DESC);
CREATE INDEX waitlist_entries_tier_idx
  ON waitlist_entries (tier_interest);
