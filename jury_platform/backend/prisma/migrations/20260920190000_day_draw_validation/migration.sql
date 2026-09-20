-- A center day whose composition is settled. Teams may be left without a
-- pool (a team that doesn't come), so validation is a decision, not a rule.
ALTER TABLE "CenterDay" ADD COLUMN "drawValidatedAt" TIMESTAMP(3);
ALTER TABLE "CenterDay" ADD COLUMN "drawValidatedBy" TEXT;
