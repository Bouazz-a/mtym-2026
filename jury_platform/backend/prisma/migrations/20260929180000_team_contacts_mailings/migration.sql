-- Convocation emails: the members' addresses (imported from the main site,
-- kept apart from Team.members) and the record of each email sent to a team.

-- CreateTable
CREATE TABLE "TeamContact" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "TeamContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMailing" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentBy" TEXT NOT NULL,
    "recipients" TEXT[],

    CONSTRAINT "TeamMailing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamMailing_teamId_sentAt_idx" ON "TeamMailing"("teamId", "sentAt");

-- AddForeignKey
ALTER TABLE "TeamContact" ADD CONSTRAINT "TeamContact_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMailing" ADD CONSTRAINT "TeamMailing_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

