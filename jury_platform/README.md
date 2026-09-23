# MTYM jury platform

Jury and admin platform for the MTYM qualifications, served at
`mtym-jury.mathmaroc.org`. Jurors grade the reports and the oral passages;
admins import teams, draw pools per center and day, form jury duos and give
each passage a duo. Deployment: see [DEPLOY.md](DEPLOY.md).

## Local development

```bash
cp .env.example .env                      # compose: database credentials
cp backend/.env.example backend/.env      # backend: DATABASE_URL, JWT_SECRET
docker compose up -d db                   # only the database in dev (not the backup service)

cd backend
npm install
npx prisma migrate dev                    # applies prisma/migrations
npm run db:seed                           # default grading criteria
npm run create-admin -- you@example.com Prénom Nom
npm run dev                               # http://localhost:3001/api/health

# in another terminal
cd frontend
npm install
npm run dev                               # http://localhost:5173 (proxies /api to :3001)
```

The frontend calls the API on its own origin (`/api`). If the backend
listens on another port, start Vite with
`API_PROXY_TARGET=http://127.0.0.1:<port> npm run dev`. The backend listens
on 127.0.0.1 unless `HOST` says otherwise.

Checks: `npm run lint`, `npx tsc -b` and `npm test` in `frontend/`;
`npm run typecheck` and `npm test` in `backend/`.

Pool draws and the automatic assignment of jury duos are computed by the
backend, in `backend/src/algorithms/` (pure modules, tested next to them);
the admin UI only asks for them.

## Importing teams from the main site

Teams come from a `pg_dump` of the main site (mtym.mathmaroc.org). Only
these columns are read, so an export limited to them is enough:

| Table | Columns |
| --- | --- |
| `teams` | `id`, `name`, `quadrigram`, `qualifCenter`, `status` |
| `team_reviews` | `teamId`, `intermediateReportDecision` |
| `team_reports` | `teamId`, `reportType`, `problemNumber`, `fileUrl` |
| `users` | `firstName`, `lastName`, `teamId` |

```bash
scripts/import-dump.sh path/to/dump.sql     # or a pg_dump -Fc .dump file
scripts/import-from-mainsite.sh             # on the server: straight from the main site's database
```

Reports: for each team and problem the jury grades the **final** report when
there is one, otherwise the **intermediate** one (it stands in until the finals
are submitted — a plain re-import then switches to them). Force one type with
`--reports final` (e.g. on competition day, so nobody is graded on an
intermediate report) or `--reports intermediate`.

It imports the teams that are `APPROVED`, whose intermediate report is `PASS`
and that have a qualification center, with their members' names and their
reports (which one is graded: see above). Re-run it with a newer dump at any
time: teams are matched on their main-site id, and a team that is already in
a pool is never deleted or moved to another center — the script lists it
instead.

Dumps contain personal data: keep them out of git (`*.sql` / `*.dump` are
ignored here) and delete them once imported.
