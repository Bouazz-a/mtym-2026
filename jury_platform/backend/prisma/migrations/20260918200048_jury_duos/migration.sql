/*
  Warnings:

  - You are about to drop the `PoolJuror` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PoolJuror" DROP CONSTRAINT "PoolJuror_accountId_fkey";

-- DropForeignKey
ALTER TABLE "PoolJuror" DROP CONSTRAINT "PoolJuror_poolId_fkey";

-- AlterTable
ALTER TABLE "Passage" ADD COLUMN     "duoId" TEXT;

-- DropTable
DROP TABLE "PoolJuror";

-- CreateTable
CREATE TABLE "JuryDuo" (
    "id" TEXT NOT NULL,
    "centerDayId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "JuryDuo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuoMember" (
    "duoId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "DuoMember_pkey" PRIMARY KEY ("duoId","accountId")
);

-- CreateIndex
CREATE UNIQUE INDEX "JuryDuo_centerDayId_number_key" ON "JuryDuo"("centerDayId", "number");

-- AddForeignKey
ALTER TABLE "JuryDuo" ADD CONSTRAINT "JuryDuo_centerDayId_fkey" FOREIGN KEY ("centerDayId") REFERENCES "CenterDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuoMember" ADD CONSTRAINT "DuoMember_duoId_fkey" FOREIGN KEY ("duoId") REFERENCES "JuryDuo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuoMember" ADD CONSTRAINT "DuoMember_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passage" ADD CONSTRAINT "Passage_duoId_fkey" FOREIGN KEY ("duoId") REFERENCES "JuryDuo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
