-- Fiscal to accounting mapping table
CREATE TABLE IF NOT EXISTS "TaxLineToAccountMap" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER,
  "form" TEXT NOT NULL,
  "jurisdiction" TEXT,
  "lineCode" TEXT NOT NULL,
  "lineLabel" TEXT,
  "accountCode" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "TaxLineToAccountMap_userId_form_jurisdiction_lineCode_key"
  ON "TaxLineToAccountMap" ("userId", "form", "jurisdiction", "lineCode");

CREATE INDEX IF NOT EXISTS "TaxLineToAccountMap_form_jurisdiction_idx"
  ON "TaxLineToAccountMap" ("form", "jurisdiction");
