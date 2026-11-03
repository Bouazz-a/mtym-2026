#!/usr/bin/env bash
# Builds the demo database: a whole fictional qualification phase (teams,
# pools, jurors, notes), to try every page with data. It sits next to the
# local database, under the same name plus "_demo": the local one is never
# touched.
#
#   scripts/demo-db.sh          build it, or rebuild it from scratch
#   scripts/demo-db.sh url      print its address (a DATABASE_URL)
#   scripts/demo-db.sh exists   succeed when it is there
#
# ./dev.sh demo, at the root of the repository, builds it when it is missing
# and starts the platform on it. The data itself comes from
# backend/scripts/seed-demo.ts; DEMO_SEED=<number> makes another one up.
set -euo pipefail
cd "$(dirname "$0")/.."

[[ -f backend/.env ]] || { echo "backend/.env is missing: see README.md, Local development" >&2; exit 1; }
[[ -d backend/node_modules ]] || { echo "Dependencies are missing: run npm install in backend/ first" >&2; exit 1; }

# The local database's address, with "_demo" added to its name
URL="$(cd backend && node -e '
  require("dotenv").config({ quiet: true });
  const url = new URL(process.env.DATABASE_URL);
  if (!url.pathname.endsWith("_demo")) url.pathname += "_demo";
  process.stdout.write(url.toString());
')"
NAME="${URL##*/}"
NAME="${NAME%%\?*}"
# Checked before it goes into a statement: only a plain name ending in _demo
[[ "$NAME" =~ ^[A-Za-z0-9_]+_demo$ ]] || { echo "Unexpected demo database name: $NAME" >&2; exit 1; }

# A statement on the local server, through its container. stdin from
# /dev/null: exec fails when it isn't a terminal. Through a pipe: the
# snap-packaged docker CLI loses its output otherwise.
sql() {
  docker compose exec -T db sh -c 'PGOPTIONS="-c client_min_messages=warning" psql -q -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' sh "$@" < /dev/null | cat
}

# The database server, quietly when it is already up or comes up fine
server() {
  docker compose up -d --wait db > /dev/null 2>&1 || docker compose up -d --wait db
}

case "${1:-build}" in
  url)
    echo "$URL"
    ;;
  exists)
    server
    [[ "$(sql -c "SELECT 1 FROM pg_database WHERE datname = '$NAME'")" == 1 ]]
    ;;
  build)
    server
    echo "Building the demo database ($NAME)"
    sql -c "DROP DATABASE IF EXISTS \"$NAME\" WITH (FORCE)" -c "CREATE DATABASE \"$NAME\""
    cd backend
    export DATABASE_URL="$URL"
    npx prisma migrate deploy > /dev/null
    npx tsx prisma/seed.ts > /dev/null # the default grading criteria
    npm run --silent db:demo
    ;;
  *)
    echo "usage: scripts/demo-db.sh [build|url|exists]" >&2
    exit 1
    ;;
esac
