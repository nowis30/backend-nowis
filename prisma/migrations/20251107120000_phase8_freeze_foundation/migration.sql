-- Phase 8 freeze planning foundational tables

-- Ensure FamilyTrust base structure exists for new relations
CREATE TABLE IF NOT EXISTS "FamilyTrust" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "shareholderId" INTEGER UNIQUE,
  "name" TEXT NOT NULL,
  "establishedOn" TIMESTAMP(3),
  "netAssetValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "mandate" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "FamilyTrust_userId_idx" ON "FamilyTrust"("userId");

DO $$
BEGIN
  ALTER TABLE "FamilyTrust"
    ADD CONSTRAINT "FamilyTrust_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "FamilyTrust"
    ADD CONSTRAINT "FamilyTrust_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES "Shareholder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "FamilyTrust" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Shareholder enhancements
ALTER TABLE "Shareholder" ADD COLUMN IF NOT EXISTS "lifetimeCapitalGainsExemptionRemaining" DECIMAL(65,30);

-- Family trust participants
CREATE TABLE "FamilyTrustFiduciary" (
    "id" SERIAL PRIMARY KEY,
    "trustId" INTEGER NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "FamilyTrustFiduciary_trustId_idx" ON "FamilyTrustFiduciary"("trustId");

ALTER TABLE "FamilyTrustFiduciary"
  ADD CONSTRAINT "FamilyTrustFiduciary_trustId_fkey" FOREIGN KEY ("trustId") REFERENCES "FamilyTrust"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FamilyTrustBeneficiary" (
    "id" SERIAL PRIMARY KEY,
    "trustId" INTEGER NOT NULL,
    "shareholderId" INTEGER,
    "displayName" TEXT NOT NULL,
    "relationship" TEXT,
    "birthDate" TIMESTAMP(3),
    "preferredAllocationPercent" DECIMAL(65,30),
    "lifetimeCapitalGainsExemptionClaimed" DECIMAL(65,30),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "FamilyTrustBeneficiary_trustId_idx" ON "FamilyTrustBeneficiary"("trustId");
CREATE INDEX "FamilyTrustBeneficiary_shareholderId_idx" ON "FamilyTrustBeneficiary"("shareholderId");

ALTER TABLE "FamilyTrustBeneficiary"
  ADD CONSTRAINT "FamilyTrustBeneficiary_trustId_fkey" FOREIGN KEY ("trustId") REFERENCES "FamilyTrust"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FamilyTrustBeneficiary"
  ADD CONSTRAINT "FamilyTrustBeneficiary_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES "Shareholder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Freeze asset catalogue
CREATE TABLE "FreezeAsset" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "assetType" TEXT NOT NULL DEFAULT 'PROPERTY',
    "fairMarketValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "adjustedCostBase" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "annualGrowthPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "distributionYieldPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "associatedDebt" DECIMAL(65,30),
    "companyId" INTEGER,
    "propertyId" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "FreezeAsset_userId_idx" ON "FreezeAsset"("userId");
CREATE INDEX "FreezeAsset_companyId_idx" ON "FreezeAsset"("companyId");
CREATE INDEX "FreezeAsset_propertyId_idx" ON "FreezeAsset"("propertyId");

ALTER TABLE "FreezeAsset"
  ADD CONSTRAINT "FreezeAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FreezeAsset"
  ADD CONSTRAINT "FreezeAsset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FreezeAsset"
  ADD CONSTRAINT "FreezeAsset_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Freeze scenarios
CREATE TABLE "FreezeScenario" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "trustId" INTEGER,
    "label" TEXT NOT NULL,
    "baseYear" INTEGER NOT NULL,
    "freezeRatePercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "preferredDividendRatePercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "redemptionYears" INTEGER NOT NULL DEFAULT 20,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "FreezeScenario_userId_idx" ON "FreezeScenario"("userId");
CREATE INDEX "FreezeScenario_trustId_idx" ON "FreezeScenario"("trustId");

ALTER TABLE "FreezeScenario"
  ADD CONSTRAINT "FreezeScenario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FreezeScenario"
  ADD CONSTRAINT "FreezeScenario_trustId_fkey" FOREIGN KEY ("trustId") REFERENCES "FamilyTrust"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "FreezeScenarioAsset" (
    "id" SERIAL PRIMARY KEY,
    "scenarioId" INTEGER NOT NULL,
    "assetId" INTEGER NOT NULL,
    "inclusionPercent" DECIMAL(65,30) NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "FreezeScenarioAsset_scenarioId_assetId_key" ON "FreezeScenarioAsset"("scenarioId", "assetId");
CREATE INDEX "FreezeScenarioAsset_assetId_idx" ON "FreezeScenarioAsset"("assetId");

ALTER TABLE "FreezeScenarioAsset"
  ADD CONSTRAINT "FreezeScenarioAsset_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "FreezeScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FreezeScenarioAsset"
  ADD CONSTRAINT "FreezeScenarioAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FreezeAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Simulations
CREATE TABLE "FreezeSimulation" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "scenarioId" INTEGER NOT NULL,
    "targetFreezeYear" INTEGER NOT NULL,
    "generations" INTEGER NOT NULL,
    "reinvestmentRatePercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "marginalTaxRatePercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "dividendRetentionPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "FreezeSimulation_userId_idx" ON "FreezeSimulation"("userId");
CREATE INDEX "FreezeSimulation_scenarioId_idx" ON "FreezeSimulation"("scenarioId");

ALTER TABLE "FreezeSimulation"
  ADD CONSTRAINT "FreezeSimulation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FreezeSimulation"
  ADD CONSTRAINT "FreezeSimulation_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "FreezeScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FreezeSimulationResult" (
    "id" SERIAL PRIMARY KEY,
    "simulationId" INTEGER NOT NULL,
    "preferredShareValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "capitalGainTriggered" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "capitalGainTax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalDividends" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalAfterTaxRetained" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "latentTaxBefore" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "latentTaxAfter" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "FreezeSimulationResult_simulationId_key" ON "FreezeSimulationResult"("simulationId");

ALTER TABLE "FreezeSimulationResult"
  ADD CONSTRAINT "FreezeSimulationResult_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "FreezeSimulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FreezeSimulationBeneficiaryResult" (
    "id" SERIAL PRIMARY KEY,
    "simulationId" INTEGER NOT NULL,
    "beneficiaryId" INTEGER,
    "beneficiaryName" TEXT NOT NULL,
    "cumulativeValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "FreezeSimulationBeneficiaryResult_simulationId_idx" ON "FreezeSimulationBeneficiaryResult"("simulationId");
CREATE INDEX "FreezeSimulationBeneficiaryResult_beneficiaryId_idx" ON "FreezeSimulationBeneficiaryResult"("beneficiaryId");

ALTER TABLE "FreezeSimulationBeneficiaryResult"
  ADD CONSTRAINT "FreezeSimulationBeneficiaryResult_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "FreezeSimulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FreezeSimulationBeneficiaryResult"
  ADD CONSTRAINT "FreezeSimulationBeneficiaryResult_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "FamilyTrustBeneficiary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "FreezeSimulationRedemption" (
    "id" SERIAL PRIMARY KEY,
    "simulationId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "outstanding" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "redeemed" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "FreezeSimulationRedemption_simulationId_idx" ON "FreezeSimulationRedemption"("simulationId");

ALTER TABLE "FreezeSimulationRedemption"
  ADD CONSTRAINT "FreezeSimulationRedemption_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "FreezeSimulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FreezeSimulationDividend" (
    "id" SERIAL PRIMARY KEY,
    "simulationId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "afterTaxRetained" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "FreezeSimulationDividend_simulationId_idx" ON "FreezeSimulationDividend"("simulationId");

ALTER TABLE "FreezeSimulationDividend"
  ADD CONSTRAINT "FreezeSimulationDividend_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "FreezeSimulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
