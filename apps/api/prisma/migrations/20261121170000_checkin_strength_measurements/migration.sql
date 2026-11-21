ALTER TABLE "StrengthRecord"
ADD COLUMN "checkInId" TEXT,
ADD COLUMN "sets" INTEGER;

ALTER TABLE "ProgressMeasurement"
ADD COLUMN "checkInId" TEXT;

CREATE INDEX "StrengthRecord_checkInId_idx"
ON "StrengthRecord"("checkInId");

CREATE INDEX "ProgressMeasurement_checkInId_idx"
ON "ProgressMeasurement"("checkInId");

ALTER TABLE "StrengthRecord"
ADD CONSTRAINT "StrengthRecord_checkInId_fkey"
FOREIGN KEY ("checkInId")
REFERENCES "CheckIn"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "ProgressMeasurement"
ADD CONSTRAINT "ProgressMeasurement_checkInId_fkey"
FOREIGN KEY ("checkInId")
REFERENCES "CheckIn"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
