-- A duo's problem: its jurors are the problem's specialists.
ALTER TABLE "JuryDuo" ADD COLUMN "problemNumber" INTEGER;

-- The reports of problems a team doesn't defend, each handed to one juror.
CREATE TABLE "ReportAssignment" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportAssignment_reportId_key" ON "ReportAssignment"("reportId");
CREATE INDEX "ReportAssignment_accountId_idx" ON "ReportAssignment"("accountId");

ALTER TABLE "ReportAssignment" ADD CONSTRAINT "ReportAssignment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "TeamReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportAssignment" ADD CONSTRAINT "ReportAssignment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
