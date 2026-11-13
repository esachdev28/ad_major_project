-- AlterTable
ALTER TABLE "api_endpoints" ADD COLUMN     "failureThreshold" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "lastFailureAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "severity" TEXT NOT NULL DEFAULT 'HIGH';
