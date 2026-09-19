-- Each day carries its own passage schedule; a passage's time comes from it.
ALTER TABLE "CenterDay" ADD COLUMN "schedule" JSONB NOT NULL DEFAULT '[{"start":"13:15","minutes":60},{"start":"14:30","minutes":60},{"start":"16:00","minutes":60},{"start":"17:15","minutes":60}]';

-- A passage's slot is its position in the pool, the "P3" ending its label.
ALTER TABLE "Passage" ADD COLUMN "slot" INTEGER;
UPDATE "Passage" SET "slot" = COALESCE(substring("label" from 'P(\d+)$')::int, 1);
ALTER TABLE "Passage" ALTER COLUMN "slot" SET NOT NULL;
ALTER TABLE "Passage" DROP COLUMN "timeSlot";

-- Final grade weights: a single row.
CREATE TABLE "FinalWeights" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "defender" DOUBLE PRECISION NOT NULL DEFAULT 9,
    "opponent" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "reporter" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "report" DOUBLE PRECISION NOT NULL DEFAULT 5,

    CONSTRAINT "FinalWeights_pkey" PRIMARY KEY ("id")
);
INSERT INTO "FinalWeights" ("id") VALUES (1);

-- Journal of admin changes.
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
