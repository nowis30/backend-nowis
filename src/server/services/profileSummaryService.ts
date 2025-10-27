import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { listInvestmentAccounts } from './investmentService';
import { listFinancialGoals } from './financialGoalsService';

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  return Number(value);
}

const FREQUENCY_TO_ANNUAL_FACTOR: Record<string, number> = {
  ONE_TIME: 1,
  WEEKLY: 52,
  BIWEEKLY: 26,
  MONTHLY: 12,
  QUARTERLY: 4,
  ANNUAL: 1
};

function normalizeCategory(value: string | null | undefined): string {
  return value?.trim().toUpperCase() || 'UNCATEGORIZED';
}

export interface ProfileSummary {
  totals: {
    personalAssets: number;
    investmentHoldings: number;
    personalLiabilities: number;
    netWorth: number;
    annualExpenses: number;
    monthlyExpenses: number;
  };
  breakdowns: {
    assetsByCategory: Array<{ category: string; total: number }>;
    liabilitiesByCategory: Array<{ category: string; total: number }>;
    investmentsByAccountType: Array<{ accountType: string; total: number; accounts: number }>;
  };
  goals: Array<{
    id: number;
    name: string;
    targetAmount: number;
    totalProgress: number;
    progressPercent: number;
    status: string;
    priority: number;
    targetDate: string | null;
  }>;
}

export async function getProfileSummary(userId: number): Promise<ProfileSummary> {
  const [assets, liabilities, expenses, investmentAccounts, goals] = await Promise.all([
    prisma.personalAsset.findMany({
      where: { userId }
    }),
    prisma.personalLiability.findMany({
      where: { userId }
    }),
    prisma.personalExpense.findMany({
      where: { userId }
    }),
    listInvestmentAccounts(userId),
    listFinancialGoals(userId)
  ]);

  const personalAssetsTotal = assets.reduce((sum, asset) => sum + toNumber(asset.valuation), 0);
  const personalLiabilitiesTotal = liabilities.reduce(
    (sum, liability) => sum + toNumber(liability.balance),
    0
  );
  const investmentHoldingsTotal = investmentAccounts.reduce(
    (sum, account) => sum + account.totals.marketValue,
    0
  );

  const annualExpensesTotal = expenses.reduce((sum, expense) => {
    const annualFactor = FREQUENCY_TO_ANNUAL_FACTOR[expense.frequency?.toUpperCase() ?? 'MONTHLY'] ?? 12;
    return sum + toNumber(expense.amount) * annualFactor;
  }, 0);

  const netWorth = personalAssetsTotal + investmentHoldingsTotal - personalLiabilitiesTotal;
  const monthlyExpenses = annualExpensesTotal / 12;

  const assetsByCategoryMap = new Map<string, number>();
  assets.forEach((asset) => {
    const category = normalizeCategory(asset.category ?? null);
    assetsByCategoryMap.set(category, (assetsByCategoryMap.get(category) ?? 0) + toNumber(asset.valuation));
  });

  const liabilitiesByCategoryMap = new Map<string, number>();
  liabilities.forEach((liability) => {
    const category = normalizeCategory(liability.category ?? null);
    liabilitiesByCategoryMap.set(
      category,
      (liabilitiesByCategoryMap.get(category) ?? 0) + toNumber(liability.balance)
    );
  });

  const investmentsByAccountTypeMap = new Map<string, { total: number; accounts: number }>();
  investmentAccounts.forEach((account) => {
    const accountType = account.accountType ?? 'TAXABLE';
    const entry = investmentsByAccountTypeMap.get(accountType) ?? { total: 0, accounts: 0 };
    entry.total += account.totals.marketValue;
    entry.accounts += 1;
    investmentsByAccountTypeMap.set(accountType, entry);
  });

  const goalsSummary = goals.map((goal) => {
    const totalProgress = goal.progress.reduce((sum, entry) => sum + entry.amount, 0);
    const progressPercent = goal.targetAmount > 0 ? (totalProgress / goal.targetAmount) * 100 : 0;

    return {
      id: goal.id,
      name: goal.name,
      targetAmount: goal.targetAmount,
      totalProgress,
      progressPercent,
      status: goal.status,
      priority: goal.priority,
      targetDate: goal.targetDate ?? null
    };
  });

  return {
    totals: {
      personalAssets: personalAssetsTotal,
      investmentHoldings: investmentHoldingsTotal,
      personalLiabilities: personalLiabilitiesTotal,
      netWorth,
      annualExpenses: annualExpensesTotal,
      monthlyExpenses
    },
    breakdowns: {
      assetsByCategory: Array.from(assetsByCategoryMap.entries()).map(([category, total]) => ({
        category,
        total
      })),
      liabilitiesByCategory: Array.from(liabilitiesByCategoryMap.entries()).map(([category, total]) => ({
        category,
        total
      })),
      investmentsByAccountType: Array.from(investmentsByAccountTypeMap.entries()).map(
        ([accountType, value]) => ({
          accountType,
          total: value.total,
          accounts: value.accounts
        })
      )
    },
    goals: goalsSummary.sort((a, b) => a.priority - b.priority || a.targetAmount - b.targetAmount)
  } satisfies ProfileSummary;
}
