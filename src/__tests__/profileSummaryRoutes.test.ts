import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';
import { purgeUsersByEmails, purgeUsersByIds } from './helpers/prismaCleanup';

describe('Profile summary route', () => {
  jest.setTimeout(15000);

  const email = 'profile-summary@nowis.local';
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
        label: 'Résidence principale',
        category: 'PROPERTY',
        valuation: 450000,
        valuationDate: new Date('2024-01-01'),
        ownerType: 'FAMILY'
      }
    });

    await prisma.personalLiability.create({
      data: {
        userId,
        label: 'Hypothèque',
        category: 'MORTGAGE',
        counterparty: 'Banque Nationale',
        balance: 320000,
        interestRate: 0.04,
        maturityDate: new Date('2029-01-01')
      }
    });

    await prisma.personalExpense.createMany({
      data: [
        {
          userId,
          label: 'Paiement hypothèque',
          category: 'HOUSING',
          amount: 4000,
          frequency: 'MONTHLY',
          essential: true
        },
        {
          userId,
          label: 'Assurance habitation',
          category: 'INSURANCE',
          amount: 2400,
          frequency: 'ANNUAL',
          essential: true
        },
        {
          userId,
          label: 'Épicerie',
          category: 'FOOD',
          amount: 200,
          frequency: 'WEEKLY',
          essential: true
        }
      ]
    });

    const investmentAccount = await prisma.investmentAccount.create({
      data: {
        userId,
        label: 'Portefeuille retraite',
        accountType: 'RRSP',
        currency: 'CAD'
      }
    });

    await prisma.investmentHolding.create({
      data: {
        accountId: investmentAccount.id,
        symbol: 'XEQT',
        quantity: 300,
        bookValue: 120000,
        marketValue: 150000,
        currency: 'CAD'
      }
    });

    const financialGoal = await prisma.financialGoal.create({
      data: {
        userId,
        name: 'Retraite 60 ans',
        goalType: 'RETIREMENT',
        targetAmount: 1000000,
        priority: 1,
        status: 'ACTIVE'
      }
    });

    await prisma.financialGoalProgress.createMany({
      data: [
        {
          goalId: financialGoal.id,
          progressDate: new Date('2024-03-01'),
          amount: 250000
        },
        {
          goalId: financialGoal.id,
          progressDate: new Date('2025-03-01'),
          amount: 150000
        }
      ]
    });
  });

  afterAll(async () => {
    await purgeUsersByIds(userId);
  });

  it('refuse les accès non authentifiés', async () => {
    await request(app).get('/api/profile/summary').expect(401);
  });

  it('retourne un résumé consolidé du profil financier', async () => {
    const response = await request(app)
      .get('/api/profile/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const summary = response.body;

    expect(summary.totals.personalAssets).toBeCloseTo(450000, 2);
    expect(summary.totals.investmentHoldings).toBeCloseTo(150000, 2);
    expect(summary.totals.personalLiabilities).toBeCloseTo(320000, 2);
    expect(summary.totals.netWorth).toBeCloseTo(280000, 2);
    expect(summary.totals.annualExpenses).toBeCloseTo(60800, 2);
    expect(summary.totals.monthlyExpenses).toBeCloseTo(5066.67, 2);

    expect(summary.breakdowns.assetsByCategory).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: 'PROPERTY', total: 450000 })])
    );

    expect(summary.breakdowns.liabilitiesByCategory).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: 'MORTGAGE', total: 320000 })])
    );

    expect(summary.breakdowns.investmentsByAccountType).toEqual(
      expect.arrayContaining([expect.objectContaining({ accountType: 'RRSP', total: 150000, accounts: 1 })])
    );

    expect(summary.goals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Retraite 60 ans',
          totalProgress: 400000,
          progressPercent: 40
        })
      ])
    );
  });
});
