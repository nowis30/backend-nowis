import { z } from 'zod';

export const percentSchema = z.number().min(0).max(1_000);
export const optionalPercentSchema = percentSchema.optional();

export const freezeAssetSchema = z.object({
  label: z.string().trim().min(1),
  assetType: z.string().trim().min(1),
  fairMarketValue: z.coerce.number().nonnegative(),
  adjustedCostBase: z.coerce.number().nonnegative(),
  annualGrowthPercent: optionalPercentSchema.default(0),
  distributionYieldPercent: optionalPercentSchema.default(0),
  associatedDebt: z.coerce.number().optional().nullable(),
  companyId: z.coerce.number().int().positive().optional().nullable(),
  propertyId: z.coerce.number().int().positive().optional().nullable(),
  notes: z.string().trim().max(1_000).optional().nullable()
});

export const freezeScenarioAssetSchema = z.object({
  assetId: z.coerce.number().int().positive(),
  inclusionPercent: percentSchema.default(100)
});

export const freezeScenarioSchema = z.object({
  trustId: z.coerce.number().int().positive().optional().nullable(),
  label: z.string().trim().min(1),
  baseYear: z.coerce.number().int().min(1980).max(2100),
  freezeRatePercent: optionalPercentSchema.default(0),
  preferredDividendRatePercent: optionalPercentSchema.default(0),
  redemptionYears: z.coerce.number().int().min(1).max(100).default(20),
  notes: z.string().trim().max(2_000).optional().nullable(),
  assets: z.array(freezeScenarioAssetSchema).min(1)
});

export const freezeSimulationSchema = z.object({
  scenarioId: z.coerce.number().int().positive(),
  targetFreezeYear: z.coerce.number().int().min(1980).max(2150),
  generations: z.coerce.number().int().min(1).max(5),
  reinvestmentRatePercent: optionalPercentSchema.default(0),
  marginalTaxRatePercent: optionalPercentSchema.default(0),
  dividendRetentionPercent: optionalPercentSchema.default(0)
});

export type FreezeSimulationSchema = z.infer<typeof freezeSimulationSchema>;
