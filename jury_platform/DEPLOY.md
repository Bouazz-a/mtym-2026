# Déploiement — `mtym-jury.mathmaroc.org`

La plateforme jury tourne sur le même serveur que mtym.mathmaroc.org, **de la
même façon que le site principal** : l'API sous **pm2**, l'interface servie par
**Caddy**, et seulement la base de données (et sa sauvegarde) dans **Docker**.

```
Navigateur ─► Cloudflare ─► Caddy (service système, ports 80/443)
                              ├─ /api/*  ─► 127.0.0.1:3011   API (pm2 : mtym_jury_api)
                              │                 └─► Postgres 127.0.0.1:5434 (Docker : db)
                              │                        └─ sauvegarde quotidienne → /root/backups/mtym-jury
                              └─ le reste ─► /srv/mtym-jury   (interface, fichiers statiques)
Rapports : liens signés vers https://s3.mathmaroc.org (MinIO du site principal, lecture seule)
```

Rien de la plateforme jury n'écoute sur une adresse publique : l'API et la base
ne sont joignables que depuis le serveur lui-même, Caddy fait l'entrée.

Toutes les commandes se lancent **sur le serveur, en root**. Prérequis déjà en
place sur `ecko` : Node 22, Docker + Compose, pm2, Caddy ; les ports 3011 et
5434 sont libres.

---

## 1. DNS (Cloudflare)

Avec le compte Cloudflare de `mathmaroc.org` : **DNS → Records → Add record**

| Type | Name | Target | Proxy status |
| --- | --- | --- | --- |
| CNAME | `mtym-jury` | `mtym.mathmaroc.org` | Proxied (nuage orange) |

(Si l'enregistrement de `mtym-admin` est un `A` vers l'IP du serveur, faire
pareil : même type, même IP.) Un seul niveau de sous-domaine : le certificat
gratuit de Cloudflare le couvre.

## 2. Accès du serveur au dépôt GitHub

Une clé en lecture seule, séparée de celle du site principal :

```bash
ssh-keygen -t ed25519 -f ~/.ssh/mtym_jury_deploy -N "" -C "ecko mtym-jury"
cat ~/.ssh/mtym_jury_deploy.pub
```

Sur GitHub, dépôt `Bouazz-a/mtym-2026` → **Settings → Deploy keys → Add deploy
key** : coller la clé affichée, **sans** cocher « Allow write access ».

Puis, dans `~/.ssh/config` :

```
Host github-mtym-jury
  HostName github.com
  User git
  IdentityFile ~/.ssh/mtym_jury_deploy
  IdentitiesOnly yes
```

Test : `ssh -T git@github-mtym-jury` doit répondre « Hi Bouazz-a/mtym-2026! ».

## 3. Code et dossiers

```bash
git clone git@github-mtym-jury:Bouazz-a/mtym-2026.git /root/mtym-jury
mkdir -p /root/backups/mtym-jury /srv/mtym-jury
chown 999:999 /root/backups/mtym-jury   # le conteneur de sauvegarde écrit en tant que « postgres »
```

## 4. Secrets

Les deux fichiers `.env` sont créés avec des secrets générés ; un utilisateur
MinIO **en lecture seule** est créé pour la plateforme (elle ouvre les rapports,
elle ne peut ni les modifier ni les supprimer). Aucun secret n'est affiché.

```bash
cd /root/mtym-jury/jury_platform
PGPASS=$(openssl rand -hex 24)
S3_SECRET=$(openssl rand -hex 20)

# Utilisateur MinIO en lecture seule (identifiants admin lus dans le conteneur MinIO lui-même)
export MINIO_ROOT_USER=$(docker exec mtym-s3 printenv MINIO_ROOT_USER)
export MINIO_ROOT_PASSWORD=$(docker exec mtym-s3 printenv MINIO_ROOT_PASSWORD)
NET=$(docker inspect mtym-s3 --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}')
docker run --rm --network "$NET" -e MINIO_ROOT_USER -e MINIO_ROOT_PASSWORD -e S3_SECRET \
  --entrypoint sh minio/mc -c '
  mc alias set local http://mtym-s3:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" > /dev/null &&
  mc admin user add local mtym-jury-reader "$S3_SECRET" &&
  mc admin policy attach local readonly --user mtym-jury-reader'
unset MINIO_ROOT_USER MINIO_ROOT_PASSWORD

cat > .env <<EOF
POSTGRES_DB=mtym_jury
POSTGRES_USER=mtym_jury
POSTGRES_PASSWORD=$PGPASS
BACKUP_DIR=/root/backups/mtym-jury
EOF

cat > backend/.env <<EOF
DATABASE_URL=postgresql://mtym_jury:$PGPASS@localhost:5434/mtym_jury
JWT_SECRET=$(openssl rand -hex 32)
CLIENT_IP_HEADER=cf-connecting-ip
S3_BUCKET=mtym-s3
S3_REGION=us-east-1
S3_ENDPOINT=https://s3.mathmaroc.org
S3_ACCESS_KEY_ID=mtym-jury-reader
S3_SECRET_ACCESS_KEY=$S3_SECRET
EOF

chmod 600 .env backend/.env
unset PGPASS S3_SECRET
```

Attendu : `Added user mtym-jury-reader successfully.` puis
`Attached Policies: [readonly] To User: mtym-jury-reader`.

## 5. Premier démarrage

```bash
cd /root/mtym-jury/jury_platform
docker compose up -d          # la base + sa sauvegarde quotidienne
scripts/deploy.sh             # build, migrations, interface dans /srv/mtym-jury, API sous pm2
```

`deploy.sh` finit par `API OK (http://127.0.0.1:3011/api/health)`. `pm2 ls`
montre maintenant `mtym_jury_api` à côté des applications du site principal.

## 6. Données

```bash
cd /root/mtym-jury/jury_platform/backend
npm run db:seed                                          # grilles de notation par défaut
npm run create-admin -- vous@exemple.com Prénom Nom     # affiche le mot de passe UNE fois : le noter
cd ..
scripts/import-from-mainsite.sh                          # équipes et rapports, directement depuis la base du site principal
```

Les autres comptes (jurés, admins) se créent ensuite dans la page **Comptes**.

*Variante — reprendre la base de développement* (comptes, jours, duos déjà
saisis) au lieu de partir de zéro. Sur la machine de dev :

```bash
docker compose exec -T db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' < /dev/null | cat > dev.dump
ls -l dev.dump        # ne doit pas faire 0 octet
```

l'envoyer avec `scp`, puis sur le serveur :

```bash
cat dev.dump | docker compose exec -T db sh -c 'pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
rm dev.dump
```

(Docker est installé en *snap*, ici comme sur le serveur : il ne sait pas
écrire dans un fichier ouvert par le shell, d'où le passage par `| cat >` —
un simple `> fichier` donnerait un fichier vide.)

## 7. Brancher Caddy

Ajouter le bloc de la plateforme à la configuration de Caddy (une copie de
sauvegarde est faite d'abord) :

```bash
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-$(date +%F)
cat >> /etc/caddy/Caddyfile <<'EOF'

mtym-jury.mathmaroc.org {
	encode gzip
	handle /api/* {
		reverse_proxy localhost:3011
	}
	handle {
		root * /srv/mtym-jury
		try_files {path} /index.html
		file_server
	}
	header /assets/* Cache-Control "public, max-age=31536000, immutable"
}
EOF
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && systemctl reload caddy
```

`systemctl reload` recharge sans couper les autres sites. Si `caddy validate`
signale une erreur, rien n'est rechargé : remettre la copie
(`cp /etc/caddy/Caddyfile.bak-<date> /etc/caddy/Caddyfile`).

Au premier accès, Caddy obtient le certificat HTTPS tout seul (comme pour
`mtym-admin`). Une erreur Cloudflare 52x pendant une ou deux minutes est
normale ; sinon : `journalctl -u caddy -n 50`.

## 8. Vérifier

- `https://mtym-jury.mathmaroc.org/api/health` → `{"status":"ok"}`
- connexion admin, puis la page **Tournoi** avec les équipes importées ;
- connexion d'un juré depuis un téléphone ;
- ouvrir un rapport (lien signé vers `s3.mathmaroc.org`).

---

## Au quotidien

**Mettre à jour** (après un merge sur `main`) :

```bash
cd /root/mtym-jury/jury_platform && scripts/deploy.sh
```

Le script sauvegarde la base, construit, applique les migrations, met en ligne
la nouvelle interface (l'ancienne reste dans `/srv/mtym-jury.prev`) et relance
l'API. S'il échoue en route, la version en place continue de tourner.

**Revenir en arrière** : les deux commandes sont affichées à la fin de chaque
`deploy.sh` (interface précédente, et base d'avant le déploiement depuis
`/root/backups/mtym-jury/predeploy/`).

**Sauvegardes** : tous les jours dans `/root/backups/mtym-jury`
(`daily/` 7 jours, `weekly/` 4 semaines, `monthly/` 6 mois — mêmes réglages que
le site principal), plus un dump avant chaque déploiement dans `predeploy/`.
Restaurer une sauvegarde quotidienne :

```bash
cd /root/mtym-jury/jury_platform
pm2 stop mtym_jury_api
docker compose exec -T db sh -c 'dropdb --force -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
zcat /root/backups/mtym-jury/daily/<fichier>.sql.gz | docker compose exec -T db sh -c 'psql -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
pm2 start mtym_jury_api
```

**Jour de compétition** : réimporter en ne gardant que les rapports finaux, pour
que personne ne soit noté sur un rapport intermédiaire :

```bash
cd /root/mtym-jury/jury_platform && scripts/import-from-mainsite.sh --reports final
```

**Commandes utiles**

| Quoi | Commande |
| --- | --- |
| état de l'API | `pm2 ls` |
| journaux de l'API | `pm2 logs mtym_jury_api` |
| base et sauvegarde | `docker compose ps`, `docker compose logs backup` |
| console SQL | `docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'` |

## Sécurité du serveur (à signaler à qui gère `ecko`)

Le pare-feu `ufw` est inactif : les applications du site principal qui écoutent
sur toutes les interfaces (ports 3000, 3001, 6000, 7000) sont joignables
directement par l'IP du serveur, sans passer par Cloudflare ni Caddy. La
plateforme jury n'est pas concernée (tout est sur `127.0.0.1`). Pour l'activer
**sans se couper l'accès SSH**, dans cet ordre :

```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
```
