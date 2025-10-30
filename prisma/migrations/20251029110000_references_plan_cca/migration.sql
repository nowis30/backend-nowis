-- CreateIndex on JournalEntryLine.accountCode for faster lookups
CREATE INDEX IF NOT EXISTS "JournalEntryLine_accountCode_idx" ON "JournalEntryLine" ("accountCode");

-- Create Account reference table
CREATE TABLE IF NOT EXISTS "Account" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "parentCode" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Unique (userId, code)
CREATE UNIQUE INDEX IF NOT EXISTS "Account_userId_code_key" ON "Account" ("userId", "code");
CREATE INDEX IF NOT EXISTS "Account_type_idx" ON "Account" ("type");

-- Foreign key to User (nullable)
ALTER TABLE "Account"
  ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL;

-- Create CCAClass reference table
CREATE TABLE IF NOT EXISTS "CCAClass" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER,
  "classCode" TEXT NOT NULL,
  "description" TEXT,
  "rate" DECIMAL(8,5) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Unique (userId, classCode)
CREATE UNIQUE INDEX IF NOT EXISTS "CCAClass_userId_classCode_key" ON "CCAClass" ("userId", "classCode");

-- Foreign key to User (nullable)
ALTER TABLE "CCAClass"
  ADD CONSTRAINT "CCAClass_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL;
