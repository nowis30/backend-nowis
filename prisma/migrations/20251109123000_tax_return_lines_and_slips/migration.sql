-- Extend PersonalTaxReturn with document link and raw extraction
ALTER TABLE "PersonalTaxReturn" ADD COLUMN "documentId" INTEGER;
ALTER TABLE "PersonalTaxReturn" ADD COLUMN "rawExtraction" JSONB;
ALTER TABLE "PersonalTaxReturn"
  ADD CONSTRAINT "PersonalTaxReturn_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "UploadedDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- TaxSection enum
DO $$ BEGIN
  CREATE TYPE "TaxSection" AS ENUM ('INCOME','DEDUCTION','CREDIT','CARRYFORWARD','PAYMENT','OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- PersonalTaxReturnLine
CREATE TABLE "PersonalTaxReturnLine" (
  "id" SERIAL PRIMARY KEY,
  "returnId" INTEGER NOT NULL,
  "section" "TaxSection" NOT NULL,
  "code" TEXT,
  "label" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "PersonalTaxReturnLine"
  ADD CONSTRAINT "PersonalTaxReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "PersonalTaxReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "PersonalTaxReturnLine_return_section_idx" ON "PersonalTaxReturnLine" ("returnId","section");
ALTER TABLE "PersonalTaxReturnLine" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- TaxSlip
CREATE TABLE "TaxSlip" (
  "id" SERIAL PRIMARY KEY,
  "returnId" INTEGER NOT NULL,
  "slipType" TEXT NOT NULL,
  "issuer" TEXT,
  "accountNumber" TEXT,
  "documentId" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "TaxSlip"
  ADD CONSTRAINT "TaxSlip_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "PersonalTaxReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaxSlip"
  ADD CONSTRAINT "TaxSlip_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "UploadedDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "TaxSlip_return_idx" ON "TaxSlip" ("returnId");
ALTER TABLE "TaxSlip" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- TaxSlipLine
CREATE TABLE "TaxSlipLine" (
  "id" SERIAL PRIMARY KEY,
  "slipId" INTEGER NOT NULL,
  "code" TEXT,
  "label" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "TaxSlipLine"
  ADD CONSTRAINT "TaxSlipLine_slipId_fkey" FOREIGN KEY ("slipId") REFERENCES "TaxSlip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "TaxSlipLine_slip_idx" ON "TaxSlipLine" ("slipId");
ALTER TABLE "TaxSlipLine" ALTER COLUMN "updatedAt" DROP DEFAULT;
