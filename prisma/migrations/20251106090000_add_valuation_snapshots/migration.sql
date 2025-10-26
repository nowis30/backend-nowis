-- CreateTable
CREATE TABLE "ValuationSnapshot" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER,
    "valuationDate" TIMESTAMP(3) NOT NULL,
    "totals" JSONB NOT NULL,
    "properties" JSONB NOT NULL,
    "shareClasses" JSONB NOT NULL,
    "shareholderEquity" JSONB NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ValuationSnapshot_userId_valuationDate_idx" ON "ValuationSnapshot"("userId", "valuationDate");
CREATE INDEX "ValuationSnapshot_companyId_valuationDate_idx" ON "ValuationSnapshot"("companyId", "valuationDate");

-- AddForeignKey
ALTER TABLE "ValuationSnapshot"
  ADD CONSTRAINT "ValuationSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ValuationSnapshot"
  ADD CONSTRAINT "ValuationSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
