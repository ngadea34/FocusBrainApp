#!/usr/bin/env bash
# Lance les tests *.remote.test.ts sur un projet Supabase réel.
# Les clés sont lues à la volée via l'API d'administration (jeton ajouté par le proxy
# ou SUPABASE_ACCESS_TOKEN) et ne sont écrites nulle part.
# Usage : bash supabase/tests/remote/run.sh <ref_du_projet>
set -euo pipefail
cd "$(dirname "$0")/../../.."
REF="${1:?ref du projet Supabase}"
AUTH=()
[[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]] && AUTH=(-H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN")
KEYS=$(curl -sSf "${AUTH[@]}" "https://api.supabase.com/v1/projects/$REF/api-keys?reveal=true")
pick() { python3 -c "import json,sys; print([k['api_key'] for k in json.loads(sys.argv[1]) if k['name']==sys.argv[2]][0])" "$KEYS" "$1"; }
export SUPABASE_URL="https://$REF.supabase.co"
SUPABASE_ANON_KEY=$(pick anon); SUPABASE_SERVICE_KEY=$(pick service_role)
export SUPABASE_ANON_KEY SUPABASE_SERVICE_KEY
# Le fetch de Node ne lit HTTPS_PROXY qu'avec cette option.
export NODE_USE_ENV_PROXY=1 NODE_NO_WARNINGS=1
exec npx vitest run --config vitest.remote.config.ts "${@:2}"
