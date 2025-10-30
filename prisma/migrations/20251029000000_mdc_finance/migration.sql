-- MDC finance extension: journal, loans, leases, generic incomes/expenses

-- JournalEntry
CREATE TABLE "JournalEntry" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "description" TEXT,
  "reference" TEXT,
  "personId" INTEGER,
  "householdId" INTEGER,
  "legalEntityId" INTEGER,
  "companyId" INTEGER,
  "propertyId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

ALTER TABLE "JournalEntry"
  ADD CONSTRAINT "JournalEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "JournalEntry_userId_entryDate_idx" ON "JournalEntry"("userId", "entryDate");
CREATE INDEX "JournalEntry_personId_idx" ON "JournalEntry"("personId");
CREATE INDEX "JournalEntry_householdId_idx" ON "JournalEntry"("householdId");
CREATE INDEX "JournalEntry_legalEntityId_idx" ON "JournalEntry"("legalEntityId");
CREATE INDEX "JournalEntry_companyId_idx" ON "JournalEntry"("companyId");
CREATE INDEX "JournalEntry_propertyId_idx" ON "JournalEntry"("propertyId");

-- JournalEntryLine
CREATE TABLE "JournalEntryLine" (
  "id" SERIAL PRIMARY KEY,
  "entryId" INTEGER NOT NULL,
  "accountCode" TEXT NOT NULL,
  "debit" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "credit" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "memo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

ALTER TABLE "JournalEntryLine"
  ADD CONSTRAINT "JournalEntryLine_entryId_fkey"
  FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "JournalEntryLine_entryId_idx" ON "JournalEntryLine"("entryId");

-- Loan
CREATE TABLE "Loan" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "principal" DECIMAL(65,30) NOT NULL,
  "interestRate" DECIMAL(65,30) NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "maturityDate" TIMESTAMP(3),
  "paymentFrequency" INTEGER NOT NULL DEFAULT 12,
  "personId" INTEGER,
  "householdId" INTEGER,
  "legalEntityId" INTEGER,
  "companyId" INTEGER,
  "propertyId" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

ALTER TABLE "Loan"
  ADD CONSTRAINT "Loan_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Loan_userId_idx" ON "Loan"("userId");
CREATE INDEX "Loan_personId_idx" ON "Loan"("personId");
CREATE INDEX "Loan_householdId_idx" ON "Loan"("householdId");
CREATE INDEX "Loan_legalEntityId_idx" ON "Loan"("legalEntityId");
CREATE INDEX "Loan_companyId_idx" ON "Loan"("companyId");
CREATE INDEX "Loan_propertyId_idx" ON "Loan"("propertyId");

-- Lease
CREATE TABLE "Lease" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "propertyId" INTEGER,
  "unitId" INTEGER,
  "tenantName" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "rentAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

ALTER TABLE "Lease"
  ADD CONSTRAINT "Lease_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Lease_userId_idx" ON "Lease"("userId");
CREATE INDEX "Lease_propertyId_idx" ON "Lease"("propertyId");
CREATE INDEX "Lease_unitId_idx" ON "Lease"("unitId");

-- GenericIncome
CREATE TABLE "GenericIncome" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "category" TEXT,
  "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "incomeDate" TIMESTAMP(3) NOT NULL,
  "personId" INTEGER,
  "householdId" INTEGER,
  "legalEntityId" INTEGER,
  "companyId" INTEGER,
  "propertyId" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

ALTER TABLE "GenericIncome"
  ADD CONSTRAINT "GenericIncome_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "GenericIncome_userId_incomeDate_idx" ON "GenericIncome"("userId", "incomeDate");

-- GenericExpense
CREATE TABLE "GenericExpense" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "category" TEXT,
  "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "expenseDate" TIMESTAMP(3) NOT NULL,
  "personId" INTEGER,
  "householdId" INTEGER,
  "legalEntityId" INTEGER,
  "companyId" INTEGER,
  "propertyId" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

ALTER TABLE "GenericExpense"
  ADD CONSTRAINT "GenericExpense_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "GenericExpense_userId_expenseDate_idx" ON "GenericExpense"("userId", "expenseDate");
