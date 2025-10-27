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

export interface FinancialGoalProgressSummary {
  id: number;
  progressDate: string;
  amount: number;
  notes: string | null;
}

export interface FinancialGoalSummary {
  id: number;
  name: string;
  goalType: string;
  targetAmount: number;
  targetDate: string | null;
  priority: number;
  status: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  progress: FinancialGoalProgressSummary[];
}

const goalInclude = Prisma.validator<Prisma.FinancialGoalInclude>()({
  progress: {
    orderBy: [{ progressDate: 'desc' as const }, { id: 'desc' as const }]
  }
});

type FinancialGoalWithProgress = Prisma.FinancialGoalGetPayload<{
  include: typeof goalInclude;
}>;

type FinancialGoalProgressRow = FinancialGoalWithProgress['progress'][number];

function mapGoal(goal: FinancialGoalWithProgress): FinancialGoalSummary {
  return {
    id: goal.id,
    name: goal.name,
    goalType: goal.goalType,
    targetAmount: toNumber(goal.targetAmount),
    targetDate: goal.targetDate ? new Date(goal.targetDate).toISOString() : null,
    priority: goal.priority,
    status: goal.status,
    description: goal.description ?? null,
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
    progress: (goal.progress ?? []).map((entry: FinancialGoalProgressRow) => ({
      id: entry.id,
      progressDate: entry.progressDate.toISOString(),
      amount: toNumber(entry.amount),
      notes: entry.notes ?? null
    }))
  } satisfies FinancialGoalSummary;
}

export async function listFinancialGoals(userId: number): Promise<FinancialGoalSummary[]> {
  const goals = await prisma.financialGoal.findMany({
    where: { userId },
    orderBy: [{ priority: 'asc' }, { targetDate: 'asc' }, { id: 'asc' }],
    include: goalInclude
  });

  return goals.map(mapGoal);
}

export interface CreateFinancialGoalInput {
  name: string;
  goalType?: string;
  targetAmount?: number;
  targetDate?: Date | null;
  priority?: number;
  status?: string;
  description?: string | null;
}

export interface UpdateFinancialGoalInput extends CreateFinancialGoalInput {}

function sanitizeGoalPayload(input: CreateFinancialGoalInput) {
  return {
    name: input.name.trim(),
    goalType: (input.goalType ?? 'GENERAL').trim().toUpperCase(),
    targetAmount: input.targetAmount ?? 0,
    targetDate: input.targetDate ?? null,
    priority: input.priority ?? 3,
    status: (input.status ?? 'ACTIVE').trim().toUpperCase(),
    description: input.description?.trim() ?? null
  };
}

export async function createFinancialGoal(
  userId: number,
  input: CreateFinancialGoalInput
): Promise<FinancialGoalSummary> {
  const payload = sanitizeGoalPayload(input);

  const created = await prisma.financialGoal.create({
    data: {
      userId,
      ...payload
    },
    include: goalInclude
  });

  return mapGoal(created);
}

async function getOwnedGoal(userId: number, goalId: number) {
  return prisma.financialGoal.findFirst({
    where: { id: goalId, userId },
    include: goalInclude
  });
}

export async function updateFinancialGoal(
  userId: number,
  goalId: number,
  input: UpdateFinancialGoalInput
): Promise<FinancialGoalSummary | null> {
  const existing = await getOwnedGoal(userId, goalId);

  if (!existing) {
    return null;
  }

  const payload = sanitizeGoalPayload(input);

  const updated = await prisma.financialGoal.update({
    where: { id: goalId },
    data: payload,
    include: goalInclude
  });

  return mapGoal(updated);
}

export async function deleteFinancialGoal(userId: number, goalId: number): Promise<boolean> {
  const deleted = await prisma.financialGoal.deleteMany({
    where: { id: goalId, userId }
  });

  return deleted.count > 0;
}

export interface CreateFinancialGoalProgressInput {
  progressDate?: Date;
  amount: number;
  notes?: string | null;
}

function sanitizeProgressPayload(input: CreateFinancialGoalProgressInput) {
  return {
    progressDate: input.progressDate ?? new Date(),
    amount: input.amount,
    notes: input.notes?.trim() ?? null
  };
}

export async function createFinancialGoalProgress(
  userId: number,
  goalId: number,
  input: CreateFinancialGoalProgressInput
): Promise<FinancialGoalProgressSummary | null> {
  const goal = await getOwnedGoal(userId, goalId);

  if (!goal) {
    return null;
  }

  const payload = sanitizeProgressPayload(input);

  const created = await prisma.financialGoalProgress.create({
    data: {
      goalId,
      ...payload
    }
  });

  return {
    id: created.id,
    progressDate: created.progressDate.toISOString(),
    amount: toNumber(created.amount),
    notes: created.notes ?? null
  } satisfies FinancialGoalProgressSummary;
}

export async function deleteFinancialGoalProgress(
  userId: number,
  goalId: number,
  progressId: number
): Promise<boolean> {
  const deleted = await prisma.financialGoalProgress.deleteMany({
    where: {
      id: progressId,
      goalId,
      goal: { userId }
    }
  });

  return deleted.count > 0;
}
