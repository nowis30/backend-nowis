import type { Prisma } from '@prisma/client';

import { roundCurrency } from './utils/numbers';
import type { FreezeSimulationInput, FreezeScenarioSummary } from './freezeService';

interface FreezeAssetForCalculation {
  id: number;
  fairMarketValue: number;
  adjustedCostBase: number;
  associatedDebt: number;
  annualGrowthRate: number;
  distributionYieldRate: number;
  inclusionPercent: number;
}

interface FreezeScenarioForCalculation {
  id: number;
  label: string;
  baseYear: number;
  freezeRatePercent: number;
  preferredDividendRatePercent: number;
  redemptionYears: number;
  trustBeneficiaries: Array<{
    id: number | null;
    name: string;
    allocationPercent: number;
  }>;
  assets: FreezeAssetForCalculation[];
}

export interface FreezeComputationNotes {
  horizonYears: number;
  growthAssumptionPercent: number;
  redemptionYears: number;
  marginalTaxRatePercent: number;
  dividendRetentionPercent: number;
  reinvestmentRatePercent: number;
  totalInclusionPercent: number;
}

export interface FreezeComputationResult {
  preferredShareValue: number;
  capitalGainTriggered: number;
  capitalGainTax: number;
  totalDividends: number;
  totalAfterTaxRetained: number;
  latentTaxBefore: number;
  latentTaxAfter: number;
  notes: FreezeComputationNotes;
  beneficiaryResults: Array<{
    beneficiaryId: number | null;
    beneficiaryName: string;
    cumulativeValue: number;
  }>;
  redemptions: Array<{
    year: number;
    outstanding: number;
    redeemed: number;
  }>;
  dividends: Array<{
    year: number;
    amount: number;
    taxableAmount: number;
    afterTaxRetained: number;
  }>;
}

function toAssetsForCalculation(scenario: FreezeScenarioSummary): FreezeAssetForCalculation[] {
  return scenario.assets.map((link) => ({
    id: link.assetId,
    fairMarketValue: link.asset.fairMarketValue,
    adjustedCostBase: link.asset.adjustedCostBase,
    associatedDebt: link.asset.associatedDebt ?? 0,
    annualGrowthRate: link.asset.annualGrowthPercent / 100,
    distributionYieldRate: link.asset.distributionYieldPercent / 100,
    inclusionPercent: link.inclusionPercent
  }));
}

function normalizeScenario(scenario: FreezeScenarioSummary): FreezeScenarioForCalculation {
  const beneficiaries = scenario.trust?.id
    ? scenario.trustBeneficiaries?.map((beneficiary) => ({
        id: beneficiary.id ?? null,
        name: beneficiary.displayName,
        allocationPercent: beneficiary.preferredAllocationPercent ?? 0
      })) ?? []
    : [];

  const totalAllocation = beneficiaries.reduce((total, item) => total + item.allocationPercent, 0);
  const fallbackAllocation = beneficiaries.length > 0 && totalAllocation === 0 ? 1 / beneficiaries.length : 0;

  const normalizedBeneficiaries = beneficiaries.map((beneficiary) => ({
    id: beneficiary.id,
    name: beneficiary.name,
    allocationPercent:
      totalAllocation > 0 ? beneficiary.allocationPercent / totalAllocation : fallbackAllocation
  }));

  return {
    id: scenario.id,
    label: scenario.label,
    baseYear: scenario.baseYear,
    freezeRatePercent: scenario.freezeRatePercent,
    preferredDividendRatePercent: scenario.preferredDividendRatePercent,
    redemptionYears: scenario.redemptionYears,
    trustBeneficiaries: normalizedBeneficiaries,
    assets: toAssetsForCalculation(scenario)
  };
}

function computeGrowthFactor(ratePercent: number, horizonYears: number): number {
  const rate = ratePercent / 100;
  return Math.pow(1 + rate, Math.max(horizonYears, 0));
}

function computePreferredShareValue(assets: FreezeAssetForCalculation[], growthFactor: number): number {
  return roundCurrency(
    assets.reduce((total, asset) => {
      const base = asset.fairMarketValue * (asset.inclusionPercent / 100);
      return total + base * growthFactor;
    }, 0)
  );
}

function computeCapitalGain(assets: FreezeAssetForCalculation[]): number {
  return roundCurrency(
    assets.reduce((total, asset) => {
      const inclusion = asset.inclusionPercent / 100;
      const gain = (asset.fairMarketValue - asset.adjustedCostBase) * inclusion;
      return total + Math.max(gain, 0);
    }, 0)
  );
}

function computeLatentTax(value: number, marginalRatePercent: number): number {
  const rate = marginalRatePercent / 100;
  return roundCurrency(value * rate);
}

function buildRedemptionSchedule(total: number, years: number): Array<{ year: number; outstanding: number; redeemed: number }> {
  const horizon = Math.max(1, years);
  const annualRedemption = roundCurrency(total / horizon);

  let outstanding = total;
  const schedule: Array<{ year: number; outstanding: number; redeemed: number }> = [];

  for (let year = 1; year <= horizon; year += 1) {
    const redeemed = year === horizon ? outstanding : Math.min(outstanding, annualRedemption);
    const nextOutstanding = roundCurrency(outstanding - redeemed);
    schedule.push({ year, outstanding: roundCurrency(outstanding), redeemed: roundCurrency(redeemed) });
    outstanding = nextOutstanding;
  }

  return schedule;
}

function buildDividendSchedule(
  baseValue: number,
  annualRatePercent: number,
  retentionPercent: number,
  marginalRatePercent: number,
  years: number
): Array<{ year: number; amount: number; taxableAmount: number; afterTaxRetained: number }> {
  const annualRate = annualRatePercent / 100;
  const retentionRate = retentionPercent / 100;
  const marginalRate = marginalRatePercent / 100;
  const horizon = Math.max(1, years);

  const schedule: Array<{ year: number; amount: number; taxableAmount: number; afterTaxRetained: number }> = [];
  let currentBase = baseValue;

  for (let year = 1; year <= horizon; year += 1) {
    const amount = roundCurrency(currentBase * annualRate);
    const taxableAmount = roundCurrency(amount * (1 - retentionRate));
    const net = roundCurrency(taxableAmount * (1 - marginalRate));
    schedule.push({
      year,
      amount,
      taxableAmount,
      afterTaxRetained: roundCurrency(net + amount * retentionRate)
    });
    currentBase = roundCurrency(currentBase + net);
  }

  return schedule;
}

function allocateBeneficiaries(
  totalValue: number,
  beneficiaries: FreezeScenarioForCalculation['trustBeneficiaries']
): Array<{ beneficiaryId: number | null; beneficiaryName: string; cumulativeValue: number }> {
  if (beneficiaries.length === 0 || totalValue <= 0) {
    return [];
  }

  return beneficiaries.map((beneficiary) => ({
    beneficiaryId: beneficiary.id,
    beneficiaryName: beneficiary.name,
    cumulativeValue: roundCurrency(totalValue * beneficiary.allocationPercent)
  }));
}

export function computeFreezeSimulation(
  scenario: FreezeScenarioSummary,
  input: FreezeSimulationInput
): FreezeComputationResult {
  const normalizedScenario = normalizeScenario(scenario);
  const horizonYears = Math.max(0, input.targetFreezeYear - normalizedScenario.baseYear);
  const growthFactor = computeGrowthFactor(normalizedScenario.freezeRatePercent, horizonYears);

  const preferredShareValue = computePreferredShareValue(normalizedScenario.assets, growthFactor);
  const capitalGainTriggered = computeCapitalGain(normalizedScenario.assets);
  const capitalGainTax = computeLatentTax(capitalGainTriggered, input.marginalTaxRatePercent);

  const latentTaxBefore = computeLatentTax(capitalGainTriggered, input.marginalTaxRatePercent);
  const latentTaxAfter = computeLatentTax(Math.max(preferredShareValue - capitalGainTriggered, 0), input.marginalTaxRatePercent);

  const redemptionSchedule = buildRedemptionSchedule(preferredShareValue, normalizedScenario.redemptionYears);
  const dividendSchedule = buildDividendSchedule(
    preferredShareValue,
    normalizedScenario.preferredDividendRatePercent,
    input.dividendRetentionPercent,
    input.marginalTaxRatePercent,
    normalizedScenario.redemptionYears
  );

  const totalDividends = roundCurrency(dividendSchedule.reduce((total, item) => total + item.amount, 0));
  const totalAfterTaxRetained = roundCurrency(dividendSchedule.reduce((total, item) => total + item.afterTaxRetained, 0));

  const beneficiaryResults = allocateBeneficiaries(totalAfterTaxRetained, normalizedScenario.trustBeneficiaries);

  const totalInclusionPercent = normalizedScenario.assets.reduce((total, asset) => total + asset.inclusionPercent, 0);

  return {
    preferredShareValue,
    capitalGainTriggered,
    capitalGainTax,
    totalDividends,
    totalAfterTaxRetained,
    latentTaxBefore,
    latentTaxAfter,
    notes: {
      horizonYears,
      growthAssumptionPercent: normalizedScenario.freezeRatePercent,
      redemptionYears: normalizedScenario.redemptionYears,
      marginalTaxRatePercent: input.marginalTaxRatePercent,
      dividendRetentionPercent: input.dividendRetentionPercent,
      reinvestmentRatePercent: input.reinvestmentRatePercent,
      totalInclusionPercent
    },
    beneficiaryResults,
    redemptions: redemptionSchedule,
    dividends: dividendSchedule
  };
}

export function roundDecimal(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return roundCurrency(typeof value === 'number' ? value : value.toNumber());
}
