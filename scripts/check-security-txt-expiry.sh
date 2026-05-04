#!/usr/bin/env bash
# security.txt expiry guard — closes hardening card I4
# (docs/security/hardening/I4-security-txt.md).
#
# RFC 9116 вимагає, щоб поле `Expires:` у `/.well-known/security.txt` було
# валідним ISO 8601 timestamp у майбутньому. Якщо `Expires` минув, дослідники
# вважають файл «протермінованим» і можуть **не** репортити вразливість.
# Цей guard падає у CI, якщо до expiry-дати залишилося <30 днів — щоб у
# команди був місяць буфера на ротацію.
#
# Як оновити security.txt:
#   1. Update apps/web/public/.well-known/security.txt → set new Expires
#      (RFC 9116 рекомендує <=12 місяців у майбутнє).
#   2. Опціонально: signed з PGP-key (поле Encryption: <key URL>).
#   3. Перевірка локально: `bash scripts/check-security-txt-expiry.sh`.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
file="$repo_root/apps/web/public/.well-known/security.txt"

if [[ ! -f "$file" ]]; then
  echo "::error::security.txt missing at apps/web/public/.well-known/security.txt"
  echo "RFC 9116 expects /.well-known/security.txt to be served on production."
  echo "See docs/security/hardening/I4-security-txt.md."
  exit 1
fi

# Витягуємо першу `Expires:` стрічку (case-sensitive — RFC 9116 визначає
# заголовки case-insensitive, але всі реальні приклади у RFC capitalized;
# тримаємось такого ж стилю для людської читабельності).
expires_raw=$(grep -m1 -E '^Expires:' "$file" | sed -E 's/^Expires:[[:space:]]*//')

if [[ -z "$expires_raw" ]]; then
  echo "::error::security.txt is missing the Expires field (RFC 9116 §2.5.5)."
  echo "Add a line like: Expires: 2026-12-31T23:59:59Z"
  exit 1
fi

# `date -d` приймає ISO 8601 з Z або +00:00. Якщо парсинг впаде — RFC-violation.
if ! expires_epoch=$(date -d "$expires_raw" +%s 2>/dev/null); then
  echo "::error::security.txt has invalid Expires value: $expires_raw"
  echo "RFC 9116 §2.5.5 requires ISO 8601 (e.g. 2026-12-31T23:59:59Z)."
  exit 1
fi

now_epoch=$(date -u +%s)
seconds_until_expiry=$((expires_epoch - now_epoch))
days_until_expiry=$((seconds_until_expiry / 86400))

if (( seconds_until_expiry <= 0 )); then
  echo "::error::security.txt Expires date ($expires_raw) is in the past."
  echo "RFC 9116 §2.5.5: researchers may treat the file as void."
  echo "Refresh apps/web/public/.well-known/security.txt and bump Expires."
  exit 1
fi

if (( days_until_expiry < 30 )); then
  echo "::error::security.txt expires in ${days_until_expiry} day(s) (<$30)."
  echo "Refresh apps/web/public/.well-known/security.txt before it goes stale."
  echo "RFC 9116 §2.5.5; see docs/security/hardening/I4-security-txt.md."
  exit 1
fi

echo "security.txt: OK (expires in ${days_until_expiry} day(s), at $expires_raw)"
