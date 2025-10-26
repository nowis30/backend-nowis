import { prisma } from '../../lib/prisma';
import { getPersonalIncomeSummary } from '../personalIncomeService';

const FEDERAL_BRACKETS: Array<{ limit: number; rate: number }> = [
  { limit: 53_359, rate: 0.15 },
  { limit: 106_717, rate: 0.205 },
  { limit: 165_430, rate: 0.26 },
  { limit: 235_675, rate: 0.29 },
  { limit: Infinity, rate: 0.33 }
];

const QUEBEC_BRACKETS: Array<{ limit: number; rate: number }> = [
  { limit: 51_780, rate: 0.14 },
  { limit: 103_545, rate: 0.19 },
  { limit: 126_000, rate: 0.24 },
  { limit: Infinity, rate: 0.2575 }
];

const FEDERAL_BASIC_PERSONAL_AMOUNT = 15_305;
const FEDERAL_BASIC_RATE = 0.15;
const QUEBEC_BASIC_PERSONAL_AMOUNT = 18_056;
const QUEBEC_BASIC_RATE = 0.14;

const ELIGIBLE_DIVIDEND_GROSS_UP = 0.38;
const NON_ELIGIBLE_DIVIDEND_GROSS_UP = 0.15;
const ELIGIBLE_DIVIDEND_CREDIT_FED = 0.150198;
const ELIGIBLE_DIVIDEND_CREDIT_QC = 0.1190;
const NON_ELIGIBLE_DIVIDEND_CREDIT_FED = 0.090301;
const NON_ELIGIBLE_DIVIDEND_CREDIT_QC = 0.0483;

function computeProgressive(value: number, brackets: Array<{ limit: number; rate: number }>): number {
  let remaining = value;
  let previousLimit = 0;
  let total = 0;

  for (const bracket of brackets) {
    const upper = bracket.limit;
    const taxableSegment = Math.min(remaining, upper - previousLimit);

    if (taxableSegment <= 0) {
      previousLimit = upper;
      continue;
    }

    total += taxableSegment * bracket.rate;
    remaining -= taxableSegment;
    previousLimit = upper;

    if (remaining <= 0) {
      break;
    }
  }

  return Math.max(0, total);
}

export interface PersonalTaxInput {
  shareholderId: number;
  taxYear: number;
  employmentIncome?: number;
  businessIncome?: number;
  eligibleDividends?: number;
  nonEligibleDividends?: number;
  capitalGains?: number;
  deductions?: number;
  otherCredits?: number;
  province?: string | null;
}

export interface PersonalTaxComputation {
  shareholderId: number;
  taxYear: number;
  taxableIncome: number;
  netIncome: number;
  federalTax: number;
  provincialTax: number;
  totalCredits: number;
  eligibleDividendGrossUp: number;
  nonEligibleDividendGrossUp: number;
  federalDividendCredits: number;
  provincialDividendCredits: number;
  balanceDue: number;
}

function pickProvince(input: string | null | undefined): 'QC' | 'OTHER' {
  if (!input) {
    return 'QC';
  }

  const normalized = input.trim().toUpperCase();
  if (['QC', 'QUEBEC', 'QUÉBEC', 'QUE'].includes(normalized)) {
    return 'QC';
  }

  return 'OTHER';
}

export async function calculatePersonalTaxReturn(input: PersonalTaxInput): Promise<PersonalTaxComputation> {
  if (!input.shareholderId) {
    throw new Error('A shareholder identifier is required to compute personal taxes');
  }

  if (!Number.isFinite(input.taxYear)) {
    throw new Error('A valid tax year is required');
  }

  const shareholder = await prisma.shareholder.findUnique({
    where: { id: input.shareholderId }
  });

  if (!shareholder) {
    throw new Error('Shareholder not found');
  }

  const incomeSummary = await getPersonalIncomeSummary(input.shareholderId, input.taxYear);
  const fallback = incomeSummary.totalsForTax;

  const employmentIncome = Math.max(0, input.employmentIncome ?? fallback.employmentIncome ?? 0);
  const businessIncome = Math.max(0, input.businessIncome ?? fallback.businessIncome ?? 0);
  const eligibleDividends = Math.max(0, input.eligibleDividends ?? fallback.eligibleDividends ?? 0);
  const nonEligibleDividends = Math.max(
    0,
    input.nonEligibleDividends ?? fallback.nonEligibleDividends ?? 0
  );
  const capitalGains = Math.max(0, input.capitalGains ?? fallback.capitalGains ?? 0);
  const deductions = Math.max(0, input.deductions ?? 0);
  const otherCredits = Math.max(0, input.otherCredits ?? 0);

  const eligibleDividendGrossUp = eligibleDividends * ELIGIBLE_DIVIDEND_GROSS_UP;
  const nonEligibleDividendGrossUp = nonEligibleDividends * NON_ELIGIBLE_DIVIDEND_GROSS_UP;

  const dividendTaxablePortion = eligibleDividends + eligibleDividendGrossUp +
    nonEligibleDividends + nonEligibleDividendGrossUp;
  const capitalGainsTaxable = capitalGains * 0.5;

  const totalIncome = employmentIncome + businessIncome + dividendTaxablePortion + capitalGainsTaxable;
  const netIncome = totalIncome;
  const taxableIncomeBeforeDeductions = totalIncome;
  const taxableIncome = Math.max(0, taxableIncomeBeforeDeductions - deductions);

  const province = pickProvince(input.province ?? shareholder.notes ?? null);
  const federalTaxBeforeCredits = computeProgressive(taxableIncome, FEDERAL_BRACKETS);
  const provincialBrackets = province === 'QC' ? QUEBEC_BRACKETS : QUEBEC_BRACKETS;
  const provincialTaxBeforeCredits = computeProgressive(taxableIncome, provincialBrackets);

  const federalDividendCredits = eligibleDividendGrossUp * ELIGIBLE_DIVIDEND_CREDIT_FED +
    nonEligibleDividendGrossUp * NON_ELIGIBLE_DIVIDEND_CREDIT_FED;
  const provincialDividendCredits = eligibleDividendGrossUp * ELIGIBLE_DIVIDEND_CREDIT_QC +
    nonEligibleDividendGrossUp * NON_ELIGIBLE_DIVIDEND_CREDIT_QC;

  const federalBasicCredit = FEDERAL_BASIC_PERSONAL_AMOUNT * FEDERAL_BASIC_RATE;
  const provincialBasicCredit = QUEBEC_BASIC_PERSONAL_AMOUNT * QUEBEC_BASIC_RATE;

  const federalTax = Math.max(0, federalTaxBeforeCredits - (federalBasicCredit + federalDividendCredits + otherCredits * 0.5));
  const provincialTax = Math.max(0, provincialTaxBeforeCredits - (provincialBasicCredit + provincialDividendCredits + otherCredits * 0.5));

  const totalCredits = federalBasicCredit + provincialBasicCredit + federalDividendCredits + provincialDividendCredits + otherCredits;
  const balanceDue = federalTax + provincialTax;

  await prisma.personalTaxReturn.upsert({
    where: {
      shareholderId_taxYear: {
        shareholderId: input.shareholderId,
        taxYear: input.taxYear
      }
    },
    create: {
      shareholderId: input.shareholderId,
      taxYear: input.taxYear,
      employmentIncome,
      businessIncome,
      eligibleDividends,
      nonEligibleDividends,
      capitalGains,
      deductions,
      otherCredits,
      taxableIncome,
      federalTax,
      provincialTax,
      totalCredits,
      balanceDue
    },
    update: {
      employmentIncome,
      businessIncome,
      eligibleDividends,
      nonEligibleDividends,
      capitalGains,
      deductions,
      otherCredits,
      taxableIncome,
      federalTax,
      provincialTax,
      totalCredits,
      balanceDue
    }
  });

  return {
    shareholderId: input.shareholderId,
    taxYear: input.taxYear,
    taxableIncome,
    netIncome,
    federalTax,
    provincialTax,
    totalCredits,
    eligibleDividendGrossUp,
    nonEligibleDividendGrossUp,
    federalDividendCredits,
    provincialDividendCredits,
    balanceDue
  };
}
