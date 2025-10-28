import { prisma } from '../lib/prisma';

export interface DistributionInput {
  propertyId: number;
  periodStart?: Date;
  periodEnd?: Date;
  includeMortgagePayments?: boolean;
}

export interface DistributionResult {
  propertyId: number;
  cashflow: number;
  owners: Array<{
    shareholderId: number;
    ownershipPercent: number;
    cashflowShare: number;
  }>;
}

export async function computePropertyDistribution(input: DistributionInput): Promise<DistributionResult> {
  const { propertyId } = input;

  const [revenues, expenses, owners, mortgages] = await Promise.all([
    prisma.revenue.findMany({
      where: {
        propertyId,
        ...(input.periodStart || input.periodEnd
          ? {
              // approx: filter by start within range; data model is recurring but we store occurrences as single rows
              startDate: {
                gte: input.periodStart ?? new Date('1900-01-01'),
                lte: input.periodEnd ?? new Date('2999-12-31')
              }
            }
          : {})
      }
    }),
    prisma.expense.findMany({
      where: {
        propertyId,
        ...(input.periodStart || input.periodEnd
          ? {
              startDate: {
                gte: input.periodStart ?? new Date('1900-01-01'),
                lte: input.periodEnd ?? new Date('2999-12-31')
              }
            }
          : {})
      }
    }),
    (prisma as any).propertyCoOwner.findMany({ where: { propertyId } }),
    prisma.mortgage.findMany({ where: { propertyId } })
  ]);

  const totalRevenue = (revenues as any[]).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const totalExpenses = (expenses as any[]).reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);

  let mortgagePayments = 0;
  if (input.includeMortgagePayments) {
    for (const m of mortgages as any[]) {
      mortgagePayments += Number((m as any).paymentAmount ?? 0);
    }
  }

  const cashflow = totalRevenue - totalExpenses - mortgagePayments;
  const ownersOut = (owners as any[]).map((o: any) => ({
    shareholderId: o.shareholderId as number,
    ownershipPercent: Number(o.ownershipPercent ?? 0),
    cashflowShare: cashflow * (Number(o.ownershipPercent ?? 0) / 100)
  }));

  return { propertyId, cashflow, owners: ownersOut };
}

export interface SaleOrRefiInput {
  propertyId: number;
  eventType: 'SALE' | 'REFINANCE';
  value: number; // sale price or refinance proceeds
  closingCosts?: number; // notary, broker, penalties
  debtOutstanding?: number; // if omitted, best-effort: sum of principals
}

export interface SaleOrRefiResult {
  propertyId: number;
  eventType: 'SALE' | 'REFINANCE';
  grossProceeds: number;
  netAfterCostsAndDebt: number;
  allocations: Array<{
    shareholderId: number;
    priorityPaid: number;
    proRataShare: number;
    totalReceived: number;
  }>;
}

export async function simulateSaleOrRefi(input: SaleOrRefiInput): Promise<SaleOrRefiResult> {
  const { propertyId, value, eventType } = input;
  const closingCosts = Number(input.closingCosts ?? 0);

  const [owners, mortgages, property] = await Promise.all([
    (prisma as any).propertyCoOwner.findMany({ where: { propertyId } }),
    prisma.mortgage.findMany({ where: { propertyId } }),
    prisma.property.findUnique({ where: { id: propertyId } })
  ]);

  if (!property) {
    throw Object.assign(new Error('Immeuble introuvable.'), { status: 404 });
  }

  const grossProceeds = Number(value);
  const totalDebt = input.debtOutstanding != null
    ? Number(input.debtOutstanding)
    : (mortgages as any[]).reduce((s: number, m: any) => s + Number(m.principal ?? 0), 0);

  let pool = grossProceeds - closingCosts - totalDebt;
  if (pool < 0) pool = 0;

  const allocations: SaleOrRefiResult['allocations'] = (owners as any[]).map((o: any) => ({
    shareholderId: o.shareholderId,
    priorityPaid: 0,
    proRataShare: 0,
    totalReceived: 0
  }));

  // 1) Priorité: rembourser les caps prioritaires (ex: 100 000$) par propriétaire
  for (const a of allocations) {
    const owner = (owners as any[]).find((o: any) => o.shareholderId === a.shareholderId)!;
    const cap = Number(owner.priorityReturnCap ?? 0);
    if (cap > 0 && pool > 0) {
      const paid = Math.min(pool, cap);
      a.priorityPaid = paid;
      a.totalReceived += paid;
      pool -= paid;
    }
  }

  // 2) Pro-rata sur le reliquat selon ownershipPercent
  const totalPercent = (owners as any[]).reduce((s: number, o: any) => s + Number(o.ownershipPercent ?? 0), 0) || 100;
  for (const a of allocations) {
    const owner = (owners as any[]).find((o: any) => o.shareholderId === a.shareholderId)!;
    const pct = Number(owner.ownershipPercent ?? 0);
    const share = pool * (pct / totalPercent);
    a.proRataShare = share;
    a.totalReceived += share;
  }

  return {
    propertyId,
    eventType,
    grossProceeds,
    netAfterCostsAndDebt: Number(value) - closingCosts - totalDebt,
    allocations
  };
}
