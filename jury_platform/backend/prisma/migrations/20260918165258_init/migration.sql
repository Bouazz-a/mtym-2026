-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'jury');

-- CreateEnum
CREATE TYPE "Center" AS ENUM ('casablanca', 'rabat', 'martil', 'benguerir', 'agadir', 'fez', 'oujda', 'online');

-- CreateEnum
CREATE TYPE "PassageRole" AS ENUM ('defender', 'opponent', 'reporter', 'extra');

-- CreateEnum
CREATE TYPE "EvaluationType" AS ENUM ('report', 'oral');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CenterDay" (
    "id" TEXT NOT NULL,
    "center" "Center" NOT NULL,
    "date" TEXT NOT NULL,

    CONSTRAINT "CenterDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "quadrigram" TEXT NOT NULL,
    "center" "Center" NOT NULL,
    "members" JSONB NOT NULL,
    "centerDayId" TEXT,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamReport" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "problemNumber" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,

    CONSTRAINT "TeamReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pool" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "centerDayId" TEXT,

    CONSTRAINT "Pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolJuror" (
    "poolId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "PoolJuror_pkey" PRIMARY KEY ("poolId","accountId")
);

-- CreateTable
CREATE TABLE "Passage" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "problemNumber" INTEGER NOT NULL,
    "poolId" TEXT NOT NULL,
    "defenderTeamId" TEXT NOT NULL,
    "opponentTeamId" TEXT NOT NULL,
    "reporterTeamId" TEXT NOT NULL,
    "extraTeamId" TEXT,
    "timeSlot" TEXT,
    "room" TEXT,

    CONSTRAINT "Passage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Criterion" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "coefficient" DOUBLE PRECISION NOT NULL,
    "type" "EvaluationType" NOT NULL,
    "role" "PassageRole",
    "problemNumber" INTEGER,
    "theme" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "Criterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportEvaluation" (
    "id" TEXT NOT NULL,
    "juryId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "problemNumber" INTEGER NOT NULL,
    "globalRemark" TEXT,

    CONSTRAINT "ReportEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportGrade" (
    "id" TEXT NOT NULL,
    "reportEvaluationId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "remark" TEXT,

    CONSTRAINT "ReportGrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OralEvaluation" (
    "id" TEXT NOT NULL,
    "juryId" TEXT NOT NULL,
    "passageId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "role" "PassageRole" NOT NULL,
    "globalRemark" TEXT,

    CONSTRAINT "OralEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OralGrade" (
    "id" TEXT NOT NULL,
    "oralEvaluationId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "remark" TEXT,

    CONSTRAINT "OralGrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_email_key" ON "Account"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CenterDay_center_date_key" ON "CenterDay"("center", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Team_sourceId_key" ON "Team"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamReport_teamId_problemNumber_key" ON "TeamReport"("teamId", "problemNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ReportEvaluation_juryId_teamId_problemNumber_key" ON "ReportEvaluation"("juryId", "teamId", "problemNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ReportGrade_reportEvaluationId_criterionId_key" ON "ReportGrade"("reportEvaluationId", "criterionId");

-- CreateIndex
CREATE UNIQUE INDEX "OralEvaluation_juryId_passageId_teamId_key" ON "OralEvaluation"("juryId", "passageId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "OralGrade_oralEvaluationId_criterionId_key" ON "OralGrade"("oralEvaluationId", "criterionId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_centerDayId_fkey" FOREIGN KEY ("centerDayId") REFERENCES "CenterDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamReport" ADD CONSTRAINT "TeamReport_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pool" ADD CONSTRAINT "Pool_centerDayId_fkey" FOREIGN KEY ("centerDayId") REFERENCES "CenterDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolJuror" ADD CONSTRAINT "PoolJuror_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolJuror" ADD CONSTRAINT "PoolJuror_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passage" ADD CONSTRAINT "Passage_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passage" ADD CONSTRAINT "Passage_defenderTeamId_fkey" FOREIGN KEY ("defenderTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passage" ADD CONSTRAINT "Passage_opponentTeamId_fkey" FOREIGN KEY ("opponentTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passage" ADD CONSTRAINT "Passage_reporterTeamId_fkey" FOREIGN KEY ("reporterTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passage" ADD CONSTRAINT "Passage_extraTeamId_fkey" FOREIGN KEY ("extraTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportEvaluation" ADD CONSTRAINT "ReportEvaluation_juryId_fkey" FOREIGN KEY ("juryId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportEvaluation" ADD CONSTRAINT "ReportEvaluation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportGrade" ADD CONSTRAINT "ReportGrade_reportEvaluationId_fkey" FOREIGN KEY ("reportEvaluationId") REFERENCES "ReportEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OralEvaluation" ADD CONSTRAINT "OralEvaluation_juryId_fkey" FOREIGN KEY ("juryId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OralEvaluation" ADD CONSTRAINT "OralEvaluation_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "Passage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OralGrade" ADD CONSTRAINT "OralGrade_oralEvaluationId_fkey" FOREIGN KEY ("oralEvaluationId") REFERENCES "OralEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
