-- DropForeignKey
ALTER TABLE IF EXISTS "AdvisorConversation" DROP CONSTRAINT IF EXISTS "AdvisorConversation_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "AdvisorConversationStep" DROP CONSTRAINT IF EXISTS "AdvisorConversationStep_conversationId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "AlertEvent" DROP CONSTRAINT IF EXISTS "AlertEvent_ruleId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "AlertEvent" DROP CONSTRAINT IF EXISTS "AlertEvent_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "AlertRule" DROP CONSTRAINT IF EXISTS "AlertRule_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "LeverageScenario" DROP CONSTRAINT IF EXISTS "LeverageScenario_companyId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "LeverageScenario" DROP CONSTRAINT IF EXISTS "LeverageScenario_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Notification" DROP CONSTRAINT IF EXISTS "Notification_eventId_fkey";

-- AlterTable
ALTER TABLE IF EXISTS "AdvisorConversation" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "AlertEvent" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "AlertRule" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "FreezeSimulationDividend" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "FreezeSimulationRedemption" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "LeverageScenario" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "Notification" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "PersonalIncome" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "PersonalTaxReturnLine" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE IF EXISTS "Shareholder" ADD COLUMN IF NOT EXISTS "personId" INTEGER;

-- AlterTable
ALTER TABLE IF EXISTS "TaxSlipLine" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE IF EXISTS "ValuationSnapshot" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Person" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "displayName" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "sinHash" TEXT,
    "gender" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Household" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdMember" (
    "id" SERIAL NOT NULL,
    "householdId" INTEGER NOT NULL,
    "personId" INTEGER NOT NULL,
    "relationship" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalEntity" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "jurisdiction" TEXT,
    "companyId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalEntity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Person_userId_idx" ON "Person"("userId");

-- CreateIndex
CREATE INDEX "Household_userId_year_idx" ON "Household"("userId", "year");

-- CreateIndex
CREATE INDEX "HouseholdMember_personId_idx" ON "HouseholdMember"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMember_householdId_personId_key" ON "HouseholdMember"("householdId", "personId");

-- CreateIndex
CREATE INDEX "LegalEntity_userId_idx" ON "LegalEntity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LegalEntity_companyId_key" ON "LegalEntity"("companyId");

-- CreateIndex
CREATE INDEX "Shareholder_personId_idx" ON "Shareholder"("personId");

-- AddForeignKey
ALTER TABLE IF EXISTS "Person" ADD CONSTRAINT "Person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Household" ADD CONSTRAINT "Household_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "HouseholdMember" ADD CONSTRAINT "HouseholdMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "HouseholdMember" ADD CONSTRAINT "HouseholdMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "LegalEntity" ADD CONSTRAINT "LegalEntity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "LegalEntity" ADD CONSTRAINT "LegalEntity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Shareholder" ADD CONSTRAINT "Shareholder_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "LeverageScenario" ADD CONSTRAINT "LeverageScenario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "LeverageScenario" ADD CONSTRAINT "LeverageScenario_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "AdvisorConversation" ADD CONSTRAINT "AdvisorConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "AdvisorConversationStep" ADD CONSTRAINT "AdvisorConversationStep_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AdvisorConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "AlertRule" ADD CONSTRAINT "AlertRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "AlertEvent" ADD CONSTRAINT "AlertEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "AlertEvent" ADD CONSTRAINT "AlertEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Notification" ADD CONSTRAINT "Notification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "AlertEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX IF EXISTS "LeverageScenario_collateralProperty_idx" RENAME TO "LeverageScenario_collateralPropertyId_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "LeverageScenario_targetProperty_idx" RENAME TO "LeverageScenario_targetPropertyId_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "PersonalTaxReturnLine_return_section_idx" RENAME TO "PersonalTaxReturnLine_returnId_section_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "PropertyCoOwner_property_idx" RENAME TO "PropertyCoOwner_propertyId_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "PropertyCoOwner_property_shareholder_uidx" RENAME TO "PropertyCoOwner_propertyId_shareholderId_key";

-- RenameIndex
ALTER INDEX IF EXISTS "PropertyCoOwner_shareholder_idx" RENAME TO "PropertyCoOwner_shareholderId_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TaxSlip_return_idx" RENAME TO "TaxSlip_returnId_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TaxSlipLine_slip_idx" RENAME TO "TaxSlipLine_slipId_idx";
