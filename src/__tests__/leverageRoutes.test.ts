/// <reference types="jest" />
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';
import { purgeUsersByIds } from './helpers/prismaCleanup';

describe('Leverage routes', () => {
  const email = 'leverage-routes@nowis.local';
  let token: string;
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
    token = jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await purgeUsersByIds(userId);
  });

  it('refuse les accès non authentifiés', async () => {
    await request(app).get('/api/leverage').expect(401);
    await request(app).post('/api/leverage/simulate').expect(401);
  });

  it('simule et persiste un scénario de levier', async () => {
    const payload = {
      label: 'Investir VFV',
      sourceType: 'HOME_EQUITY',
      principal: 60000,
      annualRate: 0.05,
      termMonths: 60,
      amortizationMonths: 300,
      startDate: '2025-11-01',
      investmentVehicle: 'ETF',
      expectedReturnAnnual: 0.07,
      expectedVolatility: 0.18,
      planHorizonYears: 10,
      interestDeductible: true,
      marginalTaxRate: 0.47,
      save: true
    };

    const simulateResponse = await request(app)
      .post('/api/leverage/simulate')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(200);

    expect(simulateResponse.body.summary).toBeDefined();
    const summary = simulateResponse.body.summary;

    expect(summary.annualDebtService).toBeCloseTo(4209.048, 3);
    expect(summary.annualInterestCost).toBeCloseTo(2971.904, 3);
    expect(summary.afterTaxDebtCost).toBeCloseTo(1575.109, 3);
    expect(summary.expectedInvestmentReturn).toBeCloseTo(4200, 3);
    expect(summary.netExpectedDelta).toBeCloseTo(2624.891, 3);
    expect(summary.cashflowImpact).toBeCloseTo(-9.048, 3);
    expect(summary.breakEvenReturn).toBeCloseTo(0.02625, 4);
    expect(summary.details.monthlyPayment).toBeCloseTo(350.754, 3);
    expect(summary.details.principalRepaidYearOne).toBeCloseTo(1237.144, 3);

    const savedScenarioId = simulateResponse.body.savedScenarioId as number;
    expect(savedScenarioId).toBeGreaterThan(0);

    const storedScenario = await (prisma as any).leverageScenario.findUnique({ where: { id: savedScenarioId } });
    expect(storedScenario).toMatchObject({
      userId,
      label: payload.label,
      sourceType: payload.sourceType,
      planHorizonYears: payload.planHorizonYears
    });
    expect(Number(storedScenario.principal)).toBeCloseTo(payload.principal, 2);
    expect(Number(storedScenario.rateAnnual)).toBeCloseTo(payload.annualRate, 4);

    const listResponse = await request(app)
      .get('/api/leverage')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: savedScenarioId,
          label: payload.label
        })
      ])
    );
  });
});
