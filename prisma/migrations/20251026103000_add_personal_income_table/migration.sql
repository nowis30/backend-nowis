-- CreateTable
CREATE TABLE "PersonalIncome" (
    "id" SERIAL NOT NULL,
    "shareholderId" INTEGER NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "source" TEXT,
    "slipType" TEXT,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonalIncome_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PersonalIncome"
  ADD CONSTRAINT "PersonalIncome_shareholderId_fkey" FOREIGN KEY ("shareholderId")
    REFERENCES "Shareholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "PersonalIncome_shareholderId_taxYear_idx" ON "PersonalIncome"("shareholderId", "taxYear");
