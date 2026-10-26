-- The admissible teams, fixed by an admin on the Admissibles page (one row;
-- none until the list is fixed).

-- CreateTable
CREATE TABLE "AdmissibleList" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "places" INTEGER NOT NULL,
    "lambda" DOUBLE PRECISION NOT NULL,
    "teamIds" TEXT[],
    "fixedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fixedBy" TEXT NOT NULL,

    CONSTRAINT "AdmissibleList_pkey" PRIMARY KEY ("id")
);
