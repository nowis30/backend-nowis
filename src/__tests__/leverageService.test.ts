/// <reference types="jest" />
import { evaluateScenario } from '../server/services/leverageService';

describe('leverageService.evaluateScenario', () => {
  it('calcule le différentiel net et les intérêts après impôt', () => {
    const summary = evaluateScenario({
      userId: 1,
      label: 'Test',
      sourceType: 'HOME_EQUITY',
      principal: 60000,
      annualRate: 0.05,
      termMonths: 60,
      amortizationMonths: 300,
      startDate: new Date('2025-01-01'),
      investmentVehicle: 'ETF',
      expectedReturnAnnual: 0.072,
      planHorizonYears: 10,
      interestDeductible: true,
      marginalTaxRate: 0.45
    });

    expect(summary.annualDebtService).toBeGreaterThan(4000);
  expect(summary.annualInterestCost).toBeCloseTo(2972, 0);
  expect(summary.afterTaxDebtCost).toBeCloseTo(1635, 0);
  expect(summary.expectedInvestmentReturn).toBeCloseTo(4320, 0);
  expect(summary.netExpectedDelta).toBeGreaterThan(2600);
    expect(summary.details.monthlyPayment).toBeGreaterThan(300);
  });

  it('rejette un principal invalide', () => {
    expect(() =>
      evaluateScenario({
        userId: 1,
        label: 'Erreur',
        sourceType: 'HOME_EQUITY',
        principal: 0,
        annualRate: 0.05,
        termMonths: 12,
        startDate: new Date(),
        investmentVehicle: 'ETF',
        expectedReturnAnnual: 0.05,
        planHorizonYears: 5,
        interestDeductible: false
      })
    ).toThrow('Le principal doit être supérieur à 0.');
  });
});
