import { Prisma } from '@prisma/client';

import { prisma } from '../../lib/prisma';

const FEDERAL_SMALL_BUSINESS_LIMIT = 500_000;
const FEDERAL_SMALL_BUSINESS_RATE = 0.09;
const FEDERAL_GENERAL_RATE = 0.15;
const FEDERAL_DIVIDEND_REFUND_RATE_ELIGIBLE = 0.3833;
const FEDERAL_DIVIDEND_REFUND_RATE_NON_ELIGIBLE = 0.3010;
const GRIP_ALLOCATION_FACTOR = 0.72;

interface ProvincialRateProfile {
  smallBusinessRate: number;
  generalRate: number;
  dividendRefundEligible: number;
  dividendRefundNonEligible: number;
}

const DEFAULT_PROVINCIAL_PROFILE: ProvincialRateProfile = {
  smallBusinessRate: 0.03,
  generalRate: 0.11,
  dividendRefundEligible: 0.2056,
  dividendRefundNonEligible: 0.2000
};

const QUEBEC_PROFILE: ProvincialRateProfile = {
  smallBusinessRate: 0.032,
  generalRate: 0.116,
  dividendRefundEligible: 0.1192,
  dividendRefundNonEligible: 0.0483
};

type DecimalLike = Prisma.Decimal | number | bigint | string | null | undefined;

function toNumber(input: DecimalLike): number {
  if (input === null || input === undefined) {
    return 0;
  }

  if (input instanceof Prisma.Decimal) {
    return input.toNumber();
  }

  if (typeof input === 'bigint') {
    return Number(input);
  }

  if (typeof input === 'object' && input !== null) {
    const candidate = input as { toNumber?: () => number; valueOf?: () => unknown };

    if (typeof candidate.toNumber === 'function') {
      const parsed = candidate.toNumber();
      return Number.isFinite(parsed) ? parsed : 0;
    }

    if (typeof candidate.valueOf === 'function') {
      const rawValue = candidate.valueOf();
      const parsed = typeof rawValue === 'number' ? rawValue : Number(rawValue);
      return Number.isFinite(parsed) ? parsed : 0;
    }
  }

  if (typeof input === 'string') {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return Number.isFinite(input) ? input : 0;
}

function progressiveTax(amount: number, rateA: number, rateB: number, threshold: number): { onSmallBusiness: number; onExcess: number } {
  const onSmallBusiness = Math.min(amount, threshold);
  const onExcess = Math.max(0, amount - threshold);

  return {
    onSmallBusiness: onSmallBusiness * rateA,
    onExcess: onExcess * rateB
  };
}

function pickProvincialProfile(province: string | null | undefined): ProvincialRateProfile {
  if (!province) {
    return DEFAULT_PROVINCIAL_PROFILE;
  }

  const normalized = province.trim().toUpperCase();
  if (['QC', 'QUEBEC', 'QUÉBEC', 'QUE'].includes(normalized)) {
    return QUEBEC_PROFILE;
  }

  return DEFAULT_PROVINCIAL_PROFILE;
}

export interface CorporateTaxComputation {
  companyId: number;
  fiscalYearEnd: string;
  netIncome: number;
  taxableIncome: number;
  smallBusinessDeduction: number;
  federalTax: number;
  provincialTax: number;
  eligibleDividendsPaid: number;
  nonEligibleDividendsPaid: number;
  dividendRefundFederal: number;
  dividendRefundProvincial: number;
  rdtohOpening: number;
  rdtohClosing: number;
  gripOpening: number;
  gripClosing: number;
  cdaOpening: number;
  cdaClosing: number;
  notes?: string | null;
}

export async function calculateCorporateTaxReturn(companyId: number, fiscalYearEndInput: Date): Promise<CorporateTaxComputation> {
  const fiscalYearEnd = new Date(fiscalYearEndInput);
  if (Number.isNaN(fiscalYearEnd.getTime())) {
    throw new Error('Invalid fiscal year end supplied to corporate tax engine');
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      statements: {
        where: { periodEnd: { lte: fiscalYearEnd } },
        include: { lines: true },
        orderBy: { periodEnd: 'desc' }
      }
    }
  });

  if (!company) {
    throw new Error('Company not found');
  }

  const latestStatement = company.statements[0] ?? null;
  const fiscalYearStart = new Date(Date.UTC(fiscalYearEnd.getUTCFullYear(), 0, 1));

  const dividendDeclarations = await prisma.dividendDeclaration.findMany({
    where: {
      companyId,
      declarationDate: {
        gte: fiscalYearStart,
        lte: fiscalYearEnd
      }
    }
  });

  const eligibleDividendsPaid = dividendDeclarations
    .filter((record) => record.dividendType === 'ELIGIBLE')
    .reduce<number>((total, record) => total + toNumber(record.amount), 0);

  const nonEligibleDividendsPaid = dividendDeclarations
    .filter((record) => record.dividendType === 'NON_ELIGIBLE')
    .reduce<number>((total, record) => total + toNumber(record.amount), 0);

  const previousReturn = await prisma.corporateTaxReturn.findFirst({
    where: { companyId },
    orderBy: { fiscalYearEnd: 'desc' }
  });

  const rdtohOpening = toNumber(previousReturn?.rdtohClosing);
  const gripOpening = toNumber(previousReturn?.gripClosing);
  const cdaOpening = toNumber(previousReturn?.cdaClosing);

  const netIncome = Math.max(0, toNumber(latestStatement?.netIncome));
  const taxableIncome = Math.max(0, toNumber(latestStatement?.totalRevenue) - toNumber(latestStatement?.totalExpenses));
  const effectiveTaxableIncome = taxableIncome > 0 ? taxableIncome : netIncome;

  const provincialProfile = pickProvincialProfile(company.province);

  const federalTaxBreakdown = progressiveTax(
    effectiveTaxableIncome,
    FEDERAL_SMALL_BUSINESS_RATE,
    FEDERAL_GENERAL_RATE,
    FEDERAL_SMALL_BUSINESS_LIMIT
  );

  const provincialTaxBreakdown = progressiveTax(
    effectiveTaxableIncome,
    provincialProfile.smallBusinessRate,
    provincialProfile.generalRate,
    FEDERAL_SMALL_BUSINESS_LIMIT
  );

  const federalTax = federalTaxBreakdown.onSmallBusiness + federalTaxBreakdown.onExcess;
  const provincialTax = provincialTaxBreakdown.onSmallBusiness + provincialTaxBreakdown.onExcess;

  const federalGeneralTaxIfNoDeduction = effectiveTaxableIncome * FEDERAL_GENERAL_RATE;
  const federalSmallBusinessTax = federalTaxBreakdown.onSmallBusiness;
  const smallBusinessDeduction = Math.max(0, federalGeneralTaxIfNoDeduction - (federalSmallBusinessTax + federalTaxBreakdown.onExcess));

  const dividendRefundFederal = eligibleDividendsPaid * FEDERAL_DIVIDEND_REFUND_RATE_ELIGIBLE +
    nonEligibleDividendsPaid * FEDERAL_DIVIDEND_REFUND_RATE_NON_ELIGIBLE;
  const dividendRefundProvincial = eligibleDividendsPaid * provincialProfile.dividendRefundEligible +
    nonEligibleDividendsPaid * provincialProfile.dividendRefundNonEligible;

  const rdtohClosing = Math.max(0, rdtohOpening - dividendRefundFederal);
  const gripIncrement = Math.max(0, (effectiveTaxableIncome - Math.min(effectiveTaxableIncome, FEDERAL_SMALL_BUSINESS_LIMIT)) * GRIP_ALLOCATION_FACTOR);
  const gripClosing = Math.max(0, gripOpening + gripIncrement - eligibleDividendsPaid);

  const capitalGainLines = latestStatement?.lines.filter((line) =>
    line.category.toLowerCase().includes('gain') || line.label.toLowerCase().includes('gain')
  ) ?? [];
  const capitalGains = capitalGainLines.reduce<number>((total, line) => total + toNumber(line.amount), 0);
  const cdaClosing = Math.max(0, cdaOpening + capitalGains * 0.5 - Math.max(0, eligibleDividendsPaid - gripIncrement));

  const computation: CorporateTaxComputation = {
    companyId,
    fiscalYearEnd: fiscalYearEnd.toISOString(),
    netIncome,
    taxableIncome: effectiveTaxableIncome,
    smallBusinessDeduction,
    federalTax,
    provincialTax,
    eligibleDividendsPaid,
    nonEligibleDividendsPaid,
    dividendRefundFederal,
    dividendRefundProvincial,
    rdtohOpening,
    rdtohClosing,
    gripOpening,
    gripClosing,
    cdaOpening,
    cdaClosing,
    notes: latestStatement?.metadata ?? null
  };

  await prisma.corporateTaxReturn.upsert({
    where: {
      companyId_fiscalYearEnd: {
        companyId,
        fiscalYearEnd
      }
    },
    create: {
      companyId,
      fiscalYearEnd,
      netIncome,
      taxableIncome: computation.taxableIncome,
      smallBusinessDeduction,
      federalTax,
      provincialTax,
      rdtohOpening,
      rdtohClosing,
      gripOpening,
      gripClosing,
      cdaOpening,
      cdaClosing,
      refunds: dividendRefundFederal,
      notes: computation.notes ?? null
    },
    update: {
      netIncome,
      taxableIncome: computation.taxableIncome,
      smallBusinessDeduction,
      federalTax,
      provincialTax,
      rdtohOpening,
      rdtohClosing,
      gripOpening,
      gripClosing,
      cdaOpening,
      cdaClosing,
      refunds: dividendRefundFederal,
      notes: computation.notes ?? null
    }
  });

  return computation;
}
