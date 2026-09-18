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
