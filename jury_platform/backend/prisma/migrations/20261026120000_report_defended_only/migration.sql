-- The written-report note can be the defended report alone (page Critères):
-- the other reports then weigh nothing, their notes kept.

-- AlterTable
ALTER TABLE "FinalWeights" ADD COLUMN "reportDefendedOnly" BOOLEAN NOT NULL DEFAULT false;
