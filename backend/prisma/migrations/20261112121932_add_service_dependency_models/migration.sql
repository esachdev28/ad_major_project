-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "criticality" TEXT NOT NULL DEFAULT 'MEDIUM',
    "ownerTeam" TEXT,
    "endpointId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_dependencies" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "contractVersion" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "services_name_key" ON "services"("name");

-- CreateIndex
CREATE INDEX "services_endpointId_idx" ON "services"("endpointId");

-- CreateIndex
CREATE INDEX "service_dependencies_providerId_idx" ON "service_dependencies"("providerId");

-- CreateIndex
CREATE INDEX "service_dependencies_consumerId_idx" ON "service_dependencies"("consumerId");

-- CreateIndex
CREATE UNIQUE INDEX "service_dependencies_providerId_consumerId_key" ON "service_dependencies"("providerId", "consumerId");

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "api_endpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_dependencies" ADD CONSTRAINT "service_dependencies_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_dependencies" ADD CONSTRAINT "service_dependencies_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
