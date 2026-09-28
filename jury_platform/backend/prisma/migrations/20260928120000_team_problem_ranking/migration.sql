-- The problems each team wants to defend, favorite first (imported from the
-- main site's teams."finalReportRanking"); the pool draw follows it.
ALTER TABLE "Team" ADD COLUMN "problemRanking" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
