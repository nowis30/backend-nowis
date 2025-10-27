import { Prisma, type PersonalAsset, type PersonalLiability, type PersonalExpense } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { listInvestmentAccounts, type InvestmentAccountSummary } from './investmentService';
import { listFinancialGoals, type FinancialGoalSummary } from './financialGoalsService';

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

export interface PersonalAssetSummary {
  id: number;
  label: string;
  category: string | null;
  ownerType: string;
  valuation: number;
  valuationDate: string;
  liquidityTag: string | null;
  notes: string | null;
}

export interface PersonalLiabilitySummary {
  id: number;
  label: string;
  category: string | null;
  counterparty: string | null;
  balance: number;
  interestRate: number | null;
  maturityDate: string | null;
  notes: string | null;
}

export interface PersonalExpenseSummary {
  id: number;
  label: string;
  category: string | null;
  amount: number;
  frequency: string;
  startDate: string | null;
  endDate: string | null;
  essential: boolean;
  notes: string | null;
}

export interface ProfileBootstrapSummary {
  personalAssets: PersonalAssetSummary[];
  personalLiabilities: PersonalLiabilitySummary[];
  personalExpenses: PersonalExpenseSummary[];
  investmentAccounts: InvestmentAccountSummary[];
  financialGoals: FinancialGoalSummary[];
}

function mapPersonalAsset(asset: PersonalAsset): PersonalAssetSummary {
  return {
    id: asset.id,
    label: asset.label,
    category: asset.category ?? null,
    ownerType: asset.ownerType,
    valuation: toNumber(asset.valuation),
    valuationDate: asset.valuationDate.toISOString(),
    liquidityTag: asset.liquidityTag ?? null,
    notes: asset.notes ?? null
  };
}

function mapPersonalLiability(liability: PersonalLiability): PersonalLiabilitySummary {
  return {
    id: liability.id,
    label: liability.label,
    category: liability.category ?? null,
    counterparty: liability.counterparty ?? null,
    balance: toNumber(liability.balance),
    interestRate: toNullableNumber(liability.interestRate),
    maturityDate: liability.maturityDate ? liability.maturityDate.toISOString() : null,
    notes: liability.notes ?? null
  };
}

function mapPersonalExpense(expense: PersonalExpense): PersonalExpenseSummary {
  return {
    id: expense.id,
    label: expense.label,
    category: expense.category ?? null,
    amount: toNumber(expense.amount),
    frequency: expense.frequency,
    startDate: expense.startDate ? expense.startDate.toISOString() : null,
    endDate: expense.endDate ? expense.endDate.toISOString() : null,
    essential: Boolean(expense.essential),
    notes: expense.notes ?? null
  };
}

export async function getProfileBootstrap(userId: number): Promise<ProfileBootstrapSummary> {
  const [assets, liabilities, expenses, investmentAccounts, financialGoals] = await Promise.all([
    prisma.personalAsset.findMany({
      where: { userId },
      orderBy: [{ valuationDate: 'desc' }, { id: 'desc' }]
    }),
    prisma.personalLiability.findMany({
      where: { userId },
      orderBy: [{ label: 'asc' }]
    }),
    prisma.personalExpense.findMany({
      where: { userId },
      orderBy: [{ essential: 'desc' }, { amount: 'desc' }]
    }),
    listInvestmentAccounts(userId),
    listFinancialGoals(userId)
  ]);

  const personalAssets = assets.map(mapPersonalAsset);
  const personalLiabilities = liabilities.map(mapPersonalLiability);
  const personalExpenses = expenses.map(mapPersonalExpense);

  return {
    personalAssets,
    personalLiabilities,
    personalExpenses,
    investmentAccounts,
    financialGoals
  };
}
