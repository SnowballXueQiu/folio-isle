#!/usr/bin/env bash
# Restore a dump made by backup.sh (works on a fresh host: run `up -d db` first or let this do it).
#   scripts/restore.sh backups/folio-20261124T000000Z.dump
# A remote file can be given as user@host:/path/file.dump (fetched with scp).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a
src="${1:?usage: restore.sh <dump file | user@host:/path/file.dump>}"
if [[ "$src" == *:* && ! -f "$src" ]]; then
  mkdir -p backups
  scp -q "$src" "$src.sha256" backups/ 2>/dev/null || scp -q "$src" backups/
  src="backups/$(basename "${src#*:}")"
fi
[ -f "$src" ] || { echo "no such file: $src" >&2; exit 1; }
if [ -f "$src.sha256" ]; then (cd "$(dirname "$src")" && sha256sum -c "$(basename "$src").sha256"); fi
C=$(scripts/compose.sh)
echo "stopping web and worker…"
$C stop web worker >/dev/null 2>&1 || true
$C up -d db
for i in $(seq 1 30); do $C exec -T db pg_isready -U folio -d folio >/dev/null 2>&1 && break; sleep 2; done
echo "recreating database…"
$C exec -T db psql -U folio -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS folio WITH (FORCE)" -c "CREATE DATABASE folio OWNER folio"
$C exec -T db pg_restore -U folio -d folio --no-owner --exit-on-error < "$src"
echo "starting web and worker…"
$C up -d web worker
echo "restored from $src"
$C exec -T db psql -U folio -d folio -tAc "SELECT 'documents='||(SELECT count(*) FROM nodes WHERE kind='doc')||' versions='||(SELECT count(*) FROM doc_versions)||' attachments='||(SELECT count(*) FROM attachments)||' audit='||(SELECT count(*) FROM audit_events)||' ai_pairs='||(SELECT count(*) FROM ai_pair_results)"
