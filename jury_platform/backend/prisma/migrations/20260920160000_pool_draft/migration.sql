-- A pool being composed by hand keeps its unfinished grid here; its passages
-- are only created once the grid is complete. Existing pools keep draft NULL.
ALTER TABLE "Pool" ADD COLUMN "draft" JSONB;
