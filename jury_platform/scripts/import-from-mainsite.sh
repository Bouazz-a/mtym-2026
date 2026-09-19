#!/usr/bin/env bash
# On the server: imports the teams straight from the main site's database,
# which runs on the same machine (container mtym_db) — no dump to copy
# around. The database is dumped read-only to a private temporary file,
# handed to import-dump.sh, and the file is deleted (it holds personal data).
#
#   scripts/import-from-mainsite.sh                   # final report, else intermediate
#   scripts/import-from-mainsite.sh --reports final   # competition day
#
# SOURCE_CONTAINER overrides the main site's database container (mtym_db).
set -euo pipefail

SOURCE_CONTAINER="${SOURCE_CONTAINER:-mtym_db}"
cd "$(dirname "$0")/.."

DUMP="$(mktemp --suffix=.sql)" # mode 600
trap 'rm -f "$DUMP"' EXIT

echo "Dump de la base du site principal ($SOURCE_CONTAINER)…"
# Through a pipe: the snap-packaged docker CLI can't write to a file the
# shell opened (the dump would be empty).
docker exec "$SOURCE_CONTAINER" sh -c 'pg_dump --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"' < /dev/null | cat > "$DUMP"
[[ -s "$DUMP" ]] || { echo "Dump vide — rien n'a été importé" >&2; exit 1; }

scripts/import-dump.sh "$DUMP" "$@"
