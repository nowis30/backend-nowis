/// <reference types="jest" />
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';
import { purgeUsersByIds } from './helpers/prismaCleanup';

describe('Coordination AI routes', () => {
  const email = 'coord-ai-route@nowis.local';
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

  it('rejects unauthenticated requests', async () => {
    await request(app).post('/api/ai/leverage').expect(401);
  });

  it('returns narrative and optionally persists the scenario', async () => {
    const payload = {
      label: 'Conversation leverage',
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

    const response = await request(app)
      .post('/api/ai/leverage')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(200);

    expect(response.body.summary).toBeDefined();
    expect(response.body.summary.annualDebtService).toBeCloseTo(4209.048, 3);
    expect(response.body.narrative).toContain('flux de service de la dette');
    expect(Array.isArray(response.body.highlights)).toBe(true);
    expect(response.body.savedScenarioId).toBeGreaterThan(0);
  });
});
