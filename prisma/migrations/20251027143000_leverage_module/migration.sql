-- CreateEnum
CREATE TYPE "LeverageSourceType" AS ENUM ('HOME_EQUITY', 'RENTAL_PROPERTY', 'HELOC', 'CORPORATE_LOAN');

-- CreateEnum
CREATE TYPE "LeverageInvestmentVehicle" AS ENUM ('ETF', 'STOCK', 'REALESTATE', 'BUSINESS', 'FUND');

-- CreateTable
CREATE TABLE "LeverageScenario" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER,
    "label" TEXT NOT NULL,
    "sourceType" "LeverageSourceType" NOT NULL,
    "principal" DECIMAL(18,2) NOT NULL,
    "rateAnnual" DECIMAL(5,4) NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "amortizationMonths" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "interestDeductible" BOOLEAN NOT NULL DEFAULT false,
    "investmentVehicle" "LeverageInvestmentVehicle" NOT NULL,
    "expectedReturnAnnual" DECIMAL(5,4) NOT NULL,
    "expectedVolatility" DECIMAL(5,4),
    "planHorizonYears" INTEGER NOT NULL DEFAULT 10,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "LeverageScenario_userId_idx" ON "LeverageScenario"("userId");
CREATE INDEX "LeverageScenario_companyId_idx" ON "LeverageScenario"("companyId");

-- AddForeignKey
ALTER TABLE "LeverageScenario"
  ADD CONSTRAINT "LeverageScenario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

ALTER TABLE "LeverageScenario"
  ADD CONSTRAINT "LeverageScenario_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL;

-- Trigger to auto-update updatedAt (Postgres)
CREATE OR REPLACE FUNCTION leverage_scenario_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leverage_scenario_set_updated_at
BEFORE UPDATE ON "LeverageScenario"
FOR EACH ROW EXECUTE FUNCTION leverage_scenario_set_updated_at();
