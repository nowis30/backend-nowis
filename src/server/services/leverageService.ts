import { prisma } from '../lib/prisma';

export type EvaluateScenarioInput = {
  userId: number;
  companyId?: number;
  label: string;
  sourceType: 'HOME_EQUITY' | 'RENTAL_PROPERTY' | 'HELOC' | 'CORPORATE_LOAN';
  principal: number;
  annualRate: number; // e.g. 0.05 for 5 %
  termMonths: number;
  amortizationMonths?: number; // si absent, paiement intérêt seulement
  startDate: Date;
  investmentVehicle: 'ETF' | 'STOCK' | 'REALESTATE' | 'BUSINESS' | 'FUND';
  expectedReturnAnnual: number; // 0.07 => 7 %
  expectedVolatility?: number;
  planHorizonYears: number;
  interestDeductible: boolean;
  marginalTaxRate?: number; // 0.45 = 45 %, utilisé si intérêts déductibles
};

export type EvaluatedScenario = {
  annualDebtService: number;
  annualInterestCost: number;
  afterTaxDebtCost: number;
  expectedInvestmentReturn: number;
  netExpectedDelta: number;
  cashflowImpact: number;
  breakEvenReturn: number;
  details: {
    monthlyPayment: number;
    principalRepaidYearOne: number;
  };
};

const VEHICLE_ENUM: Record<string, 'ETF' | 'STOCK' | 'REALESTATE' | 'BUSINESS' | 'FUND'> = {
  ETF: 'ETF',
  STOCK: 'STOCK',
  REALESTATE: 'REALESTATE',
  BUSINESS: 'BUSINESS',
  FUND: 'FUND'
};

const SOURCE_ENUM: Record<string, 'HOME_EQUITY' | 'RENTAL_PROPERTY' | 'HELOC' | 'CORPORATE_LOAN'> = {
  HOME_EQUITY: 'HOME_EQUITY',
  RENTAL_PROPERTY: 'RENTAL_PROPERTY',
  HELOC: 'HELOC',
  CORPORATE_LOAN: 'CORPORATE_LOAN'
};

function computeMonthlyPayment(principal: number, annualRate: number, amortizationMonths?: number): number {
  if (!amortizationMonths) {
    // Paiement intérêt seulement
    return principal * (annualRate / 12);
  }

  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) {
    return principal / amortizationMonths;
  }

  const factor = Math.pow(1 + monthlyRate, amortizationMonths);
  return (principal * monthlyRate * factor) / (factor - 1);
}

export function evaluateScenario(input: EvaluateScenarioInput): EvaluatedScenario {
  const {
    principal,
    annualRate,
    amortizationMonths,
    termMonths,
    expectedReturnAnnual,
    marginalTaxRate = 0,
    interestDeductible
  } = input;

  if (principal <= 0) {
    throw new Error('Le principal doit être supérieur à 0.');
  }
  if (annualRate < 0) {
    throw new Error('Le taux doit être positif.');
  }
  if (termMonths <= 0) {
    throw new Error('La durée doit être positive.');
  }
  if (expectedReturnAnnual < -0.9) {
    throw new Error('Le rendement attendu est invalide.');
  }

  const monthlyPayment = computeMonthlyPayment(principal, annualRate, amortizationMonths ?? termMonths);
  const monthsConsidered = Math.min(termMonths, 12);
  const monthlyRate = annualRate / 12;

  let balance = principal;
  let interestYearOne = 0;
  let principalRepaidYearOne = 0;

  for (let i = 0; i < monthsConsidered; i += 1) {
    const interest = balance * monthlyRate;
    interestYearOne += interest;
    const principalComponent = Math.max(monthlyPayment - interest, 0);
    principalRepaidYearOne += principalComponent;
    balance = Math.max(balance - principalComponent, 0);
  }

  const annualDebtService = monthlyPayment * monthsConsidered;
  const annualInterestCost = interestYearOne;
  const afterTaxDebtCost = interestDeductible ? annualInterestCost * (1 - marginalTaxRate) : annualInterestCost;
  const expectedInvestmentReturn = principal * expectedReturnAnnual;
  const netExpectedDelta = expectedInvestmentReturn - afterTaxDebtCost;
  const cashflowImpact = expectedInvestmentReturn - annualDebtService;
  const breakEvenReturn = afterTaxDebtCost / principal;

  return {
    annualDebtService,
    annualInterestCost,
    afterTaxDebtCost,
    expectedInvestmentReturn,
    netExpectedDelta,
    cashflowImpact,
    breakEvenReturn,
    details: {
      monthlyPayment,
      principalRepaidYearOne
    }
  };
}

const leverageDelegate = prisma.leverageScenario;

export async function listScenarios(userId: number) {
  return leverageDelegate.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });
}

export async function saveScenario(input: EvaluateScenarioInput, summary: EvaluatedScenario) {
  const investmentVehicle = VEHICLE_ENUM[input.investmentVehicle];
  if (!investmentVehicle) {
    throw new Error('Type de véhicule non supporté.');
  }

  const sourceType = SOURCE_ENUM[input.sourceType];
  if (!sourceType) {
    throw new Error('Type de source non supporté.');
  }

  return leverageDelegate.create({
    data: {
      userId: input.userId,
      companyId: input.companyId,
      label: input.label,
      sourceType,
      principal: input.principal,
      rateAnnual: input.annualRate,
      termMonths: input.termMonths,
      amortizationMonths: input.amortizationMonths,
      startDate: input.startDate,
      interestDeductible: input.interestDeductible,
      investmentVehicle,
      expectedReturnAnnual: input.expectedReturnAnnual,
      expectedVolatility: input.expectedVolatility,
      planHorizonYears: input.planHorizonYears,
      notes: `Service net attendu: ${summary.netExpectedDelta.toFixed(2)}`
    }
  });
}
