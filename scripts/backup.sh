#!/usr/bin/env bash
# Full backup: PostgreSQL holds everything durable (documents, every version, attachments,
# audit, todos, notes, AI results). Writes backups/folio-<UTC>.dump (pg_dump -Fc) + sha256.
# Off-host copy: BACKUP_REMOTE=user@host:/path (scp).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a
C=$(scripts/compose.sh)
mkdir -p backups
out="backups/folio-$(date -u +%Y%m%dT%H%M%SZ).dump"
$C exec -T db pg_dump -U folio -d folio -Fc > "$out"
[ -s "$out" ] || { echo "backup is empty" >&2; rm -f "$out"; exit 1; }
(cd backups && sha256sum "$(basename "$out")" > "$(basename "$out").sha256")
echo "backup written: $out ($(du -h "$out" | cut -f1))"
if [ -n "${BACKUP_REMOTE:-}" ]; then
  scp -q "$out" "$out.sha256" "$BACKUP_REMOTE/"
  echo "copied to $BACKUP_REMOTE"
fi
ls -1t backups/folio-*.dump 2>/dev/null | tail -n +15 | while read -r f; do rm -f "$f" "$f.sha256"; done
