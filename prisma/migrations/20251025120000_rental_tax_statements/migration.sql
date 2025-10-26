-- CreateEnum
CREATE TYPE "RentalTaxFormType" AS ENUM ('T776', 'TP128');

-- CreateTable
CREATE TABLE "RentalTaxStatement" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "propertyId" INTEGER,
    "formType" "RentalTaxFormType" NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "computed" JSONB NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentalTaxStatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RentalTaxStatement_userId_taxYear_idx" ON "RentalTaxStatement"("userId", "taxYear");
CREATE INDEX "RentalTaxStatement_userId_formType_taxYear_idx" ON "RentalTaxStatement"("userId", "formType", "taxYear");
CREATE INDEX "RentalTaxStatement_propertyId_taxYear_idx" ON "RentalTaxStatement"("propertyId", "taxYear");

-- AddForeignKey
ALTER TABLE "RentalTaxStatement" ADD CONSTRAINT "RentalTaxStatement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalTaxStatement" ADD CONSTRAINT "RentalTaxStatement_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
