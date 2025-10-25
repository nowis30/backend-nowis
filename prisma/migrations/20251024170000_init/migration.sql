-- CreateEnum
CREATE TYPE "DividendType" AS ENUM ('ELIGIBLE', 'NON_ELIGIBLE');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "acquisitionDate" TIMESTAMP(3),
    "purchasePrice" DECIMAL(65,30),
    "currentValue" DECIMAL(65,30),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "neq" TEXT,
    "fiscalYearEnd" TIMESTAMP(3),
    "province" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shareholder" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PERSON',
    "displayName" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shareholder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyShareholder" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "shareholderId" INTEGER NOT NULL,
    "role" TEXT,
    "votingPercent" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyShareholder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareClass" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "hasVotingRights" BOOLEAN NOT NULL DEFAULT true,
    "participatesInGrowth" BOOLEAN NOT NULL DEFAULT true,
    "dividendPolicy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareTransaction" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "shareClassId" INTEGER NOT NULL,
    "shareholderId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "pricePerShare" DECIMAL(65,30),
    "considerationPaid" DECIMAL(65,30),
    "fairMarketValue" DECIMAL(65,30),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorporateStatement" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "statementType" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "isAudited" BOOLEAN NOT NULL DEFAULT false,
    "totalAssets" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalLiabilities" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalEquity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalRevenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalExpenses" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netIncome" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorporateStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorporateStatementLine" (
    "id" SERIAL NOT NULL,
    "statementId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorporateStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorporateResolution" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "resolutionDate" TIMESTAMP(3) NOT NULL,
    "body" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorporateResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DividendDeclaration" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "shareholderId" INTEGER NOT NULL,
    "shareClassId" INTEGER,
    "declarationDate" TIMESTAMP(3) NOT NULL,
    "recordDate" TIMESTAMP(3),
    "paymentDate" TIMESTAMP(3),
    "amount" DECIMAL(65,30) NOT NULL,
    "dividendType" "DividendType" NOT NULL,
    "grossUpRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "grossedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "federalCredit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "provincialCredit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DividendDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnOfCapitalRecord" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "shareholderId" INTEGER NOT NULL,
    "shareClassId" INTEGER,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "previousAcb" DECIMAL(65,30),
    "newAcb" DECIMAL(65,30),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReturnOfCapitalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareholderLoan" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "shareholderId" INTEGER NOT NULL,
    "issuedDate" TIMESTAMP(3) NOT NULL,
    "principal" DECIMAL(65,30) NOT NULL,
    "interestRate" DECIMAL(65,30) NOT NULL,
    "interestMethod" TEXT NOT NULL DEFAULT 'SIMPLE',
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareholderLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareholderLoanPayment" (
    "id" SERIAL NOT NULL,
    "loanId" INTEGER NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "principalPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "interestPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareholderLoanPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorporateTaxReturn" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "fiscalYearEnd" TIMESTAMP(3) NOT NULL,
    "netIncome" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxableIncome" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "smallBusinessDeduction" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "federalTax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "provincialTax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "rdtohOpening" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "rdtohClosing" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "gripOpening" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "gripClosing" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cdaOpening" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cdaClosing" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "refunds" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorporateTaxReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalTaxReturn" (
    "id" SERIAL NOT NULL,
    "shareholderId" INTEGER NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "employmentIncome" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "businessIncome" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "eligibleDividends" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "nonEligibleDividends" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "capitalGains" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "otherCredits" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxableIncome" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "federalTax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "provincialTax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalCredits" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalTaxReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyUnit" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "squareFeet" INTEGER,
    "rentExpected" DECIMAL(65,30),

    CONSTRAINT "PropertyUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mortgage" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "lender" TEXT NOT NULL,
    "principal" DECIMAL(65,30) NOT NULL,
    "rateAnnual" DECIMAL(65,30) NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "amortizationMonths" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "paymentFrequency" INTEGER NOT NULL,
    "paymentAmount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mortgage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Revenue" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'MENSUEL',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Revenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'MENSUEL',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "supplier" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "category" TEXT NOT NULL,
    "gst" DECIMAL(65,30),
    "qst" DECIMAL(65,30),
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepreciationSetting" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "classCode" TEXT NOT NULL,
    "ccaRate" DECIMAL(65,30) NOT NULL,
    "openingUcc" DECIMAL(65,30) NOT NULL,
    "additions" DECIMAL(65,30) NOT NULL,
    "dispositions" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepreciationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "companyId" INTEGER,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "mortgageId" INTEGER,
    "title" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CorporateTaxReturn_companyId_fiscalYearEnd_key" ON "CorporateTaxReturn"("companyId", "fiscalYearEnd");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalTaxReturn_shareholderId_taxYear_key" ON "PersonalTaxReturn"("shareholderId", "taxYear");

-- CreateIndex
CREATE UNIQUE INDEX "DepreciationSetting_propertyId_key" ON "DepreciationSetting"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_companyId_key" ON "UserRole"("userId", "roleId", "companyId");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shareholder" ADD CONSTRAINT "Shareholder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyShareholder" ADD CONSTRAINT "CompanyShareholder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyShareholder" ADD CONSTRAINT "CompanyShareholder_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES "Shareholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareClass" ADD CONSTRAINT "ShareClass_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareTransaction" ADD CONSTRAINT "ShareTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareTransaction" ADD CONSTRAINT "ShareTransaction_shareClassId_fkey" FOREIGN KEY ("shareClassId") REFERENCES "ShareClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareTransaction" ADD CONSTRAINT "ShareTransaction_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES "Shareholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorporateStatement" ADD CONSTRAINT "CorporateStatement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorporateStatementLine" ADD CONSTRAINT "CorporateStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "CorporateStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorporateResolution" ADD CONSTRAINT "CorporateResolution_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DividendDeclaration" ADD CONSTRAINT "DividendDeclaration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DividendDeclaration" ADD CONSTRAINT "DividendDeclaration_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES "Shareholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DividendDeclaration" ADD CONSTRAINT "DividendDeclaration_shareClassId_fkey" FOREIGN KEY ("shareClassId") REFERENCES "ShareClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnOfCapitalRecord" ADD CONSTRAINT "ReturnOfCapitalRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnOfCapitalRecord" ADD CONSTRAINT "ReturnOfCapitalRecord_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES "Shareholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnOfCapitalRecord" ADD CONSTRAINT "ReturnOfCapitalRecord_shareClassId_fkey" FOREIGN KEY ("shareClassId") REFERENCES "ShareClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareholderLoan" ADD CONSTRAINT "ShareholderLoan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareholderLoan" ADD CONSTRAINT "ShareholderLoan_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES "Shareholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareholderLoanPayment" ADD CONSTRAINT "ShareholderLoanPayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "ShareholderLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorporateTaxReturn" ADD CONSTRAINT "CorporateTaxReturn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalTaxReturn" ADD CONSTRAINT "PersonalTaxReturn_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES "Shareholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyUnit" ADD CONSTRAINT "PropertyUnit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mortgage" ADD CONSTRAINT "Mortgage_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revenue" ADD CONSTRAINT "Revenue_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepreciationSetting" ADD CONSTRAINT "DepreciationSetting_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_mortgageId_fkey" FOREIGN KEY ("mortgageId") REFERENCES "Mortgage"("id") ON DELETE SET NULL ON UPDATE CASCADE;


