import { registerCompute, type ComputeContext, type DagNodeId } from '../../lib/dag';
import { prisma } from '../../lib/prisma';
import { getProfileDashboard } from '../profileDashboardService';

type NodeOutput = { at: string; status: 'ok'; details?: Record<string, unknown> };

function startEndOfYear(year: number): { gte: Date; lte: Date } {
  const gte = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const lte = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  return { gte, lte };
}

async function computeCompta(_node: DagNodeId, ctx: ComputeContext): Promise<NodeOutput> {
  const now = new Date();
  const year = ctx.year ?? now.getUTCFullYear();
  const range = startEndOfYear(year);

  // Récupérer la table des comptes (globale + spécifique user)
  const accounts = await prisma.account.findMany({
    where: { OR: [{ userId: null }, { userId: ctx.userId }] }
  });
  const typeByCode = new Map(accounts.map((a) => [a.code, a.type] as const));

  // Agréger lignes de journal sur la période
  const lines = await prisma.journalEntryLine.findMany({
    where: {
      entry: { userId: ctx.userId, entryDate: { gte: range.gte, lte: range.lte } }
    },
    orderBy: [{ id: 'asc' }]
  });

  let totalDebit = 0;
  let totalCredit = 0;
  let totalRevenues = 0;
  let totalExpenses = 0;

  for (const l of lines) {
    const debit = Number(l.debit || 0);
    const credit = Number(l.credit || 0);
    totalDebit += debit;
    totalCredit += credit;
    const type = typeByCode.get(l.accountCode) || 'OTHER';
    if (type === 'REVENUE') totalRevenues += credit;
    if (type === 'EXPENSE') totalExpenses += debit;
  }

  const netIncome = totalRevenues - totalExpenses;

  return {
    at: new Date().toISOString(),
    status: 'ok',
    details: {
      node: 'Compta',
      userId: ctx.userId,
      year,
      totals: { totalDebit, totalCredit, totalRevenues, totalExpenses, netIncome },
      counts: { lines: lines.length }
    }
  };
}

async function computePrevisions(_node: DagNodeId, ctx: ComputeContext): Promise<NodeOutput> {
  const dashboard = await getProfileDashboard(ctx.userId);
  // Résumer la projection pour la sortie DAG
  const projection = dashboard.projection;
  const lastPoint = projection.timeline[projection.timeline.length - 1];
  return {
    at: new Date().toISOString(),
    status: 'ok',
    details: {
      node: 'Previsions',
      userId: ctx.userId,
      assumptions: projection.assumptions,
      horizonMonths: projection.timeline.length,
      projectedLastMonth: lastPoint?.month,
      projectedNetWorthEnd: lastPoint?.projectedNetWorth,
      noteCount: projection.notes.length
    }
  };
}

async function computeDecideur(_node: DagNodeId, ctx: ComputeContext): Promise<NodeOutput> {
  const dashboard = await getProfileDashboard(ctx.userId);
  const projection = dashboard.projection;
  const avgMonthlyChange = projection.assumptions.averageMonthlyChange;
  const recommendation = avgMonthlyChange >= 0 ? 'MAINTAIN_STRATEGY' : 'REVIEW_BUDGET';
  return {
    at: new Date().toISOString(),
    status: 'ok',
    details: {
      node: 'Decideur',
      userId: ctx.userId,
      recommendation,
      rationale: avgMonthlyChange >= 0
        ? 'Flux net mensuel positif — maintenir la stratégie actuelle.'
        : 'Flux net mensuel négatif — envisager des ajustements de dépenses/investissements.'
    }
  };
}

export function registerDagComputes(): void {
  registerCompute('Compta', computeCompta);
  registerCompute('Previsions', computePrevisions);
  registerCompute('Decideur', computeDecideur);
}
