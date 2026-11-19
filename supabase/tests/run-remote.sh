#!/usr/bin/env bash
# Rejoue les tests SQL sur un projet Supabase réel via l'API d'administration,
# chacun dans une transaction annulée (aucune donnée ne reste).
# Le jeton est ajouté par le proxy (secret réseau sur api.supabase.com) ou via SUPABASE_ACCESS_TOKEN.
# Usage : bash supabase/tests/run-remote.sh <ref_du_projet>
set -euo pipefail
cd "$(dirname "$0")/../.."
REF="${1:?ref du projet Supabase}"
API="https://api.supabase.com/v1/projects/$REF/database/query"
AUTH=()
[[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]] && AUTH=(-H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN")
fail=0
for f in supabase/tests/sql/*.test.sql; do
  body=$(python3 - "$f" <<'PY'
import json, sys
lines = open(sys.argv[1], encoding="utf-8").read().split("\n")
assert lines[1] == "begin;", "le test doit commencer par begin;"
helpers = open("supabase/tests/shim/01_test_helpers.sql", encoding="utf-8").read()
print(json.dumps({"query": "begin;\n" + helpers + "\n" + "\n".join(lines[2:])}))
PY
)
  out=$(curl -sS -X POST "$API" "${AUTH[@]}" -H 'Content-Type: application/json' --data "$body" -w '\n%{http_code}')
  code=$(tail -1 <<<"$out")
  if [[ "$code" == 2* ]]; then echo "✓ $(basename "$f")"; else echo "✗ $(basename "$f") : $(head -c 600 <<<"$out")"; fail=1; fi
done
exit $fail
