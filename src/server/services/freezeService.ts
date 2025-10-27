import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { freezeAssetSchema, freezeScenarioSchema, freezeSimulationSchema, type FreezeSimulationSchema } from './freezeSchemas';
import { computeFreezeSimulation } from './successionCalculator';

const shareholderInclude = Prisma.validator<Prisma.ShareholderInclude>()({
  familyTrust: { select: { id: true, name: true } },
  familyTrustBeneficiaries: {
    select: {
      trust: { select: { id: true, name: true } }
    }
  }
});

type ShareholderWithRelations = Prisma.ShareholderGetPayload<{ include: typeof shareholderInclude }>;

const freezeAssetInclude = Prisma.validator<Prisma.FreezeAssetInclude>()({
  company: { select: { id: true, name: true } },
  property: { select: { id: true, name: true } }
});

type FreezeAssetWithRelations = Prisma.FreezeAssetGetPayload<{ include: typeof freezeAssetInclude }>;

const familyTrustInclude = Prisma.validator<Prisma.FamilyTrustInclude>()({
  fiduciaries: {
    select: {
      id: true,
      fullName: true,
      role: true,
      email: true
    },
    orderBy: [{ fullName: 'asc' }]
  },
  beneficiaries: {
    select: {
      id: true,
      displayName: true,
      relationship: true,
      birthDate: true,
      preferredAllocationPercent: true,
      lifetimeCapitalGainsExemptionClaimed: true,
      notes: true,
      shareholder: { select: { id: true, displayName: true } }
    },
    orderBy: [{ displayName: 'asc' }]
  }
});

type FamilyTrustWithRelations = Prisma.FamilyTrustGetPayload<{ include: typeof familyTrustInclude }>;

const freezeScenarioInclude = Prisma.validator<Prisma.FreezeScenarioInclude>()({
  trust: {
    select: {
      id: true,
      name: true,
      beneficiaries: {
        select: {
          id: true,
          displayName: true,
          preferredAllocationPercent: true
        }
      }
    }
  },
  assets: {
    include: {
      asset: {
        include: freezeAssetInclude
      }
    }
  }
});

type FreezeScenarioWithRelations = Prisma.FreezeScenarioGetPayload<{ include: typeof freezeScenarioInclude }>;

const freezeSimulationInclude = Prisma.validator<Prisma.FreezeSimulationInclude>()({
  scenario: { include: freezeScenarioInclude },
  result: true,
  beneficiaryResults: true,
  redemptions: true,
  dividends: true
});

type FreezeSimulationWithRelations = Prisma.FreezeSimulationGetPayload<{ include: typeof freezeSimulationInclude }>;

function toNumber(value: Prisma.Decimal | number | null | undefined, fallback = 0): number {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
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

export interface FreezeShareholderSummary {
  id: number;
  displayName: string;
  type: string;
  lifetimeCapitalGainsExemptionRemaining: number | null;
  trust?: { id: number; name: string } | null;
  beneficiaryOf: Array<{ trustId: number; trustName: string }>;
}

export interface FreezeAssetSummary {
  id: number;
  label: string;
  assetType: string;
  fairMarketValue: number;
  adjustedCostBase: number;
  annualGrowthPercent: number;
  distributionYieldPercent: number;
  associatedDebt: number | null;
  company: { id: number; name: string } | null;
  property: { id: number; name: string } | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FreezeTrustSummary {
  id: number;
  name: string;
  establishedOn: string | null;
  netAssetValue: number;
  mandate: string | null;
  notes: string | null;
  fiduciaries: Array<{ id: number; fullName: string; role: string | null; email: string | null }>;
  beneficiaries: Array<{
    id: number;
    displayName: string;
    relationship: string | null;
    birthDate: string | null;
    preferredAllocationPercent: number | null;
    lifetimeCapitalGainsExemptionClaimed: number | null;
    notes: string | null;
    shareholder: { id: number; displayName: string } | null;
  }>;
}

export interface FreezeScenarioAssetInput {
  assetId: number;
  inclusionPercent?: number;
}

export interface CreateFreezeAssetInput {
  label: string;
  assetType: string;
  fairMarketValue: number;
  adjustedCostBase: number;
  annualGrowthPercent?: number;
  distributionYieldPercent?: number;
  associatedDebt?: number | null;
  companyId?: number | null;
  propertyId?: number | null;
  notes?: string | null;
}

export interface UpdateFreezeAssetInput extends CreateFreezeAssetInput {}

export interface CreateFreezeScenarioInput {
  trustId?: number | null;
  label: string;
  baseYear: number;
  freezeRatePercent?: number;
  preferredDividendRatePercent?: number;
  redemptionYears?: number;
  notes?: string | null;
  assets: FreezeScenarioAssetInput[];
}

export interface UpdateFreezeScenarioInput extends CreateFreezeScenarioInput {}

export interface FreezeScenarioSummary {
  id: number;
  label: string;
  baseYear: number;
  freezeRatePercent: number;
  preferredDividendRatePercent: number;
  redemptionYears: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  trust: { id: number; name: string; beneficiaries: Array<{ id: number; displayName: string; preferredAllocationPercent: number | null }> } | null;
  trustBeneficiaries: Array<{
    id: number | null;
    displayName: string;
    preferredAllocationPercent: number | null;
  }>;
  assets: Array<{
    assetId: number;
    inclusionPercent: number;
    asset: FreezeAssetSummary;
  }>;
}

export type FreezeSimulationInput = FreezeSimulationSchema;

export interface FreezeSimulationSummary {
  id: number;
  scenarioId: number;
  targetFreezeYear: number;
  generations: number;
  reinvestmentRatePercent: number;
  marginalTaxRatePercent: number;
  dividendRetentionPercent: number;
  createdAt: string;
  updatedAt: string;
  scenario: FreezeScenarioSummary;
  result: {
    preferredShareValue: number;
    capitalGainTriggered: number;
    capitalGainTax: number;
    totalDividends: number;
    totalAfterTaxRetained: number;
    latentTaxBefore: number;
    latentTaxAfter: number;
    notes: Record<string, unknown> | null;
  } | null;
  beneficiaryResults: Array<{
    id: number;
    beneficiaryId: number | null;
    beneficiaryName: string;
    cumulativeValue: number;
  }>;
  redemptions: Array<{
    id: number;
    year: number;
    outstanding: number;
    redeemed: number;
  }>;
  dividends: Array<{
    id: number;
    year: number;
    amount: number;
    taxableAmount: number;
    afterTaxRetained: number;
  }>;
}

function mapFreezeAsset(record: FreezeAssetWithRelations): FreezeAssetSummary {
  return {
    id: record.id,
    label: record.label,
    assetType: record.assetType,
    fairMarketValue: toNumber(record.fairMarketValue),
    adjustedCostBase: toNumber(record.adjustedCostBase),
    annualGrowthPercent: toNumber(record.annualGrowthPercent),
    distributionYieldPercent: toNumber(record.distributionYieldPercent),
    associatedDebt: toNullableNumber(record.associatedDebt),
    company: record.company,
    property: record.property,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

function mapScenario(record: FreezeScenarioWithRelations): FreezeScenarioSummary {
  return {
    id: record.id,
    label: record.label,
    baseYear: record.baseYear,
    freezeRatePercent: toNumber(record.freezeRatePercent),
    preferredDividendRatePercent: toNumber(record.preferredDividendRatePercent),
    redemptionYears: record.redemptionYears,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    trust: record.trust
      ? {
          id: record.trust.id,
          name: record.trust.name,
          beneficiaries: record.trust.beneficiaries.map((beneficiary) => ({
            id: beneficiary.id,
            displayName: beneficiary.displayName,
            preferredAllocationPercent: toNullableNumber(beneficiary.preferredAllocationPercent)
          }))
        }
      : null,
    trustBeneficiaries: record.trust
      ? record.trust.beneficiaries.map((beneficiary) => ({
          id: beneficiary.id,
          displayName: beneficiary.displayName,
          preferredAllocationPercent: toNullableNumber(beneficiary.preferredAllocationPercent)
        }))
      : [],
    assets: record.assets.map((link) => ({
      assetId: link.assetId,
      inclusionPercent: toNumber(link.inclusionPercent ?? 100, 100),
      asset: mapFreezeAsset(link.asset)
    }))
  };
}

function mapSimulation(record: FreezeSimulationWithRelations): FreezeSimulationSummary {
  return {
    id: record.id,
    scenarioId: record.scenarioId,
    targetFreezeYear: record.targetFreezeYear,
    generations: record.generations,
    reinvestmentRatePercent: toNumber(record.reinvestmentRatePercent),
    marginalTaxRatePercent: toNumber(record.marginalTaxRatePercent),
    dividendRetentionPercent: toNumber(record.dividendRetentionPercent),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    scenario: mapScenario(record.scenario),
    result: record.result
      ? {
          preferredShareValue: toNumber(record.result.preferredShareValue),
          capitalGainTriggered: toNumber(record.result.capitalGainTriggered),
          capitalGainTax: toNumber(record.result.capitalGainTax),
          totalDividends: toNumber(record.result.totalDividends),
          totalAfterTaxRetained: toNumber(record.result.totalAfterTaxRetained),
          latentTaxBefore: toNumber(record.result.latentTaxBefore),
          latentTaxAfter: toNumber(record.result.latentTaxAfter),
          notes: record.result.notes as Record<string, unknown> | null
        }
      : null,
    beneficiaryResults: record.beneficiaryResults.map((beneficiary) => ({
      id: beneficiary.id,
      beneficiaryId: beneficiary.beneficiaryId,
      beneficiaryName: beneficiary.beneficiaryName,
      cumulativeValue: toNumber(beneficiary.cumulativeValue)
    })),
    redemptions: record.redemptions.map((redemption) => ({
      id: redemption.id,
      year: redemption.year,
      outstanding: toNumber(redemption.outstanding),
      redeemed: toNumber(redemption.redeemed)
    })),
    dividends: record.dividends.map((dividend) => ({
      id: dividend.id,
      year: dividend.year,
      amount: toNumber(dividend.amount),
      taxableAmount: toNumber(dividend.taxableAmount),
      afterTaxRetained: toNumber(dividend.afterTaxRetained)
    }))
  };
}

export async function listFreezeShareholders(userId: number): Promise<FreezeShareholderSummary[]> {
  const shareholders: ShareholderWithRelations[] = await prisma.shareholder.findMany({
    where: { userId },
    include: shareholderInclude,
    orderBy: [{ displayName: 'asc' }]
  });

  return shareholders.map((shareholder) => {
    const beneficiaryTrusts = (shareholder.familyTrustBeneficiaries ?? [])
      .map((link) => link.trust)
      .filter((trust): trust is NonNullable<typeof trust> => Boolean(trust))
      .map((trust) => ({ trustId: trust.id, trustName: trust.name }));

    return {
    id: shareholder.id,
    displayName: shareholder.displayName,
    type: shareholder.type,
    lifetimeCapitalGainsExemptionRemaining: toNullableNumber(
        shareholder.lifetimeCapitalGainsExemptionRemaining as Prisma.Decimal | null
      ),
      trust: shareholder.familyTrust ?? null,
      beneficiaryOf: beneficiaryTrusts
    };
  });
}

function buildAssetWhereClause(userId: number, assetId: number) {
  return { id: assetId, userId };
}

export async function listFreezeAssets(userId: number): Promise<FreezeAssetSummary[]> {
  const assets = await prisma.freezeAsset.findMany({
    where: { userId },
    orderBy: [{ label: 'asc' }],
    include: freezeAssetInclude
  });

  return assets.map(mapFreezeAsset);
}

function sanitizeAssetPayload(input: CreateFreezeAssetInput) {
  return {
    label: input.label.trim(),
    assetType: input.assetType.trim().toUpperCase(),
    fairMarketValue: input.fairMarketValue,
    adjustedCostBase: input.adjustedCostBase,
    annualGrowthPercent: input.annualGrowthPercent ?? 0,
    distributionYieldPercent: input.distributionYieldPercent ?? 0,
    associatedDebt: input.associatedDebt ?? null,
    companyId: input.companyId ?? null,
    propertyId: input.propertyId ?? null,
    notes: input.notes?.trim() ?? null
  };
}

export async function createFreezeAsset(
  userId: number,
  input: CreateFreezeAssetInput
): Promise<FreezeAssetSummary> {
  const parsed = freezeAssetSchema.parse(input);
  const payload = sanitizeAssetPayload(parsed);

  const created = await prisma.freezeAsset.create({
    data: {
      ...payload,
      userId
    },
    include: freezeAssetInclude
  });

  return mapFreezeAsset(created);
}

export async function updateFreezeAsset(
  userId: number,
  assetId: number,
  input: UpdateFreezeAssetInput
): Promise<FreezeAssetSummary | null> {
  const existing = await prisma.freezeAsset.findFirst({
    where: buildAssetWhereClause(userId, assetId)
  });

  if (!existing) {
    return null;
  }

  const parsed = freezeAssetSchema.parse(input);
  const payload = sanitizeAssetPayload(parsed);

  const updated = await prisma.freezeAsset.update({
    where: { id: assetId },
    data: payload,
    include: freezeAssetInclude
  });

  return mapFreezeAsset(updated);
}

export async function deleteFreezeAsset(userId: number, assetId: number): Promise<boolean> {
  const result = await prisma.freezeAsset.deleteMany({
    where: buildAssetWhereClause(userId, assetId)
  });

  return result.count > 0;
}

export async function listFamilyTrusts(userId: number): Promise<FreezeTrustSummary[]> {
  const trusts: FamilyTrustWithRelations[] = await prisma.familyTrust.findMany({
    where: { userId },
    orderBy: [{ name: 'asc' }],
    include: familyTrustInclude
  });

  return trusts.map((trust) => ({
    id: trust.id,
    name: trust.name,
    establishedOn: trust.establishedOn ? trust.establishedOn.toISOString() : null,
    netAssetValue: toNumber(trust.netAssetValue),
    mandate: trust.mandate ?? null,
    notes: trust.notes ?? null,
    fiduciaries: trust.fiduciaries.map((fiduciary) => ({
      id: fiduciary.id,
      fullName: fiduciary.fullName,
      role: fiduciary.role ?? null,
      email: fiduciary.email ?? null
    })),
    beneficiaries: trust.beneficiaries.map((beneficiary) => ({
      id: beneficiary.id,
      displayName: beneficiary.displayName,
      relationship: beneficiary.relationship ?? null,
      birthDate: beneficiary.birthDate ? beneficiary.birthDate.toISOString() : null,
      preferredAllocationPercent: toNullableNumber(beneficiary.preferredAllocationPercent),
      lifetimeCapitalGainsExemptionClaimed: toNullableNumber(
        beneficiary.lifetimeCapitalGainsExemptionClaimed
      ),
      notes: beneficiary.notes ?? null,
      shareholder: beneficiary.shareholder ?? null
    }))
  }));
}

export async function listFreezeScenarios(userId: number): Promise<FreezeScenarioSummary[]> {
  const scenarios = await prisma.freezeScenario.findMany({
    where: { userId },
    orderBy: [{ updatedAt: 'desc' }],
    include: freezeScenarioInclude
  });

  return scenarios.map(mapScenario);
}

async function ensureTrustOwnership(userId: number, trustId: number) {
  if (!trustId) {
    return true;
  }

  const trust = await prisma.familyTrust.findFirst({
    where: { id: trustId, userId },
    select: { id: true }
  });

  return Boolean(trust);
}

async function ensureAssetOwnership(userId: number, assetIds: number[]): Promise<boolean> {
  if (assetIds.length === 0) {
    return true;
  }

  const count = await prisma.freezeAsset.count({
    where: {
      id: { in: assetIds },
      userId
    }
  });

  return count === assetIds.length;
}

function sanitizeScenarioPayload(input: CreateFreezeScenarioInput) {
  return {
    trustId: input.trustId ?? null,
    label: input.label.trim(),
    baseYear: input.baseYear,
    freezeRatePercent: input.freezeRatePercent ?? 0,
    preferredDividendRatePercent: input.preferredDividendRatePercent ?? 0,
    redemptionYears: input.redemptionYears ?? 20,
    notes: input.notes?.trim() ?? null,
    assets: input.assets.map((asset) => ({
      assetId: asset.assetId,
      inclusionPercent: asset.inclusionPercent ?? 100
    }))
  };
}

export async function createFreezeScenario(
  userId: number,
  input: CreateFreezeScenarioInput
): Promise<FreezeScenarioSummary | null> {
  const parsed = freezeScenarioSchema.parse(input);
  const payload = sanitizeScenarioPayload(parsed);

  if (!(await ensureTrustOwnership(userId, payload.trustId ?? 0))) {
    return null;
  }

  const assetIds = payload.assets.map((asset) => asset.assetId);
  if (!(await ensureAssetOwnership(userId, assetIds))) {
    return null;
  }

  const created = await prisma.freezeScenario.create({
    data: {
      userId,
      trustId: payload.trustId,
      label: payload.label,
      baseYear: payload.baseYear,
      freezeRatePercent: payload.freezeRatePercent,
      preferredDividendRatePercent: payload.preferredDividendRatePercent,
      redemptionYears: payload.redemptionYears,
      notes: payload.notes,
      assets: {
        create: payload.assets.map((asset) => ({
          assetId: asset.assetId,
          inclusionPercent: asset.inclusionPercent
        }))
      }
    },
    include: freezeScenarioInclude
  });

  return mapScenario(created);
}

export async function updateFreezeScenario(
  userId: number,
  scenarioId: number,
  input: UpdateFreezeScenarioInput
): Promise<FreezeScenarioSummary | null> {
  const parsed = freezeScenarioSchema.parse(input);
  const payload = sanitizeScenarioPayload(parsed);

  const existing = await prisma.freezeScenario.findFirst({
    where: { id: scenarioId, userId }
  });

  if (!existing) {
    return null;
  }

  if (!(await ensureTrustOwnership(userId, payload.trustId ?? 0))) {
    return null;
  }

  const assetIds = payload.assets.map((asset) => asset.assetId);
  if (!(await ensureAssetOwnership(userId, assetIds))) {
    return null;
  }

  const updated = await prisma.freezeScenario.update({
    where: { id: scenarioId },
    data: {
      trustId: payload.trustId,
      label: payload.label,
      baseYear: payload.baseYear,
      freezeRatePercent: payload.freezeRatePercent,
      preferredDividendRatePercent: payload.preferredDividendRatePercent,
      redemptionYears: payload.redemptionYears,
      notes: payload.notes,
      assets: {
        deleteMany: {},
        create: payload.assets.map((asset) => ({
          assetId: asset.assetId,
          inclusionPercent: asset.inclusionPercent
        }))
      }
    },
    include: freezeScenarioInclude
  });

  return mapScenario(updated);
}

export async function deleteFreezeScenario(userId: number, scenarioId: number): Promise<boolean> {
  const deleted = await prisma.freezeScenario.deleteMany({
    where: { id: scenarioId, userId }
  });

  return deleted.count > 0;
}

async function getScenarioForUser(userId: number, scenarioId: number): Promise<FreezeScenarioWithRelations | null> {
  return prisma.freezeScenario.findFirst({
    where: { id: scenarioId, userId },
    include: freezeScenarioInclude
  });
}

export async function listFreezeSimulations(userId: number): Promise<FreezeSimulationSummary[]> {
  const simulations = await prisma.freezeSimulation.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }],
    include: freezeSimulationInclude
  });

  return simulations.map(mapSimulation);
}

export async function getFreezeSimulation(
  userId: number,
  simulationId: number
): Promise<FreezeSimulationSummary | null> {
  const simulation = await prisma.freezeSimulation.findFirst({
    where: { id: simulationId, userId },
    include: freezeSimulationInclude
  });

  if (!simulation) {
    return null;
  }

  return mapSimulation(simulation);
}

export async function createFreezeSimulation(
  userId: number,
  input: FreezeSimulationInput
): Promise<FreezeSimulationSummary | null> {
  const scenario = await getScenarioForUser(userId, input.scenarioId);
  if (!scenario) {
    return null;
  }

  const parsedInput = freezeSimulationSchema.parse(input);

  const payload = {
    targetFreezeYear: parsedInput.targetFreezeYear,
    generations: parsedInput.generations,
    reinvestmentRatePercent: parsedInput.reinvestmentRatePercent ?? 0,
    marginalTaxRatePercent: parsedInput.marginalTaxRatePercent ?? 0,
    dividendRetentionPercent: parsedInput.dividendRetentionPercent ?? 0
  };

  const mappedScenario = mapScenario(scenario);

  const computation = computeFreezeSimulation(mappedScenario, parsedInput);
  const computationNotes = computation.notes as unknown as Prisma.InputJsonValue;

  const created = await prisma.$transaction(async (tx) => {
    const simulation = await tx.freezeSimulation.create({
      data: {
        userId,
        scenarioId: scenario.id,
        ...payload
      }
    });

    await tx.freezeSimulationResult.create({
      data: {
        simulationId: simulation.id,
        preferredShareValue: computation.preferredShareValue,
        capitalGainTriggered: computation.capitalGainTriggered,
        capitalGainTax: computation.capitalGainTax,
        totalDividends: computation.totalDividends,
        totalAfterTaxRetained: computation.totalAfterTaxRetained,
        latentTaxBefore: computation.latentTaxBefore,
        latentTaxAfter: computation.latentTaxAfter,
        notes: computationNotes
      }
    });

    if (computation.beneficiaryResults.length > 0) {
      await tx.freezeSimulationBeneficiaryResult.createMany({
        data: computation.beneficiaryResults.map((beneficiary) => ({
          simulationId: simulation.id,
          beneficiaryId: beneficiary.beneficiaryId,
          beneficiaryName: beneficiary.beneficiaryName,
          cumulativeValue: beneficiary.cumulativeValue
        }))
      });
    }

    if (computation.redemptions.length > 0) {
      await tx.freezeSimulationRedemption.createMany({
        data: computation.redemptions.map((redemption) => ({
          simulationId: simulation.id,
          year: redemption.year,
          outstanding: redemption.outstanding,
          redeemed: redemption.redeemed
        }))
      });
    }

    if (computation.dividends.length > 0) {
      await tx.freezeSimulationDividend.createMany({
        data: computation.dividends.map((dividend) => ({
          simulationId: simulation.id,
          year: dividend.year,
          amount: dividend.amount,
          taxableAmount: dividend.taxableAmount,
          afterTaxRetained: dividend.afterTaxRetained
        }))
      });
    }

    return simulation;
  });

  return getFreezeSimulation(userId, created.id);
}
