#!/usr/bin/env sh
# Prints the compose command to use: $COMPOSE, docker compose, podman compose or podman-compose.
# Adds the ClickHouse overlay when WITH_CLICKHOUSE=1.
set -e
if [ -n "${COMPOSE:-}" ]; then c="$COMPOSE"
elif docker compose version >/dev/null 2>&1; then c="docker compose"
elif command -v podman-compose >/dev/null 2>&1; then c="podman-compose"
elif podman compose version >/dev/null 2>&1; then c="podman compose"
else echo "no docker compose / podman-compose found" >&2; exit 1; fi
files="-f compose.yaml"
[ "${WITH_CLICKHOUSE:-0}" = "1" ] && files="$files -f compose.clickhouse.yaml"
echo "$c $files"
