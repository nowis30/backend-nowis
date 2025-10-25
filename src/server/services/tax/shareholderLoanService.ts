import type { ShareholderLoan, ShareholderLoanPayment } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { prisma } from '../../lib/prisma';

export type LoanInterestMethod = 'SIMPLE' | 'COMPOUND';

export interface ShareholderLoanInput {
  companyId: number;
  shareholderId: number;
  principal: number;
  interestRate: number;
  issuedDate: Date;
  dueDate?: Date | null;
  interestMethod?: LoanInterestMethod;
  notes?: string | null;
}

export interface LoanPaymentInput {
  loanId: number;
  paymentDate: Date;
  principalPaid?: number;
  interestPaid?: number;
}

export interface LoanScheduleEntry {
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  interestAccrued: number;
  interestPaid: number;
  principalPaid: number;
  closingBalance: number;
}

function daysBetween(start: Date, end: Date): number {
  const millis = end.getTime() - start.getTime();
  return Math.max(0, Math.round(millis / 86_400_000));
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
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

  return Number(value);
}

function calculateInterest(balance: number, rate: number, days: number, method: LoanInterestMethod): number {
  if (balance <= 0 || rate <= 0 || days <= 0) {
    return 0;
  }

  const annualRate = rate;
  const years = days / 365;

  if (method === 'COMPOUND') {
    return balance * (Math.pow(1 + annualRate, years) - 1);
  }

  return balance * annualRate * years;
}

export function calculateLoanSchedule(loan: ShareholderLoan & { payments: ShareholderLoanPayment[] }): LoanScheduleEntry[] {
  const method = (loan.interestMethod?.toUpperCase() === 'COMPOUND' ? 'COMPOUND' : 'SIMPLE') as LoanInterestMethod;
  const endDate = loan.dueDate ?? new Date(new Date(loan.issuedDate).setFullYear(loan.issuedDate.getFullYear() + 1));

  const events = loan.payments
    .map((payment) => ({
      paymentDate: payment.paymentDate,
      principalPaid: decimalToNumber(payment.principalPaid),
      interestPaid: decimalToNumber(payment.interestPaid)
    }))
    .sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime());

  if (events.length === 0 || events[events.length - 1].paymentDate.getTime() !== endDate.getTime()) {
    events.push({ paymentDate: endDate, principalPaid: 0, interestPaid: 0 });
  }

  let balance = decimalToNumber(loan.principal);
  let cursor = loan.issuedDate;
  const schedule: LoanScheduleEntry[] = [];

  for (const payment of events) {
    const periodEnd = payment.paymentDate;
    const days = daysBetween(cursor, periodEnd);
    const interest = calculateInterest(balance, decimalToNumber(loan.interestRate), days, method);
    const interestPaid = payment.interestPaid;
    const principalPaid = payment.principalPaid;
    const closingBalance = Math.max(0, balance + interest - interestPaid - principalPaid);

    schedule.push({
      periodStart: cursor.toISOString(),
      periodEnd: periodEnd.toISOString(),
      openingBalance: balance,
      interestAccrued: interest,
      interestPaid,
      principalPaid,
      closingBalance
    });

    balance = closingBalance;
    cursor = periodEnd;
  }

  return schedule;
}

export async function createShareholderLoan(input: ShareholderLoanInput) {
  if (input.principal <= 0) {
    throw new Error('Principal must be positive');
  }

  const method = (input.interestMethod ?? 'SIMPLE').toUpperCase() === 'COMPOUND' ? 'COMPOUND' : 'SIMPLE';

  const loan = await prisma.shareholderLoan.create({
    data: {
      companyId: input.companyId,
      shareholderId: input.shareholderId,
      principal: input.principal,
      interestRate: input.interestRate,
      issuedDate: input.issuedDate,
      dueDate: input.dueDate ?? null,
      interestMethod: method,
      notes: input.notes ?? null
    },
    include: {
      payments: true
    }
  });

  return {
    loan,
    schedule: calculateLoanSchedule(loan)
  };
}

export async function addLoanPayment(input: LoanPaymentInput) {
  const loan = await prisma.shareholderLoan.findUnique({
    where: { id: input.loanId },
    include: { payments: true }
  });

  if (!loan) {
    throw new Error('Loan not found');
  }

  await prisma.shareholderLoanPayment.create({
    data: {
      loanId: input.loanId,
      paymentDate: input.paymentDate,
      principalPaid: input.principalPaid ?? 0,
      interestPaid: input.interestPaid ?? 0
    }
  });

  const refreshedLoan = await prisma.shareholderLoan.findUnique({
    where: { id: input.loanId },
    include: { payments: true }
  });

  if (!refreshedLoan) {
    throw new Error('Loan disappeared after recording payment');
  }

  return {
    loan: refreshedLoan,
    schedule: calculateLoanSchedule(refreshedLoan)
  };
}

export async function getLoanWithSchedule(loanId: number) {
  const loan = await prisma.shareholderLoan.findUnique({
    where: { id: loanId },
    include: { payments: true, company: { select: { id: true, name: true } }, shareholder: { select: { id: true, displayName: true } } }
  });

  if (!loan) {
    throw new Error('Loan not found');
  }

  return {
    loan,
    schedule: calculateLoanSchedule(loan)
  };
}
