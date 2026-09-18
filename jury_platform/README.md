# MTYM jury platform

Jury and admin platform for the MTYM qualifications, served at
`jury.mtym.mathmaroc.org`. Jurors grade final reports and oral passages;
admins import teams, draw pools per center/day and assign 2 jurors per pool.

## Local development

```bash
cp .env.example .env                      # compose: database credentials
cp backend/.env.example backend/.env      # backend: DATABASE_URL, JWT_SECRET
docker compose up -d db

cd backend
npm install
npx prisma migrate dev                    # applies prisma/migrations
npm run db:seed                           # default grading criteria
npm run create-admin -- you@example.com Prénom Nom
npm run dev                               # http://localhost:3001/api/health
```

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
```

It imports the teams that are `APPROVED`, whose intermediate report is `PASS`
and that have a qualification center, with their members' names and their
FINAL reports. Re-run it with a newer dump at any time: teams are matched on
their main-site id, and a team that is already in a pool is never deleted or
moved to another center — the script lists it instead.

Dumps contain personal data: keep them out of git (`*.sql` / `*.dump` are
ignored here) and delete them once imported.
