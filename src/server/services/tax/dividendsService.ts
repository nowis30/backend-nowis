import { Prisma, type DividendType } from '@prisma/client';

import { prisma } from '../../lib/prisma';

const ELIGIBLE_GROSS_UP = 0.38;
const NON_ELIGIBLE_GROSS_UP = 0.15;
const ELIGIBLE_FEDERAL_RATE = 0.150198;
const NON_ELIGIBLE_FEDERAL_RATE = 0.090301;
const ELIGIBLE_PROVINCIAL_RATE = 0.1190;
const NON_ELIGIBLE_PROVINCIAL_RATE = 0.0483;

type DecimalLike = Prisma.Decimal | number | bigint | string | null | undefined;

function toNumber(value: DecimalLike): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (typeof value === 'object' && value !== null) {
    const candidate = value as { toNumber?: () => number; valueOf?: () => unknown };
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

  return 0;
}

interface DividendMetrics {
  grossUpRate: number;
  grossedAmount: number;
  federalCredit: number;
  provincialCredit: number;
}

function computeDividendMetrics(amount: number, dividendType: DividendType): DividendMetrics {
  if (dividendType === 'ELIGIBLE') {
    const grossUpRate = ELIGIBLE_GROSS_UP;
    const grossedAmount = amount * (1 + grossUpRate);
    return {
      grossUpRate,
      grossedAmount,
      federalCredit: grossedAmount * ELIGIBLE_FEDERAL_RATE,
      provincialCredit: grossedAmount * ELIGIBLE_PROVINCIAL_RATE
    };
  }

  const grossUpRate = NON_ELIGIBLE_GROSS_UP;
  const grossedAmount = amount * (1 + grossUpRate);
  return {
    grossUpRate,
    grossedAmount,
    federalCredit: grossedAmount * NON_ELIGIBLE_FEDERAL_RATE,
    provincialCredit: grossedAmount * NON_ELIGIBLE_PROVINCIAL_RATE
  };
}

export interface DividendInput {
  companyId: number;
  shareholderId: number;
  amount: number;
  dividendType: DividendType;
  declarationDate: Date;
  shareClassId?: number | null;
  recordDate?: Date | null;
  paymentDate?: Date | null;
  notes?: string | null;
}

export async function recordDividend(input: DividendInput) {
  if (input.amount <= 0) {
    throw new Error('Dividend amount must be positive');
  }

  const metrics = computeDividendMetrics(input.amount, input.dividendType);

  const record = await prisma.dividendDeclaration.create({
    data: {
      companyId: input.companyId,
      shareholderId: input.shareholderId,
      shareClassId: input.shareClassId ?? null,
      declarationDate: input.declarationDate,
      recordDate: input.recordDate ?? null,
      paymentDate: input.paymentDate ?? null,
      amount: input.amount,
      dividendType: input.dividendType,
      grossUpRate: metrics.grossUpRate,
      grossedAmount: metrics.grossedAmount,
      federalCredit: metrics.federalCredit,
      provincialCredit: metrics.provincialCredit,
      notes: input.notes ?? null
    },
    include: {
      company: { select: { id: true, name: true } },
      shareholder: { select: { id: true, displayName: true } },
      shareClass: { select: { id: true, code: true } }
    }
  });

  return record;
}

export async function listDividendsForUser(userId: number, year?: number) {
  const dateRange = year
    ? {
        gte: new Date(Date.UTC(year, 0, 1)),
        lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))
      }
    : undefined;

  const dividends = await prisma.dividendDeclaration.findMany({
    where: {
      company: { userId },
      ...(dateRange && { declarationDate: dateRange })
    },
    orderBy: [{ declarationDate: 'desc' }, { id: 'desc' }],
    include: {
      company: { select: { id: true, name: true } },
      shareholder: { select: { id: true, displayName: true, contactEmail: true } },
      shareClass: { select: { id: true, code: true } }
    }
  });

  return dividends;
}

export interface ReturnOfCapitalInput {
  companyId: number;
  shareholderId: number;
  amount: number;
  transactionDate: Date;
  shareClassId?: number | null;
  notes?: string | null;
}

export async function recordReturnOfCapital(input: ReturnOfCapitalInput) {
  if (input.amount <= 0) {
    throw new Error('Return of capital amount must be positive');
  }

  const previousRecord = await prisma.returnOfCapitalRecord.findFirst({
    where: {
      shareholderId: input.shareholderId,
      shareClassId: input.shareClassId ?? undefined
    },
    orderBy: { transactionDate: 'desc' }
  });

  const baseAcb = previousRecord ? toNumber(previousRecord.newAcb) : 0;
  const newAcb = Math.max(0, baseAcb - input.amount);

  const record = await prisma.returnOfCapitalRecord.create({
    data: {
      companyId: input.companyId,
      shareholderId: input.shareholderId,
      shareClassId: input.shareClassId ?? null,
      transactionDate: input.transactionDate,
      amount: input.amount,
      previousAcb: baseAcb,
      newAcb,
      notes: input.notes ?? null
    },
    include: {
      company: { select: { id: true, name: true } },
      shareholder: { select: { id: true, displayName: true } },
      shareClass: { select: { id: true, code: true } }
    }
  });

  return record;
}

export async function listReturnOfCapital(userId: number, year?: number) {
  const dateRange = year
    ? {
        gte: new Date(Date.UTC(year, 0, 1)),
        lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))
      }
    : undefined;

  return prisma.returnOfCapitalRecord.findMany({
    where: {
      company: { userId },
      ...(dateRange && { transactionDate: dateRange })
    },
    orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
    include: {
      company: { select: { id: true, name: true } },
      shareholder: { select: { id: true, displayName: true } },
      shareClass: { select: { id: true, code: true } }
    }
  });
}
