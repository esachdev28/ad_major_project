-- AlterTable
ALTER TABLE "api_versions" ADD COLUMN     "format" TEXT NOT NULL DEFAULT 'JSON',
ADD COLUMN     "specHash" TEXT,
ADD COLUMN     "title" TEXT;

-- CreateIndex
CREATE INDEX "api_versions_specHash_idx" ON "api_versions"("specHash");
