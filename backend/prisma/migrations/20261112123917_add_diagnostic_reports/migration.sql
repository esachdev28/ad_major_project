-- CreateTable
CREATE TABLE "diagnostic_reports" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT,
    "incidentId" TEXT,
    "query" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "verifiedFacts" TEXT NOT NULL,
    "hypotheses" TEXT NOT NULL,
    "recommendations" TEXT NOT NULL,
    "evidenceContext" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostic_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "diagnostic_reports_endpointId_idx" ON "diagnostic_reports"("endpointId");

-- CreateIndex
CREATE INDEX "diagnostic_reports_createdAt_idx" ON "diagnostic_reports"("createdAt");

-- AddForeignKey
ALTER TABLE "diagnostic_reports" ADD CONSTRAINT "diagnostic_reports_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "api_endpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;
