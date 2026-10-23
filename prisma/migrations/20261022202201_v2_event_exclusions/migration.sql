-- CreateTable
CREATE TABLE "EventExclusion" (
    "articleId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventExclusion_pkey" PRIMARY KEY ("articleId")
);

-- AddForeignKey
ALTER TABLE "EventExclusion" ADD CONSTRAINT "EventExclusion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
