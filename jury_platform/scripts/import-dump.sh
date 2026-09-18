#!/usr/bin/env bash
# Imports the eligible teams from a main-site dump into the jury platform.
#
#   scripts/import-dump.sh path/to/dump.sql     # plain pg_dump output
#   scripts/import-dump.sh path/to/dump.dump    # pg_dump -Fc
#
# The dump is loaded into a throwaway database (mainsite_import) next to
# the platform's own, the teams are copied over by backend/scripts/
# import-teams.ts, and the throwaway database is dropped again — the only
# data kept is what the import copies (teams, member names, report keys).
set -euo pipefail

DUMP="${1:?usage: scripts/import-dump.sh <dump.sql|dump.dump>}"
[[ -f "$DUMP" ]] || { echo "No such file: $DUMP" >&2; exit 1; }
DUMP="$(cd "$(dirname "$DUMP")" && pwd)/$(basename "$DUMP")"

cd "$(dirname "$0")/.."
set -a; source ./.env; set +a
SRC_DB=mainsite_import

# psql / pg_restore run in a one-off container of the db image: the dump
# comes from pg_dump 18, whose \restrict lines older host clients reject.
# Compose's "Container … Created" progress lines are filtered out.
pg() {
  docker compose run --rm -T --no-deps \
    -e PGPASSWORD="$POSTGRES_PASSWORD" -e PGOPTIONS="-c client_min_messages=warning" \
    db "$@" -h db -U "$POSTGRES_USER" 2> >(grep -v '^ *Container ' >&2)
}
drop_source() {
  pg psql -q -d "$POSTGRES_DB" -c "DROP DATABASE IF EXISTS $SRC_DB"
}

echo "Loading $(basename "$DUMP") into $SRC_DB…"
drop_source
pg psql -q -v ON_ERROR_STOP=1 -d "$POSTGRES_DB" -c "CREATE DATABASE $SRC_DB"
trap drop_source EXIT

# Piped, not redirected: `compose run -T` doesn't forward a file on stdin.
case "$DUMP" in
  *.dump) cat "$DUMP" | pg pg_restore --no-owner --no-privileges -d "$SRC_DB" ;;
  *)      cat "$DUMP" | pg psql -q -v ON_ERROR_STOP=1 -d "$SRC_DB" > /dev/null ;;
esac

echo "Importing teams…"
(cd backend && npm run --silent import:teams)
