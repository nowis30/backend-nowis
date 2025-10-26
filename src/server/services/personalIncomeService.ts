import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';

export const PERSONAL_INCOME_CATEGORIES = [
  'EMPLOYMENT',
  'PENSION',
  'OAS',
  'CPP_QPP',
  'RRIF_RRSP',
  'BUSINESS',
  'ELIGIBLE_DIVIDEND',
  'NON_ELIGIBLE_DIVIDEND',
  'CAPITAL_GAIN',
  'OTHER'
] as const;

export type PersonalIncomeCategory = (typeof PERSONAL_INCOME_CATEGORIES)[number];

const EMPLOYMENT_BUCKET = new Set<PersonalIncomeCategory>([
  'EMPLOYMENT',
  'PENSION',
  'OAS',
  'CPP_QPP',
  'RRIF_RRSP',
  'OTHER'
]);

const BUSINESS_BUCKET = new Set<PersonalIncomeCategory>(['BUSINESS']);
const ELIGIBLE_DIVIDEND_BUCKET = new Set<PersonalIncomeCategory>(['ELIGIBLE_DIVIDEND']);
const NON_ELIGIBLE_DIVIDEND_BUCKET = new Set<PersonalIncomeCategory>(['NON_ELIGIBLE_DIVIDEND']);
const CAPITAL_GAIN_BUCKET = new Set<PersonalIncomeCategory>(['CAPITAL_GAIN']);

export interface PersonalIncomeSummary {
  totalsByCategory: Record<PersonalIncomeCategory, number>;
  totalsForTax: {
    employmentIncome: number;
    businessIncome: number;
    eligibleDividends: number;
    nonEligibleDividends: number;
    capitalGains: number;
  };
  totalIncome: number;
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  return Number(value);
}

export function summarizePersonalIncomes(
  records: Array<{ category: PersonalIncomeCategory; amount: Prisma.Decimal | number }>
): PersonalIncomeSummary {
  const totalsByCategory = PERSONAL_INCOME_CATEGORIES.reduce(
    (acc, category) => {
      acc[category] = 0;
      return acc;
    },
    {} as Record<PersonalIncomeCategory, number>
  );

  for (const record of records) {
    const amount = toNumber(record.amount);
    totalsByCategory[record.category] = (totalsByCategory[record.category] ?? 0) + amount;
  }

  const sumForBucket = (bucket: Set<PersonalIncomeCategory>) =>
    Array.from(bucket).reduce((total, category) => total + (totalsByCategory[category] ?? 0), 0);

  const employmentIncome = sumForBucket(EMPLOYMENT_BUCKET);
  const businessIncome = sumForBucket(BUSINESS_BUCKET);
  const eligibleDividends = sumForBucket(ELIGIBLE_DIVIDEND_BUCKET);
  const nonEligibleDividends = sumForBucket(NON_ELIGIBLE_DIVIDEND_BUCKET);
  const capitalGains = sumForBucket(CAPITAL_GAIN_BUCKET);

  const totalIncome = PERSONAL_INCOME_CATEGORIES.reduce(
    (sum, category) => sum + (totalsByCategory[category] ?? 0),
    0
  );

  return {
    totalsByCategory,
    totalsForTax: {
      employmentIncome,
      businessIncome,
      eligibleDividends,
      nonEligibleDividends,
      capitalGains
    },
    totalIncome
  };
}

export async function getPersonalIncomeSummary(shareholderId: number, taxYear: number) {
  // @ts-ignore -- Prisma client will expose personalIncome after generating the new schema
  const records = await prisma.personalIncome.findMany({
    where: { shareholderId, taxYear },
    select: {
      category: true,
      amount: true
    }
  });

  return summarizePersonalIncomes(records);
}
