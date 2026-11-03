#!/usr/bin/env bash
# Runs the jury platform locally in one terminal: the database (Docker),
# the API (http://127.0.0.1:3001) and the interface (http://localhost:5173).
# Ctrl+C stops the API and the interface; the database keeps running
# (stop it with: cd jury_platform && docker compose stop db).
#
#   ./dev.sh              on the local database
#   ./dev.sh demo         on a demo database instead: a whole fictional
#                         qualification phase, graded, built the first time
#                         (jury_platform/scripts/demo-db.sh). On its own
#                         ports, API 3002 and http://localhost:5174, so it
#                         runs next to the other one. Emails are written to
#                         jury_platform/outbox, and reports can't be opened
#                         (their files don't exist).
#   ./dev.sh demo fresh   the same, on a demo rebuilt from scratch
set -euo pipefail
APP="$(cd "$(dirname "$0")/jury_platform" && pwd)"

API_PORT=3001
WEB_PORT=5173
WEB_ARGS=()
DEMO=
case "${1:-}" in
  "") ;;
  demo)
    DEMO=1
    API_PORT=3002
    WEB_PORT=5174
    WEB_ARGS=(-- --port "$WEB_PORT" --strictPort)
    ;;
  *)
    echo "Usage : ./dev.sh [demo [fresh]]" >&2
    exit 1
    ;;
esac

# Both ports must be free: under tsx watch the API wouldn't exit on a taken
# port (it waits for a file change), and vite would quietly move to 5174
for port in "$API_PORT" "$WEB_PORT"; do
  if (exec 3<> "/dev/tcp/127.0.0.1/$port") 2> /dev/null; then
    echo "Le port $port est déjà utilisé — un autre « npm run dev » tourne-t-il encore ?" >&2
    exit 1
  fi
done

echo "▶ Base de données"
(cd "$APP" && docker compose up -d --wait db) # waits for the healthcheck

# Dependencies, the first time (or after a fresh clone)
for part in backend frontend; do
  [[ -d "$APP/$part/node_modules" ]] || (echo "▶ npm ci ($part)" && cd "$APP/$part" && npm ci --no-audit --no-fund)
done

# The Prisma client must match the schema: after a new column, a stale
# client breaks every query using it ("Unknown field …")
echo "▶ Client Prisma"
(cd "$APP/backend" && npx prisma generate > /dev/null)

if [[ -n "$DEMO" ]]; then
  echo "▶ Base de démonstration"
  if [[ "${2:-}" == "fresh" ]] || ! "$APP/scripts/demo-db.sh" exists; then
    "$APP/scripts/demo-db.sh" build
  fi
  # Both servers read these instead of backend/.env: the demo database, its
  # own ports, and nothing that leaves the machine (emails go to a folder,
  # the reports' bucket is switched off)
  DATABASE_URL="$("$APP/scripts/demo-db.sh" url)"
  export DATABASE_URL
  export PORT="$API_PORT" API_PROXY_TARGET="http://127.0.0.1:$API_PORT" APP_URL="http://localhost:$WEB_PORT"
  export MAIL_OUTBOX_DIR="$APP/outbox" S3_BUCKET=
  # Its own Vite cache, so the two interfaces never rebuild each other's
  export VITE_CACHE_DIR=node_modules/.vite-demo
  # The accounts of backend/scripts/seed-demo.ts
  echo "  http://localhost:$WEB_PORT : admin@demo.test, mot de passe demo-mtym-2026"
fi

# Both dev servers, their lines prefixed. Each runs in its own process group
# (set -m), so stopping them reaches everything they started (npm, node,
# vite) and nothing else; stdin is closed so vite doesn't wait on the
# keyboard in the background. Ctrl+C, or either one dying, stops both.
set -m
(cd "$APP/backend" && npm run dev < /dev/null 2>&1 | sed -u 's/^/[api] /') &
(cd "$APP/frontend" && npm run dev ${WEB_ARGS[@]+"${WEB_ARGS[@]}"} < /dev/null 2>&1 | sed -u 's/^/[web] /') &
stop() {
  trap - EXIT INT TERM
  for pgid in $(jobs -p); do kill -- "-$pgid" 2> /dev/null || true; done
}
trap stop EXIT INT TERM
wait -n || true
