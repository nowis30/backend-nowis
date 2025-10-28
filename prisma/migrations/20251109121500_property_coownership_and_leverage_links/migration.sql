-- Co-ownership table
CREATE TABLE "PropertyCoOwner" (
  "id" SERIAL PRIMARY KEY,
  "propertyId" INTEGER NOT NULL,
  "shareholderId" INTEGER NOT NULL,
  "ownershipPercent" DECIMAL(6,3) NOT NULL,
  "priorityReturnCap" DECIMAL(18,2),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "PropertyCoOwner"
  ADD CONSTRAINT "PropertyCoOwner_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyCoOwner"
  ADD CONSTRAINT "PropertyCoOwner_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES "Shareholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PropertyCoOwner_property_shareholder_uidx" ON "PropertyCoOwner" ("propertyId", "shareholderId");
CREATE INDEX "PropertyCoOwner_property_idx" ON "PropertyCoOwner" ("propertyId");
CREATE INDEX "PropertyCoOwner_shareholder_idx" ON "PropertyCoOwner" ("shareholderId");

-- Leverage links to properties (collateral and target)
ALTER TABLE "LeverageScenario" ADD COLUMN "collateralPropertyId" INTEGER;
ALTER TABLE "LeverageScenario" ADD COLUMN "targetPropertyId" INTEGER;

ALTER TABLE "LeverageScenario"
  ADD CONSTRAINT "LeverageScenario_collateralPropertyId_fkey" FOREIGN KEY ("collateralPropertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeverageScenario"
  ADD CONSTRAINT "LeverageScenario_targetPropertyId_fkey" FOREIGN KEY ("targetPropertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "LeverageScenario_collateralProperty_idx" ON "LeverageScenario" ("collateralPropertyId");
CREATE INDEX "LeverageScenario_targetProperty_idx" ON "LeverageScenario" ("targetPropertyId");

-- drop default on updatedAt to align with Prisma updatedAt behavior
ALTER TABLE "PropertyCoOwner" ALTER COLUMN "updatedAt" DROP DEFAULT;
