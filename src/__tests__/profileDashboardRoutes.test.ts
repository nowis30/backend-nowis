/// <reference types="jest" />
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';
import { purgeUsersByEmails, purgeUsersByIds } from './helpers/prismaCleanup';

describe('Profile dashboard route', () => {
  jest.setTimeout(15000);

  const email = 'profile-dashboard@nowis.local';
  let token: string;
  let userId: number;

  beforeAll(async () => {
    await purgeUsersByEmails(email);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'irrelevant'
      }
    });

    userId = user.id;
    token = jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: '1h' });

    await prisma.personalAsset.create({
      data: {
        userId,
        label: 'Compte bancaire',
        category: 'LIQUID',
        valuation: 20000,
        valuationDate: new Date('2025-01-01'),
        ownerType: 'PERSONAL'
      }
    });

    const investmentAccount = await prisma.investmentAccount.create({
      data: {
        userId,
        label: 'Portefeuille croissance',
        accountType: 'TAXABLE',
        currency: 'CAD'
      }
    });

    await prisma.investmentHolding.create({
      data: {
        accountId: investmentAccount.id,
        symbol: 'VEQT',
        quantity: 100,
        bookValue: 9000,
        marketValue: 10000,
        currency: 'CAD'
      }
    });

    await prisma.personalLiability.create({
      data: {
        userId,
        label: 'Prêt personnel',
        category: 'DEBT',
        counterparty: 'Banque',
        balance: 25000,
        interestRate: 0.055
      }
    });

    await prisma.personalExpense.create({
      data: {
        userId,
        label: 'Dépenses mensuelles',
        category: 'LIFESTYLE',
        amount: 6000,
        frequency: 'MONTHLY',
        essential: true
      }
    });

    const goal = await prisma.financialGoal.create({
      data: {
        userId,
        name: 'Fonds études enfants',
        goalType: 'EDUCATION',
        targetAmount: 200000,
        priority: 1,
        status: 'ACTIVE'
      }
    });

    await prisma.financialGoalProgress.create({
      data: {
        goalId: goal.id,
        progressDate: new Date('2025-01-15'),
        amount: 20000
      }
    });
  });

  afterAll(async () => {
    await purgeUsersByIds(userId);
  });

  it('refuse les accès non authentifiés', async () => {
    await request(app).get('/api/profile/dashboard').expect(401);
  });

  it('retourne un tableau de bord consolidé', async () => {
    const response = await request(app)
      .get('/api/profile/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const dashboard = response.body;

    expect(dashboard.summary.totals.netWorth).toBeCloseTo(5000, 2);
    expect(Array.isArray(dashboard.insights)).toBe(true);
    expect(dashboard.insights.length).toBeGreaterThan(0);
    expect(dashboard.wealth.overview.totals.netWorth).toBeDefined();
    expect(Array.isArray(dashboard.wealth.history)).toBe(true);
  });
});
