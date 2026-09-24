-- The weight of each problem (in %) in a team's written-report note, the
-- weighted average of its reports out of 20.
ALTER TABLE "FinalWeights" ADD COLUMN "problemWeights" JSONB NOT NULL DEFAULT '{"1":25,"2":25,"3":25,"4":25}';
