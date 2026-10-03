#!/usr/bin/env bash
# security.txt expiry guard — closes hardening card I4
# (картка архівована, локального файлу немає — https://github.com/Skords-01/Sergeant/blob/d1a37e0bed4e403477376eae9ee9a078e4179da8/docs/04-governance/security/hardening/archive/I4-security-txt.md).
#
# RFC 9116 вимагає, щоб поле `Expires:` у `/.well-known/security.txt` було
# валідним ISO 8601 timestamp у майбутньому. Якщо `Expires` минув, дослідники
# вважають файл «протермінованим» і можуть **не** репортити вразливість.
#
# Перевіряє ОБИДВА файли: вебзастосунок (`app.sergeant.com.ua`) і лендинг
# (`sergeant.com.ua`) віддають власні копії.
#   - <60 днів до expiry — `::warning::` (CI лишається зеленим, але в
#     анотаціях з'являється нагадування);
#   - <30 днів — `::error::` і exit 1, щоб у команди був місяць буфера.
#
# Як оновити security.txt:
#   1. Update apps/web/public/.well-known/security.txt і
#      apps/landing/public/.well-known/security.txt → set new Expires
#      (RFC 9116 рекомендує <=12 місяців у майбутнє).
#   2. Опціонально: signed з PGP-key (поле Encryption: <key URL>).
#   3. Перевірка локально: `bash scripts/check-security-txt-expiry.sh`.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

files=(
  "apps/web/public/.well-known/security.txt"
  "apps/landing/public/.well-known/security.txt"
)

warn_days=60
error_days=30
failed=0

for rel in "${files[@]}"; do
  file="$repo_root/$rel"

  if [[ ! -f "$file" ]]; then
    echo "::error::security.txt missing at $rel"
    echo "RFC 9116 expects /.well-known/security.txt to be served on production."
    echo "Rationale — archived hardening card I4: https://github.com/Skords-01/Sergeant/blob/d1a37e0bed4e403477376eae9ee9a078e4179da8/docs/04-governance/security/hardening/archive/I4-security-txt.md"
    failed=1
    continue
  fi

  # Витягуємо першу `Expires:` стрічку (case-sensitive — RFC 9116 визначає
  # заголовки case-insensitive, але всі реальні приклади у RFC capitalized;
  # тримаємось такого ж стилю для людської читабельності).
  expires_raw=$(grep -m1 -E '^Expires:' "$file" | sed -E 's/^Expires:[[:space:]]*//' | tr -d '\r' || true)

  if [[ -z "$expires_raw" ]]; then
    echo "::error::$rel is missing the Expires field (RFC 9116 §2.5.5)."
    echo "Add a line like: Expires: 2027-09-30T23:59:59Z"
    failed=1
    continue
  fi

  # `date -d` приймає ISO 8601 з Z або +00:00. Якщо парсинг впаде — RFC-violation.
  if ! expires_epoch=$(date -d "$expires_raw" +%s 2>/dev/null); then
    echo "::error::$rel has invalid Expires value: $expires_raw"
    echo "RFC 9116 §2.5.5 requires ISO 8601 (e.g. 2027-09-30T23:59:59Z)."
    failed=1
    continue
  fi

  now_epoch=$(date -u +%s)
  seconds_until_expiry=$((expires_epoch - now_epoch))
  days_until_expiry=$((seconds_until_expiry / 86400))

  if (( seconds_until_expiry <= 0 )); then
    echo "::error::$rel Expires date ($expires_raw) is in the past."
    echo "RFC 9116 §2.5.5: researchers may treat the file as void."
    echo "Refresh $rel and bump Expires."
    failed=1
    continue
  fi

  if (( days_until_expiry < error_days )); then
    echo "::error::$rel expires in ${days_until_expiry} day(s) (<${error_days})."
    echo "Refresh $rel before it goes stale."
    echo "RFC 9116 §2.5.5; archived hardening card I4: https://github.com/Skords-01/Sergeant/blob/d1a37e0bed4e403477376eae9ee9a078e4179da8/docs/04-governance/security/hardening/archive/I4-security-txt.md"
    failed=1
    continue
  fi

  if (( days_until_expiry < warn_days )); then
    echo "::warning::$rel expires in ${days_until_expiry} day(s) (<${warn_days}). Bump Expires before CI turns red at ${error_days} days."
  fi

  echo "security.txt: OK $rel (expires in ${days_until_expiry} day(s), at $expires_raw)"
done

exit "$failed"
