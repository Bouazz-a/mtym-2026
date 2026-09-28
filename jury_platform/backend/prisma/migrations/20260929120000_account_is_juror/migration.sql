-- Who judges: every jury account, and the admins who also sit in duos.
ALTER TABLE "Account" ADD COLUMN "isJuror" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Account" SET "isJuror" = true WHERE role = 'jury';
