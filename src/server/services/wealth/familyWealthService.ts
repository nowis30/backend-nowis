import { Prisma } from '@prisma/client';

import { prisma } from '../../lib/prisma';
import {
  summarizePersonalIncomes,
  type PersonalIncomeCategory
} from '../personalIncomeService';

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  return Number(value);
}

function roundCurrency(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function isLiquidAsset(category?: string | null, liquidityTag?: string | null): boolean {
  const normalizedCategory = (category ?? '').toLowerCase();
  const normalizedTag = (liquidityTag ?? '').toLowerCase();

  if (normalizedTag === 'liquid' || normalizedTag === 'high') {
    return true;
  }

  if (normalizedCategory.includes('liquid') || normalizedCategory.includes('cash') || normalizedCategory.includes('trésorerie')) {
    return true;
  }

  return false;
}

interface PropertyAggregation {
  propertyValuePersonal: number;
  propertyDebtPersonal: number;
  propertyValueCorporateFallback: Map<number, { value: number; debt: number }>;
}

async function aggregateProperties(userId: number): Promise<PropertyAggregation> {
  const properties = await prisma.property.findMany({
    where: { userId },
    select: {
      id: true,
      companyId: true,
      currentValue: true,
      purchasePrice: true,
      mortgages: {
        select: {
          principal: true
        }
      }
    }
  });

  let propertyValuePersonal = 0;
  let propertyDebtPersonal = 0;
  const propertyValueCorporateFallback = new Map<number, { value: number; debt: number }>();

  properties.forEach((property) => {
    const value = roundCurrency(decimalToNumber(property.currentValue ?? property.purchasePrice ?? 0));
    const debt = roundCurrency(
      property.mortgages.reduce((accumulator, mortgage) => accumulator + decimalToNumber(mortgage.principal), 0)
    );
    const net = roundCurrency(value - debt);

    if (property.companyId) {
      const existing = propertyValueCorporateFallback.get(property.companyId) ?? { value: 0, debt: 0 };
      propertyValueCorporateFallback.set(property.companyId, {
        value: roundCurrency(existing.value + net),
        debt: roundCurrency(existing.debt + debt)
      });
    } else {
      propertyValuePersonal = roundCurrency(propertyValuePersonal + net);
      propertyDebtPersonal = roundCurrency(propertyDebtPersonal + debt);
    }
  });

  return { propertyValuePersonal, propertyDebtPersonal, propertyValueCorporateFallback };
}

async function aggregateCompanyValuations(
  userId: number,
  propertyFallback: Map<number, { value: number; debt: number }>
): Promise<{ companyValue: number; companyDetails: Array<{ companyId: number; name: string; netAssetValue: number; valuationDate: string | null }> }>
{
  const companies = await prisma.company.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      valuationSnapshots: {
        orderBy: [{ valuationDate: 'desc' }, { id: 'desc' }],
        take: 1,
        select: {
          valuationDate: true,
          totals: true
        }
      }
    }
  });

  let companyValue = 0;
  const companyDetails: Array<{ companyId: number; name: string; netAssetValue: number; valuationDate: string | null }> = [];

  companies.forEach((company) => {
    const snapshot = company.valuationSnapshots[0];
    let netAssetValue = 0;
    let valuationDate: string | null = null;

    if (snapshot) {
      const totals = snapshot.totals as unknown as { netAssetValue?: number };
      netAssetValue = roundCurrency(Number((totals?.netAssetValue ?? 0))); // totals may already be numeric
      valuationDate = snapshot.valuationDate.toISOString();
    }

    if (!snapshot && propertyFallback.has(company.id)) {
      const fallback = propertyFallback.get(company.id)!;
      netAssetValue = roundCurrency(fallback.value);
    }

    companyValue = roundCurrency(companyValue + netAssetValue);
    companyDetails.push({ companyId: company.id, name: company.name, netAssetValue, valuationDate });
  });

  return { companyValue, companyDetails };
}

const personalAssetSelect = Prisma.validator<Prisma.PersonalAssetSelect>()({
  valuation: true,
  category: true,
  liquidityTag: true
});

async function aggregatePersonalAssets(userId: number) {
  const assets = await prisma.personalAsset.findMany({
    where: { userId },
    select: personalAssetSelect
  });

  let personalAssetsValue = 0;
  let liquidAssetsValue = 0;

  assets.forEach((asset) => {
    const value = roundCurrency(decimalToNumber(asset.valuation));
    personalAssetsValue = roundCurrency(personalAssetsValue + value);

    if (isLiquidAsset(asset.category, asset.liquidityTag)) {
      liquidAssetsValue = roundCurrency(liquidAssetsValue + value);
    }
  });

  return { personalAssetsValue, liquidAssetsValue };
}

const personalLiabilitySelect = Prisma.validator<Prisma.PersonalLiabilitySelect>()({
  balance: true
});

async function aggregatePersonalLiabilities(userId: number) {
  const liabilities = await prisma.personalLiability.findMany({
    where: { userId },
    select: personalLiabilitySelect
  });

  return liabilities.reduce<number>((total, liability) => roundCurrency(total + decimalToNumber(liability.balance)), 0);
}

const familyTrustSelect = Prisma.validator<Prisma.FamilyTrustSelect>()({
  id: true,
  name: true,
  netAssetValue: true
});

async function aggregateFamilyTrusts(userId: number) {
  const trusts = await prisma.familyTrust.findMany({
    where: { userId },
    select: familyTrustSelect
  });

  let trustValue = 0;
  const details: Array<{ trustId: number; name: string; netAssetValue: number }> = [];

  trusts.forEach((trust) => {
    const value = roundCurrency(decimalToNumber(trust.netAssetValue));
    trustValue = roundCurrency(trustValue + value);
    details.push({ trustId: trust.id, name: trust.name, netAssetValue: value });
  });

  return { trustValue, trusts: details };
}

async function aggregateShareholderLoans(userId: number) {
  const loans = await prisma.shareholderLoan.findMany({
    where: { company: { userId } },
    select: {
      principal: true,
      payments: {
        select: {
          principalPaid: true
        }
      }
    }
  });

  let outstanding = 0;

  loans.forEach((loan) => {
    const principal = decimalToNumber(loan.principal);
    const repaid = loan.payments.reduce(
      (total, payment) => total + decimalToNumber(payment.principalPaid),
      0
    );

    outstanding = roundCurrency(outstanding + Math.max(principal - repaid, 0));
  });

  return outstanding;
}

function buildIncomeMix(
  records: Array<{ category: PersonalIncomeCategory; amount: Prisma.Decimal | number }>
): {
  salary: number;
  dividendsEligible: number;
  dividendsNonEligible: number;
  returnOfCapital: number;
} {
  const summary = summarizePersonalIncomes(records);

  return {
    salary: roundCurrency(summary.totalsForTax.employmentIncome),
    dividendsEligible: roundCurrency(summary.totalsForTax.eligibleDividends),
    dividendsNonEligible: roundCurrency(summary.totalsForTax.nonEligibleDividends),
    returnOfCapital: 0
  };
}

interface DividendAggregation {
  eligible: number;
  nonEligible: number;
}

async function aggregateDividends(userId: number, year: number): Promise<DividendAggregation> {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  const dividends = await prisma.dividendDeclaration.findMany({
    where: {
      company: { userId },
      declarationDate: {
        gte: start,
        lte: end
      }
    },
    select: {
      amount: true,
      dividendType: true
    }
  });

  return dividends.reduce<DividendAggregation>((totals, dividend) => {
    const value = roundCurrency(decimalToNumber(dividend.amount));
    if (dividend.dividendType === 'ELIGIBLE') {
      totals.eligible = roundCurrency(totals.eligible + value);
    } else {
      totals.nonEligible = roundCurrency(totals.nonEligible + value);
    }
    return totals;
  }, { eligible: 0, nonEligible: 0 });
}

async function aggregateReturnOfCapital(userId: number, year: number): Promise<number> {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  const records = await prisma.returnOfCapitalRecord.findMany({
    where: {
      company: { userId },
      transactionDate: {
        gte: start,
        lte: end
      }
    },
    select: {
      amount: true
    }
  });

  return records.reduce((total, record) => roundCurrency(total + decimalToNumber(record.amount)), 0);
}

export interface FamilyWealthOverview {
  asOf: string;
  totals: {
    assets: number;
    liabilities: number;
    netWorth: number;
  };
  breakdown: {
    personalProperty: {
      netValue: number;
      debt: number;
    };
    personalAssets: {
      total: number;
      liquid: number;
    };
    companies: {
      total: number;
      items: Array<{ companyId: number; name: string; netAssetValue: number; valuationDate: string | null }>;
    };
    trusts: {
      total: number;
      items: Array<{ trustId: number; name: string; netAssetValue: number }>;
    };
    liabilities: {
      personal: number;
      shareholderLoans: number;
      total: number;
    };
  };
  comparisons: {
    structure: Array<{ label: string; value: number }>;
    incomeMix: Array<{ label: string; value: number }>;
  };
  riskIndicators: {
    debtToAsset: number;
    liquidityCoverage: number;
    diversificationScore: number;
  };
  observations: string[];
}

interface BuildOverviewOptions {
  asOf?: Date;
  year?: number;
  persistSnapshot?: boolean;
}

function computeDiversificationScore(structure: Array<{ value: number }>): number {
  const total = structure.reduce((sum, entry) => sum + Math.max(entry.value, 0), 0);
  if (total <= 0) {
    return 0;
  }

  const weights = structure.map((entry) => Math.max(entry.value, 0) / total);
  const maxWeight = Math.max(...weights);
  return roundCurrency(1 - maxWeight);
}

function buildObservations({
  debtToAsset,
  liquidityCoverage,
  diversificationScore
}: FamilyWealthOverview['riskIndicators']): string[] {
  const observations: string[] = [];

  if (debtToAsset > 0.6) {
    observations.push('Le ratio dettes/actifs dépasse 60 %. Réévalue la structure de financement.');
  }

  if (liquidityCoverage < 0.5) {
    observations.push('La couverture de liquidités est limitée. Envisage d’augmenter le coussin de trésorerie.');
  }

  if (diversificationScore < 0.3) {
    observations.push('Le patrimoine est concentré. Explore d’autres classes d’actifs ou structures.');
  }

  return observations;
}

export async function buildFamilyWealthOverview(
  userId: number,
  options: BuildOverviewOptions = {}
): Promise<FamilyWealthOverview> {
  const asOf = options.asOf ?? new Date();
  const targetYear = options.year ?? asOf.getUTCFullYear();

  const propertyAggregation = await aggregateProperties(userId);

  const [companyAggregation, personalAssetsAggregation, personalLiabilitiesTotal, trustAggregation, shareholderLoanOutstanding] = await Promise.all([
    aggregateCompanyValuations(userId, propertyAggregation.propertyValueCorporateFallback),
    aggregatePersonalAssets(userId),
    aggregatePersonalLiabilities(userId),
    aggregateFamilyTrusts(userId),
    aggregateShareholderLoans(userId)
  ]);

  const { propertyValuePersonal, propertyDebtPersonal } = propertyAggregation;

  const companyValue = companyAggregation.companyValue;

  const totalAssets = roundCurrency(
    propertyValuePersonal + personalAssetsAggregation.personalAssetsValue + companyValue + trustAggregation.trustValue
  );

  const totalLiabilities = roundCurrency(
    propertyDebtPersonal + personalLiabilitiesTotal + shareholderLoanOutstanding
  );

  const netWorth = roundCurrency(totalAssets - totalLiabilities);

  const personalIncomeSelect = Prisma.validator<Prisma.PersonalIncomeSelect>()({
    category: true,
    amount: true
  });

  const incomeRecords = await prisma.personalIncome.findMany({
    where: {
      taxYear: targetYear,
      shareholder: { userId }
    },
    select: personalIncomeSelect
  });

  const incomeMixBase = buildIncomeMix(
    incomeRecords.map((record) => ({
      category: record.category as PersonalIncomeCategory,
      amount: record.amount
    }))
  );

  const [dividendTotals, returnOfCapitalTotal] = await Promise.all([
    aggregateDividends(userId, targetYear),
    aggregateReturnOfCapital(userId, targetYear)
  ]);

  const salary = roundCurrency(incomeMixBase.salary);
  const dividendsEligible = roundCurrency(incomeMixBase.dividendsEligible + dividendTotals.eligible);
  const dividendsNonEligible = roundCurrency(incomeMixBase.dividendsNonEligible + dividendTotals.nonEligible);
  const returnOfCapital = roundCurrency(incomeMixBase.returnOfCapital + returnOfCapitalTotal);

  const structureComparative = [
    { label: 'Patrimoine personnel', value: roundCurrency(propertyValuePersonal + personalAssetsAggregation.personalAssetsValue - personalLiabilitiesTotal - shareholderLoanOutstanding) },
    { label: 'Patrimoine corporatif', value: companyValue },
    { label: 'Fiducies', value: trustAggregation.trustValue }
  ];

  const diversificationScore = computeDiversificationScore(structureComparative);
  const debtToAsset = totalAssets > 0 ? roundCurrency(totalLiabilities / totalAssets) : 0;
  const liquidityCoverageBase = personalLiabilitiesTotal + propertyDebtPersonal + shareholderLoanOutstanding;
  const liquidityCoverage = liquidityCoverageBase > 0
    ? roundCurrency(personalAssetsAggregation.liquidAssetsValue / liquidityCoverageBase)
    : roundCurrency(personalAssetsAggregation.liquidAssetsValue > 0 ? 1 : 0);

  const riskIndicators = {
    debtToAsset,
    liquidityCoverage,
    diversificationScore
  };

  const overview: FamilyWealthOverview = {
    asOf: asOf.toISOString(),
    totals: {
      assets: totalAssets,
      liabilities: totalLiabilities,
      netWorth
    },
    breakdown: {
      personalProperty: {
        netValue: propertyValuePersonal,
        debt: propertyDebtPersonal
      },
      personalAssets: {
        total: personalAssetsAggregation.personalAssetsValue,
        liquid: personalAssetsAggregation.liquidAssetsValue
      },
      companies: {
        total: companyValue,
        items: companyAggregation.companyDetails
      },
      trusts: {
        total: trustAggregation.trustValue,
        items: trustAggregation.trusts
      },
      liabilities: {
        personal: personalLiabilitiesTotal,
        shareholderLoans: shareholderLoanOutstanding,
        total: totalLiabilities
      }
    },
    comparisons: {
      structure: structureComparative,
      incomeMix: [
        { label: 'Salaires et pensions', value: salary },
        { label: 'Dividendes admissibles', value: dividendsEligible },
        { label: 'Dividendes non admissibles', value: dividendsNonEligible },
        { label: 'Retours de capital', value: returnOfCapital }
      ]
    },
    riskIndicators,
    observations: buildObservations(riskIndicators)
  };

  if (options.persistSnapshot) {
    await prisma.familyWealthSnapshot.upsert({
      where: {
        userId_snapshotDate: {
          userId,
          snapshotDate: new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()))
        }
      },
      create: {
        userId,
        snapshotDate: new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())),
        totalAssets,
        totalLiabilities,
        netWorth,
        propertyValue: propertyValuePersonal,
        companyValue,
        trustValue: trustAggregation.trustValue,
        personalAssetsValue: personalAssetsAggregation.personalAssetsValue,
        liquidAssetsValue: personalAssetsAggregation.liquidAssetsValue,
        personalDebtValue: personalLiabilitiesTotal,
        shareholderLoanValue: shareholderLoanOutstanding,
        metadata: {
          comparisons: overview.comparisons,
          riskIndicators: overview.riskIndicators
        }
      },
      update: {
        totalAssets,
        totalLiabilities,
        netWorth,
        propertyValue: propertyValuePersonal,
        companyValue,
        trustValue: trustAggregation.trustValue,
        personalAssetsValue: personalAssetsAggregation.personalAssetsValue,
        liquidAssetsValue: personalAssetsAggregation.liquidAssetsValue,
        personalDebtValue: personalLiabilitiesTotal,
        shareholderLoanValue: shareholderLoanOutstanding,
        metadata: {
          comparisons: overview.comparisons,
          riskIndicators: overview.riskIndicators
        }
      }
    });
  }

  return overview;
}

export interface FamilyWealthHistoryPoint {
  snapshotDate: string;
  netWorth: number;
  assets: number;
  liabilities: number;
  metadata: Prisma.JsonValue | null;
}

export async function buildFamilyWealthHistory(userId: number): Promise<FamilyWealthHistoryPoint[]> {
  const snapshots = await prisma.familyWealthSnapshot.findMany({
    where: { userId },
    orderBy: [{ snapshotDate: 'asc' }, { id: 'asc' }]
  });

  return snapshots.map((snapshot) => ({
    snapshotDate: snapshot.snapshotDate.toISOString(),
    netWorth: roundCurrency(decimalToNumber(snapshot.netWorth)),
    assets: roundCurrency(decimalToNumber(snapshot.totalAssets)),
    liabilities: roundCurrency(decimalToNumber(snapshot.totalLiabilities)),
    metadata: snapshot.metadata
  }));
}

export interface FamilyWealthScenarioInput {
  label: string;
  scenarioType?: string;
  horizonYears: number;
  growthRatePercent?: number;
  drawdownPercent?: number;
  annualContribution?: number;
  annualWithdrawal?: number;
}

export interface FamilyWealthScenarioResult {
  id?: number;
  label: string;
  scenarioType: string;
  timeline: Array<{ year: number; projectedNetWorth: number }>;
  assumptions: {
    growthRatePercent: number;
    drawdownPercent: number;
    annualContribution: number;
    annualWithdrawal: number;
  };
}

function projectNetWorthOverHorizon(
  startingNetWorth: number,
  input: FamilyWealthScenarioInput
): Array<{ year: number; projectedNetWorth: number }> {
  const horizon = Math.max(1, Math.min(input.horizonYears, 50));
  const growthRate = (input.growthRatePercent ?? 0) / 100;
  const drawdown = (input.drawdownPercent ?? 0) / 100;
  const contribution = input.annualContribution ?? 0;
  const withdrawal = input.annualWithdrawal ?? 0;

  const timeline: Array<{ year: number; projectedNetWorth: number }> = [];
  let current = startingNetWorth;

  for (let year = 1; year <= horizon; year += 1) {
    const applicableGrowth = year === 1 ? growthRate - drawdown : growthRate;
    current = roundCurrency(current * (1 + applicableGrowth) + contribution - withdrawal);
    timeline.push({ year, projectedNetWorth: current });
  }

  return timeline;
}

export async function runFamilyWealthScenario(
  userId: number,
  scenarioInput: FamilyWealthScenarioInput,
  options: { persist?: boolean } = {}
): Promise<FamilyWealthScenarioResult> {
  const overview = await buildFamilyWealthOverview(userId, { persistSnapshot: false });

  const timeline = projectNetWorthOverHorizon(overview.totals.netWorth, scenarioInput);
  const scenarioType = (scenarioInput.scenarioType ?? 'BASELINE').toUpperCase();

  let persistedId: number | undefined;

  if (options.persist) {
    const created = await prisma.familyWealthScenario.create({
      data: {
        userId,
        label: scenarioInput.label,
        scenarioType,
        parameters: {
          ...scenarioInput
        },
        results: {
          timeline
        }
      }
    });

    persistedId = created.id;
  }

  return {
    id: persistedId,
    label: scenarioInput.label,
    scenarioType,
    timeline,
    assumptions: {
      growthRatePercent: scenarioInput.growthRatePercent ?? 0,
      drawdownPercent: scenarioInput.drawdownPercent ?? 0,
      annualContribution: scenarioInput.annualContribution ?? 0,
      annualWithdrawal: scenarioInput.annualWithdrawal ?? 0
    }
  };
}

export interface StressTestInput {
  rentDropPercent?: number;
  propertyValueShockPercent?: number;
  interestRateShockPercent?: number;
  marketShockPercent?: number;
}

export interface StressTestResult {
  baseNetWorth: number;
  stressedNetWorth: number;
  deltas: {
    netWorth: number;
    property: number;
    companies: number;
    trusts: number;
    liquidity: number;
  };
}

export async function runFamilyWealthStressTest(
  userId: number,
  input: StressTestInput
): Promise<StressTestResult> {
  const overview = await buildFamilyWealthOverview(userId, { persistSnapshot: false });

  const propertyShock = (input.propertyValueShockPercent ?? input.rentDropPercent ?? 0) / 100;
  const marketShock = (input.marketShockPercent ?? 0) / 100;
  const interestShock = (input.interestRateShockPercent ?? 0) / 100;

  const propertyDelta = roundCurrency(overview.breakdown.personalProperty.netValue * propertyShock);
  const companyDelta = roundCurrency(overview.breakdown.companies.total * marketShock);
  const trustDelta = roundCurrency(overview.breakdown.trusts.total * marketShock);
  const liquidityDelta = roundCurrency(-overview.breakdown.liabilities.total * interestShock * 0.2);

  const stressedNetWorth = roundCurrency(
    overview.totals.netWorth + propertyDelta + companyDelta + trustDelta + liquidityDelta
  );

  return {
    baseNetWorth: overview.totals.netWorth,
    stressedNetWorth,
    deltas: {
      netWorth: roundCurrency(stressedNetWorth - overview.totals.netWorth),
      property: propertyDelta,
      companies: companyDelta,
      trusts: trustDelta,
      liquidity: liquidityDelta
    }
  };
}

export async function listFamilyWealthScenarios(userId: number): Promise<FamilyWealthScenarioResult[]> {
  const scenarios = await prisma.familyWealthScenario.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
  });

  return scenarios.map((scenario) => {
    const timeline = Array.isArray((scenario.results as { timeline?: unknown } | null)?.timeline)
      ? ((scenario.results as { timeline: Array<{ year: number; projectedNetWorth: number }> }).timeline)
      : projectNetWorthOverHorizon(
          decimalToNumber(
            ((scenario as { metadata?: Prisma.JsonValue | null }).metadata as { baseNetWorth?: number } | null)?.baseNetWorth ?? 0
          ),
          {
            label: scenario.label,
            scenarioType: scenario.scenarioType,
            horizonYears: 10
          }
        );

    return {
      id: scenario.id,
      label: scenario.label,
      scenarioType: scenario.scenarioType,
      timeline,
      assumptions: {
        growthRatePercent: Number((scenario.parameters as { growthRatePercent?: number } | null)?.growthRatePercent ?? 0),
        drawdownPercent: Number((scenario.parameters as { drawdownPercent?: number } | null)?.drawdownPercent ?? 0),
        annualContribution: Number((scenario.parameters as { annualContribution?: number } | null)?.annualContribution ?? 0),
        annualWithdrawal: Number((scenario.parameters as { annualWithdrawal?: number } | null)?.annualWithdrawal ?? 0)
      }
    };
  });
}

export async function deleteFamilyWealthScenario(userId: number, scenarioId: number): Promise<boolean> {
  const result = await prisma.familyWealthScenario.deleteMany({
    where: { id: scenarioId, userId }
  });

  return result.count > 0;
}
