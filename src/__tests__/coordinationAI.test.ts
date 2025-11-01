/// <reference types="jest" />
import { prisma } from '../server/lib/prisma';
import { runLeverageConversation } from '../server/services/ai/coordinationAI';
import { purgeUsersByIds } from './helpers/prismaCleanup';

describe('Coordination AI - leverage narrative', () => {
  const email = 'coord-ai-leverage@nowis.local';
  let userId: number;

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'irrelevant'
      }
    });
    userId = user.id;
  });

  afterAll(async () => {
    await purgeUsersByIds(userId);
  });

  it('returns narrative and highlights without persisting when save is false', async () => {
    const result = await runLeverageConversation({
      userId,
      label: 'Investissement VFV',
      sourceType: 'HOME_EQUITY',
      principal: 60000,
      annualRate: 0.05,
      termMonths: 60,
      amortizationMonths: 300,
      startDate: new Date('2025-11-01'),
      investmentVehicle: 'ETF',
      expectedReturnAnnual: 0.07,
      planHorizonYears: 10,
      interestDeductible: true,
      marginalTaxRate: 0.47,
      save: false
    });

    expect(result.summary.annualDebtService).toBeCloseTo(4209.048, 3);
    expect(result.narrative).toContain('flux de service de la dette');
    expect(result.highlights.length).toBeGreaterThanOrEqual(3);
    expect(result.savedScenarioId).toBeUndefined();
  });

  it('persists the scenario when save is true', async () => {
    const result = await runLeverageConversation({
      userId,
      label: 'Investissement VFV sauvegarde',
      sourceType: 'HOME_EQUITY',
      principal: 45000,
      annualRate: 0.045,
      termMonths: 48,
      amortizationMonths: 240,
      startDate: new Date('2025-12-01'),
      investmentVehicle: 'ETF',
      expectedReturnAnnual: 0.065,
      planHorizonYears: 8,
      interestDeductible: true,
      marginalTaxRate: 0.47,
      save: true
    });

    expect(result.savedScenarioId).toBeDefined();

    const stored = await (prisma as any).leverageScenario.findUnique({ where: { id: result.savedScenarioId } });
    expect(stored).toMatchObject({
      userId,
      label: 'Investissement VFV sauvegarde'
    });
  });
});
