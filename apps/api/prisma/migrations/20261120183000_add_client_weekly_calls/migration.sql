-- CreateTable
CREATE TABLE "ClientWeeklyCall" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "status" TEXT,
    "contactedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientWeeklyCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientWeeklyCall_userId_weekStart_key"
ON "ClientWeeklyCall"("userId", "weekStart");

-- CreateIndex
CREATE INDEX "ClientWeeklyCall_weekStart_idx"
ON "ClientWeeklyCall"("weekStart");

-- CreateIndex
CREATE INDEX "ClientWeeklyCall_status_weekStart_idx"
ON "ClientWeeklyCall"("status", "weekStart");

-- AddForeignKey
ALTER TABLE "ClientWeeklyCall"
ADD CONSTRAINT "ClientWeeklyCall_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
