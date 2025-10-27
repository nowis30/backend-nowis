-- Profile foundation: expenses, investments, financial goals

-- Personal balance sheet baseline
CREATE TABLE "PersonalAsset" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT,
    "ownerType" TEXT NOT NULL DEFAULT 'PERSONAL',
    "ownerNotes" TEXT,
    "valuation" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "valuationDate" TIMESTAMP(3) NOT NULL,
    "liquidityTag" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "PersonalAsset_userId_valuationDate_idx" ON "PersonalAsset"("userId", "valuationDate");

ALTER TABLE "PersonalAsset"
  ADD CONSTRAINT "PersonalAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PersonalAsset" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TABLE "PersonalLiability" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT,
    "counterparty" TEXT,
    "balance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "interestRate" DECIMAL(65,30),
    "maturityDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "PersonalLiability_userId_idx" ON "PersonalLiability"("userId");

ALTER TABLE "PersonalLiability"
  ADD CONSTRAINT "PersonalLiability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PersonalLiability" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TABLE "FamilyWealthSnapshot" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "totalAssets" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalLiabilities" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netWorth" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "propertyValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "companyValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "trustValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "personalAssetsValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "liquidAssetsValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "personalDebtValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "shareholderLoanValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "FamilyWealthSnapshot_userId_snapshotDate_key" ON "FamilyWealthSnapshot"("userId", "snapshotDate");
CREATE INDEX "FamilyWealthSnapshot_userId_snapshotDate_idx" ON "FamilyWealthSnapshot"("userId", "snapshotDate");

ALTER TABLE "FamilyWealthSnapshot"
  ADD CONSTRAINT "FamilyWealthSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FamilyWealthSnapshot" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TABLE "FamilyWealthScenario" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "scenarioType" TEXT NOT NULL DEFAULT 'BASELINE',
    "parameters" JSONB,
    "results" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "FamilyWealthScenario_userId_scenarioType_idx" ON "FamilyWealthScenario"("userId", "scenarioType");

ALTER TABLE "FamilyWealthScenario"
  ADD CONSTRAINT "FamilyWealthScenario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FamilyWealthScenario" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TABLE "LeveragedBuybackScenario" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER,
    "label" TEXT,
    "loanAmount" DECIMAL(65,30) NOT NULL,
    "interestRate" DECIMAL(65,30) NOT NULL,
    "taxRate" DECIMAL(65,30) NOT NULL,
    "expectedGrowth" DECIMAL(65,30) NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "monthlyPayment" DECIMAL(65,30) NOT NULL,
    "totalInterest" DECIMAL(65,30) NOT NULL,
    "afterTaxInterest" DECIMAL(65,30) NOT NULL,
    "taxShield" DECIMAL(65,30) NOT NULL,
    "projectedShareValue" DECIMAL(65,30) NOT NULL,
    "projectedShareGain" DECIMAL(65,30) NOT NULL,
    "netGain" DECIMAL(65,30) NOT NULL,
    "breakEvenGrowth" DECIMAL(65,30) NOT NULL,
    "returnOnInvestment" DECIMAL(65,30) NOT NULL,
    "paybackYears" DECIMAL(65,30),
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "LeveragedBuybackScenario_userId_idx" ON "LeveragedBuybackScenario"("userId");
CREATE INDEX "LeveragedBuybackScenario_companyId_idx" ON "LeveragedBuybackScenario"("companyId");

ALTER TABLE "LeveragedBuybackScenario"
  ADD CONSTRAINT "LeveragedBuybackScenario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeveragedBuybackScenario"
  ADD CONSTRAINT "LeveragedBuybackScenario_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeveragedBuybackScenario" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Ensure rental tax statements align with cascading deletes
ALTER TABLE "RentalTaxStatement" DROP CONSTRAINT IF EXISTS "RentalTaxStatement_userId_fkey";

ALTER TABLE "RentalTaxStatement"
  ADD CONSTRAINT "RentalTaxStatement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Personal expenses
CREATE TABLE "PersonalExpense" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "essential" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "PersonalExpense_userId_category_idx" ON "PersonalExpense"("userId", "category");

ALTER TABLE "PersonalExpense"
  ADD CONSTRAINT "PersonalExpense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PersonalExpense" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TABLE "InvestmentAccount" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "accountType" TEXT NOT NULL DEFAULT 'TAXABLE',
    "institution" TEXT,
    "accountNumber" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "InvestmentAccount_userId_accountType_idx" ON "InvestmentAccount"("userId", "accountType");

ALTER TABLE "InvestmentAccount"
  ADD CONSTRAINT "InvestmentAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvestmentAccount" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TABLE "InvestmentHolding" (
    "id" SERIAL PRIMARY KEY,
    "accountId" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "bookValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "marketValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "targetAllocation" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "InvestmentHolding_accountId_symbol_idx" ON "InvestmentHolding"("accountId", "symbol");

ALTER TABLE "InvestmentHolding"
  ADD CONSTRAINT "InvestmentHolding_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InvestmentAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvestmentHolding" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TABLE "InvestmentTransaction" (
    "id" SERIAL PRIMARY KEY,
    "accountId" INTEGER NOT NULL,
    "holdingId" INTEGER,
    "transactionType" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "tradeDate" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "fees" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "InvestmentTransaction_accountId_tradeDate_idx" ON "InvestmentTransaction"("accountId", "tradeDate");
CREATE INDEX "InvestmentTransaction_holdingId_idx" ON "InvestmentTransaction"("holdingId");

ALTER TABLE "InvestmentTransaction"
  ADD CONSTRAINT "InvestmentTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InvestmentAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvestmentTransaction"
  ADD CONSTRAINT "InvestmentTransaction_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "InvestmentHolding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvestmentTransaction" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TABLE "FinancialGoal" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "goalType" TEXT NOT NULL DEFAULT 'GENERAL',
    "targetAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "targetDate" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "FinancialGoal_userId_status_idx" ON "FinancialGoal"("userId", "status");

ALTER TABLE "FinancialGoal"
  ADD CONSTRAINT "FinancialGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialGoal" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TABLE "FinancialGoalProgress" (
    "id" SERIAL PRIMARY KEY,
    "goalId" INTEGER NOT NULL,
    "progressDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "FinancialGoalProgress_goalId_progressDate_idx" ON "FinancialGoalProgress"("goalId", "progressDate");

ALTER TABLE "FinancialGoalProgress"
  ADD CONSTRAINT "FinancialGoalProgress_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "FinancialGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialGoalProgress" ALTER COLUMN "updatedAt" DROP DEFAULT;
