import { prisma } from '../../lib/prisma';
import { buildSummaryForExport } from '../summaryService';
import { calculateLoanSchedule } from './shareholderLoanService';

function buildRange(year: number) {
  return {
    gte: new Date(Date.UTC(year, 0, 1)),
    lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))
  } as const;
}

export interface AnnualReportData {
  year: number;
  generatedAt: string;
  summary: Awaited<ReturnType<typeof buildSummaryForExport>>;
  corporateTaxes: Array<ReturnType<typeof transformCorporateTax>>;
  personalTaxes: Array<ReturnType<typeof transformPersonalTax>>;
  dividends: Awaited<ReturnType<typeof fetchDividends>>;
  returnsOfCapital: Awaited<ReturnType<typeof fetchRoc>>;
  loans: Awaited<ReturnType<typeof fetchLoans>>;
}

function transformCorporateTax(record: Awaited<ReturnType<typeof fetchCorporateTaxes>>[number]) {
  return {
    id: record.id,
    companyId: record.companyId,
    companyName: record.company.name,
    fiscalYearEnd: record.fiscalYearEnd.toISOString(),
    netIncome: Number(record.netIncome),
    taxableIncome: Number(record.taxableIncome),
    smallBusinessDeduction: Number(record.smallBusinessDeduction),
    federalTax: Number(record.federalTax),
    provincialTax: Number(record.provincialTax),
    rdtohOpening: Number(record.rdtohOpening),
    rdtohClosing: Number(record.rdtohClosing),
    gripOpening: Number(record.gripOpening),
    gripClosing: Number(record.gripClosing),
    cdaOpening: Number(record.cdaOpening),
    cdaClosing: Number(record.cdaClosing),
    refunds: Number(record.refunds ?? 0),
    notes: record.notes ?? null
  };
}

function transformPersonalTax(record: Awaited<ReturnType<typeof fetchPersonalTaxes>>[number]) {
  return {
    id: record.id,
    shareholderId: record.shareholderId,
    shareholderName: record.shareholder.displayName,
    taxYear: record.taxYear,
    employmentIncome: Number(record.employmentIncome ?? 0),
    businessIncome: Number(record.businessIncome ?? 0),
    eligibleDividends: Number(record.eligibleDividends ?? 0),
    nonEligibleDividends: Number(record.nonEligibleDividends ?? 0),
    capitalGains: Number(record.capitalGains ?? 0),
    deductions: Number(record.deductions ?? 0),
    taxableIncome: Number(record.taxableIncome ?? 0),
    federalTax: Number(record.federalTax ?? 0),
    provincialTax: Number(record.provincialTax ?? 0),
    totalCredits: Number(record.totalCredits ?? 0),
    balanceDue: Number(record.balanceDue ?? 0)
  };
}

async function fetchCorporateTaxes(userId: number, year: number) {
  return prisma.corporateTaxReturn.findMany({
    where: {
      company: { userId },
      fiscalYearEnd: buildRange(year)
    },
    include: { company: { select: { name: true } } },
    orderBy: [{ fiscalYearEnd: 'asc' }]
  });
}

async function fetchPersonalTaxes(userId: number, year: number) {
  return prisma.personalTaxReturn.findMany({
    where: {
      taxYear: year,
      shareholder: { userId }
    },
    include: { shareholder: { select: { displayName: true } } },
    orderBy: [{ shareholderId: 'asc' }]
  });
}

async function fetchDividends(userId: number, year: number) {
  const records = await prisma.dividendDeclaration.findMany({
    where: {
      company: { userId },
      declarationDate: buildRange(year)
    },
    include: {
      company: { select: { id: true, name: true } },
      shareholder: { select: { id: true, displayName: true } },
      shareClass: { select: { id: true, code: true } }
    },
    orderBy: [{ declarationDate: 'asc' }, { id: 'asc' }]
  });

  return records.map((record) => ({
    id: record.id,
    companyId: record.companyId,
    companyName: record.company.name,
    shareholderId: record.shareholderId,
    shareholderName: record.shareholder.displayName,
    shareClassCode: record.shareClass?.code ?? null,
    declarationDate: record.declarationDate.toISOString(),
    paymentDate: record.paymentDate ? record.paymentDate.toISOString() : null,
    amount: Number(record.amount),
    grossUpRate: Number(record.grossUpRate),
    grossedAmount: Number(record.grossedAmount),
    federalCredit: Number(record.federalCredit),
    provincialCredit: Number(record.provincialCredit),
    dividendType: record.dividendType,
    notes: record.notes ?? null
  }));
}

async function fetchRoc(userId: number, year: number) {
  const records = await prisma.returnOfCapitalRecord.findMany({
    where: {
      company: { userId },
      transactionDate: buildRange(year)
    },
    include: {
      company: { select: { id: true, name: true } },
      shareholder: { select: { id: true, displayName: true } },
      shareClass: { select: { id: true, code: true } }
    },
    orderBy: [{ transactionDate: 'asc' }, { id: 'asc' }]
  });

  return records.map((record) => ({
    id: record.id,
    companyId: record.companyId,
    companyName: record.company.name,
    shareholderId: record.shareholderId,
    shareholderName: record.shareholder.displayName,
    shareClassCode: record.shareClass?.code ?? null,
    transactionDate: record.transactionDate.toISOString(),
    amount: Number(record.amount),
    previousAcb: record.previousAcb ? Number(record.previousAcb) : null,
    newAcb: record.newAcb ? Number(record.newAcb) : null,
    notes: record.notes ?? null
  }));
}

async function fetchLoans(userId: number) {
  const loans = await prisma.shareholderLoan.findMany({
    where: {
      company: { userId }
    },
    include: {
      company: { select: { id: true, name: true } },
      shareholder: { select: { id: true, displayName: true } },
      payments: true
    },
    orderBy: [{ issuedDate: 'asc' }]
  });

  return loans.map((loan) => ({
    id: loan.id,
    companyId: loan.companyId,
    companyName: loan.company.name,
    shareholderId: loan.shareholderId,
    shareholderName: loan.shareholder.displayName,
    issuedDate: loan.issuedDate.toISOString(),
    dueDate: loan.dueDate ? loan.dueDate.toISOString() : null,
    principal: Number(loan.principal),
    interestRate: Number(loan.interestRate),
    interestMethod: loan.interestMethod,
    notes: loan.notes ?? null,
    schedule: calculateLoanSchedule(loan)
  }));
}

export async function buildAnnualReport(userId: number, year: number): Promise<AnnualReportData> {
  const [summary, corporateTaxesRaw, personalTaxesRaw, dividends, returnsOfCapital, loans] = await Promise.all([
    buildSummaryForExport(userId),
    fetchCorporateTaxes(userId, year),
    fetchPersonalTaxes(userId, year),
    fetchDividends(userId, year),
    fetchRoc(userId, year),
    fetchLoans(userId)
  ]);

  const corporateTaxes = corporateTaxesRaw.map(transformCorporateTax);
  const personalTaxes = personalTaxesRaw.map(transformPersonalTax);

  return {
    year,
    generatedAt: new Date().toISOString(),
    summary,
    corporateTaxes,
    personalTaxes,
    dividends,
    returnsOfCapital,
    loans
  };
}
