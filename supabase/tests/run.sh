#!/usr/bin/env bash
# Exécute migrations + tests SQL sur une base PostgreSQL jetable.
# Variables : PGHOST, PGPORT, PGUSER (superutilisateur). Base créée : app_test.
set -euo pipefail
cd "$(dirname "$0")/.."

DB="${TEST_DB:-app_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 --set client_min_messages=warning)

"${PSQL[@]}" -d postgres -c "drop database if exists ${DB}" -c "create database ${DB}"
for f in tests/shim/*.sql migrations/*.sql; do
  "${PSQL[@]}" -d "$DB" -f "$f" >/dev/null
done

pass=0; fail=0
for t in tests/sql/*.test.sql; do
  if out=$("${PSQL[@]}" --set client_min_messages=notice -d "$DB" -f "$t" 2>&1); then
    n=$(grep -c 'NOTICE:  ok - ' <<<"$out" || true)
    pass=$((pass + n)); echo "✓ $(basename "$t") ($n assertions)"
  else
    fail=$((fail + 1)); echo "✗ $(basename "$t")"; grep -E 'ÉCHEC|ERROR' <<<"$out" | head -5
  fi
done
echo "assertions réussies: $pass — fichiers en échec: $fail"
[ "$fail" -eq 0 ]
