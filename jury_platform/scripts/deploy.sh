#!/usr/bin/env bash
# Deploys the jury platform on the server — the main site's routine (git
# pull, dump, build, pm2 restart), scripted:
#
#   jury_platform/scripts/deploy.sh
#
# Stops at the first failing step. Until the final pm2 reload, the version
# already running keeps serving; the previous interface stays in
# $STATIC_DIR.prev and the database is dumped first (see the end for how to
# roll back).
#
# Overridable: STATIC_DIR (/srv/mtym-jury), BACKUP_DIR (from .env),
# SKIP_PULL=1, PM2 (pm2), HEALTH_URL.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$PWD
set -a; source ./.env; set +a
STATIC_DIR="${STATIC_DIR:-/srv/mtym-jury}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
PM2="${PM2:-pm2}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3011/api/health}"

step() { printf '\n== %s\n' "$*"; }
for cmd in docker node npm curl; do
  command -v "$cmd" > /dev/null || { echo "Commande introuvable : $cmd" >&2; exit 1; }
done

if [[ -z "${SKIP_PULL:-}" ]]; then
  step "Mise à jour du code"
  git pull --ff-only
fi

step "Base de données : démarrage et sauvegarde avant déploiement"
docker compose up -d --wait db
mkdir -p "$BACKUP_DIR/predeploy"
DUMP="$BACKUP_DIR/predeploy/mtym_jury-$(date +%Y%m%d-%H%M%S).dump"
# Through a pipe: the snap-packaged docker CLI (as on the server) can't
# write to a file the shell opened, and would leave an empty dump. stdin
# from /dev/null: exec fails when stdin isn't a terminal (cron, CI…).
docker compose exec -T db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' < /dev/null | cat > "$DUMP"
[[ -s "$DUMP" ]] || { echo "Sauvegarde vide : $DUMP — arrêt, rien n'a été modifié" >&2; exit 1; }
echo "Sauvegarde : $DUMP ($(du -h "$DUMP" | cut -f1))"

step "API : dépendances, build, migrations"
cd "$ROOT/backend"
npm ci --no-audit --no-fund
npx prisma generate
npm run build
npx prisma migrate deploy

step "Interface : dépendances et build"
cd "$ROOT/frontend"
npm ci --no-audit --no-fund
npm run build

step "Interface : mise en ligne dans $STATIC_DIR"
mkdir -p "$(dirname "$STATIC_DIR")"
rm -rf "$STATIC_DIR.next"
cp -r dist "$STATIC_DIR.next"
if [[ -d "$STATIC_DIR" ]]; then
  rm -rf "$STATIC_DIR.prev"
  mv "$STATIC_DIR" "$STATIC_DIR.prev"
fi
mv "$STATIC_DIR.next" "$STATIC_DIR"

step "API : (re)démarrage avec pm2"
cd "$ROOT"
$PM2 startOrReload ecosystem.config.cjs --update-env
$PM2 save

step "Vérification"
healthy=
for _ in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" > /dev/null 2>&1; then healthy=1; break; fi
  sleep 1
done
if [[ -z "$healthy" ]]; then
  echo "L'API ne répond pas sur $HEALTH_URL — voir : $PM2 logs mtym_jury_api" >&2
  exit 1
fi
echo "API OK ($HEALTH_URL)"

cat <<EOF

Déployé. En cas de problème :
  - interface précédente : rm -rf $STATIC_DIR && mv $STATIC_DIR.prev $STATIC_DIR
  - base d'avant le déploiement :
      cat $DUMP | docker compose exec -T db sh -c 'pg_restore --clean --if-exists -U "\$POSTGRES_USER" -d "\$POSTGRES_DB"'
EOF
