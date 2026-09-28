#!/usr/bin/env bash
# Runs the jury platform locally in one terminal: the database (Docker),
# the API (http://127.0.0.1:3001) and the interface (http://localhost:5173).
# Ctrl+C stops the API and the interface; the database keeps running
# (stop it with: cd jury_platform && docker compose stop db).
set -euo pipefail
APP="$(cd "$(dirname "$0")/jury_platform" && pwd)"

# Both ports must be free: under tsx watch the API wouldn't exit on a taken
# port (it waits for a file change), and vite would quietly move to 5174
for port in 3001 5173; do
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

# Both dev servers, their lines prefixed. Each runs in its own process group
# (set -m), so stopping them reaches everything they started (npm, node,
# vite) and nothing else; stdin is closed so vite doesn't wait on the
# keyboard in the background. Ctrl+C, or either one dying, stops both.
set -m
(cd "$APP/backend" && npm run dev < /dev/null 2>&1 | sed -u 's/^/[api] /') &
(cd "$APP/frontend" && npm run dev < /dev/null 2>&1 | sed -u 's/^/[web] /') &
stop() {
  trap - EXIT INT TERM
  for pgid in $(jobs -p); do kill -- "-$pgid" 2> /dev/null || true; done
}
trap stop EXIT INT TERM
wait -n || true
