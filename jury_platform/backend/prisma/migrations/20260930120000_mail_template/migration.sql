-- The admin's version of the convocation email's subject, title and
-- opening (one row; none while the code's defaults apply).

-- CreateTable
CREATE TABLE "MailTemplate" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "subject" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL,

    CONSTRAINT "MailTemplate_pkey" PRIMARY KEY ("id")
);
