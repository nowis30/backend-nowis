import { Prisma } from '@prisma/client';

export interface LeveragedBuybackInput {
  loanAmount: number;
  interestRatePercent: number;
  taxRatePercent: number;
  expectedGrowthPercent: number;
  termYears: number;
}

export interface LeveragedBuybackNormalizedInput {
  loanAmount: number;
  interestRate: number;
  taxRate: number;
  expectedGrowth: number;
  termMonths: number;
  termYears: number;
}

export interface LeveragedBuybackMetrics {
  monthlyPayment: number;
  totalInterest: number;
  taxShield: number;
  afterTaxInterest: number;
  projectedShareValue: number;
  projectedShareGain: number;
  netGain: number;
  breakEvenGrowth: number;
  returnOnInvestment: number;
  paybackYears: number | null;
}

export interface LeveragedBuybackComputation {
  input: LeveragedBuybackNormalizedInput;
  metrics: LeveragedBuybackMetrics;
}

export interface LeveragedBuybackScenarioDto {
  id: number;
  label: string | null;
  companyId: number | null;
  companyName: string | null;
  approved: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  generatedAt: string;
  inputs: {
    loanAmount: number;
    interestRatePercent: number;
    taxRatePercent: number;
    expectedGrowthPercent: number;
    termYears: number;
  };
  metrics: LeveragedBuybackMetrics & {
    monthlyPaymentRounded: number;
    breakEvenGrowthPercent: number;
    returnOnInvestmentPercent: number;
  };
}

export function normalizeLeveragedBuybackInput(input: LeveragedBuybackInput): LeveragedBuybackNormalizedInput {
  const loanAmount = Math.max(0, input.loanAmount);
  const interestRate = clampPercent(input.interestRatePercent);
  const taxRate = clampPercent(input.taxRatePercent, 0, 100, true);
  const expectedGrowth = clampPercent(input.expectedGrowthPercent, -100, 300, true);

  const minMonths = 1;
  const rawMonths = Math.round(Math.max(input.termYears, 0.083333) * 12);
  const termMonths = Number.isFinite(rawMonths) ? Math.max(minMonths, rawMonths) : minMonths;
  const termYears = termMonths / 12;

  return {
    loanAmount,
    interestRate,
    taxRate,
    expectedGrowth,
    termMonths,
    termYears
  };
}

export function calculateLeveragedBuyback(input: LeveragedBuybackInput): LeveragedBuybackComputation {
  const normalized = normalizeLeveragedBuybackInput(input);
  const { loanAmount, interestRate, taxRate, expectedGrowth, termMonths, termYears } = normalized;

  const monthlyRate = interestRate / 12;
  let monthlyPayment: number;
  let totalInterest: number;

  if (monthlyRate === 0) {
    monthlyPayment = termMonths > 0 ? loanAmount / termMonths : loanAmount;
    totalInterest = 0;
  } else {
    const factor = Math.pow(1 + monthlyRate, termMonths);
    monthlyPayment = factor === 1 ? loanAmount / termMonths : (loanAmount * monthlyRate * factor) / (factor - 1);
    const totalPaid = monthlyPayment * termMonths;
    totalInterest = Math.max(0, totalPaid - loanAmount);
  }

  const taxShield = totalInterest * taxRate;
  const afterTaxInterest = totalInterest - taxShield;

  const projectedShareValue = loanAmount * Math.pow(1 + expectedGrowth, termYears);
  const projectedShareGain = projectedShareValue - loanAmount;

  const netGain = projectedShareGain - afterTaxInterest;
  const returnOnInvestment = loanAmount > 0 ? netGain / loanAmount : 0;

  let breakEvenGrowth = 0;
  if (loanAmount > 0) {
    const breakEvenBase = 1 + (afterTaxInterest > -loanAmount ? afterTaxInterest / loanAmount : -0.999999);
    breakEvenGrowth = Math.pow(breakEvenBase, termYears > 0 ? 1 / termYears : 1) - 1;
  }

  let paybackYears: number | null = null;
  if (projectedShareGain > 0 && afterTaxInterest > 0) {
    const annualizedGain = projectedShareGain / (termYears || 1);
    if (annualizedGain > 0) {
      paybackYears = afterTaxInterest / annualizedGain;
    }
  }

  return {
    input: normalized,
    metrics: {
      monthlyPayment,
      totalInterest,
      taxShield,
      afterTaxInterest,
      projectedShareValue,
      projectedShareGain,
      netGain,
      breakEvenGrowth,
      returnOnInvestment,
      paybackYears
    }
  };
}

export function serializeLeveragedScenario(
  scenario: Prisma.LeveragedBuybackScenarioGetPayload<{ include: { company: { select: { id: true; name: true } } } }>
): LeveragedBuybackScenarioDto {
  return {
    id: scenario.id,
    label: scenario.label,
    companyId: scenario.companyId ?? null,
    companyName: scenario.company ? scenario.company.name : null,
    approved: scenario.approved,
    notes: scenario.notes ?? null,
    createdAt: scenario.createdAt.toISOString(),
    updatedAt: scenario.updatedAt.toISOString(),
    generatedAt: scenario.generatedAt.toISOString(),
    inputs: {
      loanAmount: decimalToNumber(scenario.loanAmount),
      interestRatePercent: decimalToNumber(scenario.interestRate) * 100,
      taxRatePercent: decimalToNumber(scenario.taxRate) * 100,
      expectedGrowthPercent: decimalToNumber(scenario.expectedGrowth) * 100,
      termYears: scenario.termMonths / 12
    },
    metrics: {
      monthlyPayment: decimalToNumber(scenario.monthlyPayment),
      totalInterest: decimalToNumber(scenario.totalInterest),
      taxShield: decimalToNumber(scenario.taxShield),
      afterTaxInterest: decimalToNumber(scenario.afterTaxInterest),
      projectedShareValue: decimalToNumber(scenario.projectedShareValue),
      projectedShareGain: decimalToNumber(scenario.projectedShareGain),
      netGain: decimalToNumber(scenario.netGain),
      breakEvenGrowth: decimalToNumber(scenario.breakEvenGrowth),
      returnOnInvestment: decimalToNumber(scenario.returnOnInvestment),
      paybackYears: scenario.paybackYears ? decimalToNumber(scenario.paybackYears) : null,
      monthlyPaymentRounded: round(decimalToNumber(scenario.monthlyPayment), 2),
      breakEvenGrowthPercent: round(decimalToNumber(scenario.breakEvenGrowth) * 100, 3),
      returnOnInvestmentPercent: round(decimalToNumber(scenario.returnOnInvestment) * 100, 3)
    }
  };
}

export function round(value: number, digits = 2): number {
  const factor = Math.pow(10, digits);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  return value instanceof Prisma.Decimal ? value.toNumber() : Number(value);
}

export function formatCurrencyCAD(value: number): string {
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(value);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)} %`;
}

export function buildLeveragedBuybackResolution(
  scenario: LeveragedBuybackScenarioDto,
  actorName: string
): string {
  const { inputs, metrics, label, generatedAt } = scenario;

  const lines = [
    `${actorName} confirme la mise en place d'un financement hypothécaire pour procéder à un rachat d'actions.`,
    `Montant refinancé : ${formatCurrencyCAD(inputs.loanAmount)} au taux de ${inputs.interestRatePercent.toFixed(2)} %.`,
    `Durée analysée : ${inputs.termYears.toFixed(1)} années · Taux d'imposition ${inputs.taxRatePercent.toFixed(2)} %.`,
    `Rendement anticipé sur les actions : ${inputs.expectedGrowthPercent.toFixed(2)} %.`,
    `Coût net des intérêts après impôt : ${formatCurrencyCAD(metrics.afterTaxInterest)} (économie fiscale de ${formatCurrencyCAD(metrics.taxShield)}).`,
    `Valeur projetée des actions : ${formatCurrencyCAD(metrics.projectedShareValue)} pour un gain anticipé de ${formatCurrencyCAD(metrics.projectedShareGain)}.`,
    `Gain net global estimé : ${formatCurrencyCAD(metrics.netGain)} (${formatPercent(metrics.returnOnInvestment)} du capital mobilisé).`
  ];

  if (metrics.paybackYears) {
    lines.push(`Retour sur le coût après ${metrics.paybackYears.toFixed(1)} années de rendement.`);
  }

  if (label) {
    lines.unshift(`Scénario : ${label}`);
  }

  lines.push(`Analyse générée le ${new Date(generatedAt).toLocaleDateString('fr-CA')}.`);

  return lines.join('\n');
}

function clampPercent(value: number, min = 0, max = 100, allowNegative = false): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const normalized = allowNegative ? value : Math.max(min, value);
  const bounded = Math.min(Math.max(normalized, allowNegative ? min : 0), max);
  return bounded / 100;
}
