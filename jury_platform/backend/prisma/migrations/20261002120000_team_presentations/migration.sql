-- The presentation a team shows when it defends a problem: imported from the
-- main site like its reports, and opened by the duo judging that defense.

-- CreateTable
CREATE TABLE "TeamPresentation" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "problemNumber" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,

    CONSTRAINT "TeamPresentation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamPresentation_teamId_problemNumber_key" ON "TeamPresentation"("teamId", "problemNumber");

-- AddForeignKey
ALTER TABLE "TeamPresentation" ADD CONSTRAINT "TeamPresentation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
