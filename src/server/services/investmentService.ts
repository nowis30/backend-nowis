import type { InvestmentHolding, InvestmentTransaction } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  return Number(value);
}

function toNullableNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  return Number(value);
}

export interface InvestmentHoldingSummary {
  id: number;
  symbol: string;
  description: string | null;
  quantity: number;
  bookValue: number;
  marketValue: number;
  currency: string;
  targetAllocation: number | null;
}

export interface InvestmentTransactionSummary {
  id: number;
  transactionType: string;
  symbol: string;
  tradeDate: string;
  quantity: number;
  price: number;
  fees: number;
  notes: string | null;
  holdingId: number | null;
}

export interface InvestmentAccountSummary {
  id: number;
  label: string;
  accountType: string;
  institution: string | null;
  accountNumber: string | null;
  currency: string;
  createdAt: string;
  updatedAt: string;
  holdings: InvestmentHoldingSummary[];
  transactions: InvestmentTransactionSummary[];
  totals: {
    bookValue: number;
    marketValue: number;
  };
}

const accountInclude = Prisma.validator<Prisma.InvestmentAccountInclude>()({
  holdings: {
    orderBy: [{ symbol: 'asc' as const }]
  },
  transactions: {
    orderBy: [{ tradeDate: 'desc' as const }, { id: 'desc' as const }],
    take: 200
  }
});

type InvestmentAccountWithRelations = Prisma.InvestmentAccountGetPayload<{
  include: typeof accountInclude;
}>;

type InvestmentHoldingRow = InvestmentAccountWithRelations['holdings'][number] | InvestmentHolding;
type InvestmentTransactionRow =
  | InvestmentAccountWithRelations['transactions'][number]
  | InvestmentTransaction;

function mapInvestmentHolding(holding: InvestmentHoldingRow): InvestmentHoldingSummary {
  return {
    id: holding.id,
    symbol: holding.symbol,
    description: holding.description ?? null,
    quantity: toNumber(holding.quantity),
    bookValue: toNumber(holding.bookValue),
    marketValue: toNumber(holding.marketValue),
    currency: holding.currency,
    targetAllocation: toNullableNumber(holding.targetAllocation)
  };
}

function mapInvestmentTransaction(transaction: InvestmentTransactionRow): InvestmentTransactionSummary {
  return {
    id: transaction.id,
    transactionType: transaction.transactionType,
    symbol: transaction.symbol,
    tradeDate:
      transaction.tradeDate instanceof Date ? transaction.tradeDate.toISOString() : transaction.tradeDate,
    quantity: toNumber(transaction.quantity),
    price: toNumber(transaction.price),
    fees: toNumber(transaction.fees),
    notes: transaction.notes ?? null,
    holdingId: transaction.holdingId ?? null
  };
}

export async function listInvestmentAccounts(userId: number): Promise<InvestmentAccountSummary[]> {
  const accounts = await prisma.investmentAccount.findMany({
    where: { userId },
    orderBy: [{ label: 'asc' }],
    include: accountInclude
  });

  return accounts.map((account) => {
    const holdings = (account.holdings ?? []).map(mapInvestmentHolding);
    const transactions = (account.transactions ?? []).map(mapInvestmentTransaction);

    const totals = holdings.reduce<{ bookValue: number; marketValue: number }>((acc, holding) => {
        acc.bookValue += holding.bookValue;
        acc.marketValue += holding.marketValue;
        return acc;
      },
      { bookValue: 0, marketValue: 0 }
    );

    return {
      id: account.id,
      label: account.label,
      accountType: account.accountType,
      institution: account.institution ?? null,
      accountNumber: account.accountNumber ?? null,
      currency: account.currency,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
      holdings,
      transactions,
      totals
    } satisfies InvestmentAccountSummary;
  });
}

export interface CreateInvestmentAccountInput {
  label: string;
  accountType?: string;
  institution?: string | null;
  accountNumber?: string | null;
  currency?: string;
}

export interface UpdateInvestmentAccountInput extends CreateInvestmentAccountInput {}

function sanitizeAccountPayload(input: CreateInvestmentAccountInput) {
  return {
    label: input.label.trim(),
    accountType: (input.accountType ?? 'TAXABLE').trim().toUpperCase(),
    institution: input.institution?.trim() ?? null,
    accountNumber: input.accountNumber?.trim() ?? null,
    currency: (input.currency ?? 'CAD').trim().toUpperCase()
  };
}

export async function createInvestmentAccount(
  userId: number,
  input: CreateInvestmentAccountInput
): Promise<InvestmentAccountSummary> {
  const payload = sanitizeAccountPayload(input);

  const created = await prisma.investmentAccount.create({
    data: {
      userId,
      ...payload
    },
    include: accountInclude
  });

  return listInvestmentAccounts(userId).then((accounts) => accounts.find((acc) => acc.id === created.id)!);
}

export async function updateInvestmentAccount(
  userId: number,
  accountId: number,
  input: UpdateInvestmentAccountInput
): Promise<InvestmentAccountSummary | null> {
  const payload = sanitizeAccountPayload(input);

  const existing = await prisma.investmentAccount.findFirst({
    where: { id: accountId, userId }
  });

  if (!existing) {
    return null;
  }

  await prisma.investmentAccount.update({
    where: { id: accountId },
    data: payload
  });

  return listInvestmentAccounts(userId).then((accounts) => accounts.find((acc) => acc.id === accountId) ?? null);
}

export async function deleteInvestmentAccount(userId: number, accountId: number): Promise<boolean> {
  const deleted = await prisma.investmentAccount.deleteMany({
    where: { id: accountId, userId }
  });

  return deleted.count > 0;
}

async function ensureAccountOwnership(userId: number, accountId: number): Promise<{ id: number } | null> {
  return prisma.investmentAccount.findFirst({
    where: { id: accountId, userId },
    select: { id: true }
  });
}

export interface CreateInvestmentHoldingInput {
  symbol: string;
  description?: string | null;
  quantity?: number;
  bookValue?: number;
  marketValue?: number;
  currency?: string;
  targetAllocation?: number | null;
}

export interface UpdateInvestmentHoldingInput extends CreateInvestmentHoldingInput {}

function sanitizeHoldingPayload(input: CreateInvestmentHoldingInput) {
  return {
    symbol: input.symbol.trim().toUpperCase(),
    description: input.description?.trim() ?? null,
    quantity: input.quantity ?? 0,
    bookValue: input.bookValue ?? 0,
    marketValue: input.marketValue ?? 0,
    currency: (input.currency ?? 'CAD').trim().toUpperCase(),
    targetAllocation: input.targetAllocation ?? null
  };
}

export async function createInvestmentHolding(
  userId: number,
  accountId: number,
  input: CreateInvestmentHoldingInput
): Promise<InvestmentHoldingSummary | null> {
  const account = await ensureAccountOwnership(userId, accountId);
  if (!account) {
    return null;
  }

  const payload = sanitizeHoldingPayload(input);

  const created = await prisma.investmentHolding.create({
    data: {
      accountId,
      ...payload
    }
  });

  return mapInvestmentHolding(created);
}

export async function updateInvestmentHolding(
  userId: number,
  holdingId: number,
  input: UpdateInvestmentHoldingInput
): Promise<InvestmentHoldingSummary | null> {
  const holding = await prisma.investmentHolding.findUnique({
    where: { id: holdingId },
    select: { id: true, accountId: true, account: { select: { userId: true } } }
  });

  if (!holding || holding.account.userId !== userId) {
    return null;
  }

  const payload = sanitizeHoldingPayload(input);

  const updated = await prisma.investmentHolding.update({
    where: { id: holdingId },
    data: payload
  });

  return mapInvestmentHolding(updated);
}

export async function deleteInvestmentHolding(userId: number, holdingId: number): Promise<boolean> {
  const deleted = await prisma.investmentHolding.deleteMany({
    where: { id: holdingId, account: { userId } }
  });

  return deleted.count > 0;
}

export interface CreateInvestmentTransactionInput {
  transactionType: string;
  symbol: string;
  tradeDate: Date;
  quantity: number;
  price: number;
  fees?: number;
  notes?: string | null;
  holdingId?: number | null;
}

function sanitizeTransactionPayload(input: CreateInvestmentTransactionInput) {
  return {
    transactionType: input.transactionType.trim().toUpperCase(),
    symbol: input.symbol.trim().toUpperCase(),
    tradeDate: input.tradeDate,
    quantity: input.quantity,
    price: input.price,
    fees: input.fees ?? 0,
    notes: input.notes?.trim() ?? null,
    holdingId: input.holdingId ?? null
  };
}

export async function createInvestmentTransaction(
  userId: number,
  accountId: number,
  input: CreateInvestmentTransactionInput
): Promise<InvestmentTransactionSummary | null> {
  const account = await ensureAccountOwnership(userId, accountId);
  if (!account) {
    return null;
  }

  const payload = sanitizeTransactionPayload(input);

  if (payload.holdingId) {
    const holding = await prisma.investmentHolding.findFirst({
      where: { id: payload.holdingId, accountId }
    });

    if (!holding) {
      return null;
    }
  }

  const created = await prisma.investmentTransaction.create({
    data: {
      accountId,
      ...payload
    }
  });

  return mapInvestmentTransaction(created);
}

export async function deleteInvestmentTransaction(
  userId: number,
  transactionId: number
): Promise<boolean> {
  const deleted = await prisma.investmentTransaction.deleteMany({
    where: { id: transactionId, account: { userId } }
  });

  return deleted.count > 0;
}
