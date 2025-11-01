/// <reference types="jest" />
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';
import { purgeUsersByEmails, purgeUsersByIds } from './helpers/prismaCleanup';

describe('Profile routes', () => {
  jest.setTimeout(15000);

  const email = 'profile-route@nowis.local';
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

  // Personal assets
    await prisma.personalAsset.create({
      data: {
        userId,
        label: 'Maison familiale',
        category: 'REAL_ESTATE',
        ownerType: 'PERSONAL',
        valuation: 550000,
        valuationDate: new Date('2025-01-01'),
        liquidityTag: 'LOW'
      }
    });

  // Personal liabilities
    await prisma.personalLiability.create({
      data: {
        userId,
        label: 'Hypothèque principale',
        category: 'MORTGAGE',
        counterparty: 'Banque ABC',
        balance: 320000,
        interestRate: 0.045,
        maturityDate: new Date('2030-06-01')
      }
    });

  // Personal expenses
    await prisma.personalExpense.create({
      data: {
        userId,
        label: 'Épicerie',
        category: 'FOOD',
        amount: 850,
        frequency: 'MONTHLY',
        essential: true
      }
    });

  // Investment structures
    const account = await prisma.investmentAccount.create({
      data: {
        userId,
        label: 'Compte non enregistré',
        accountType: 'TAXABLE',
        institution: 'Courtier XYZ',
        currency: 'CAD'
      }
    });

    const holding = await prisma.investmentHolding.create({
      data: {
        accountId: account.id,
        symbol: 'VFV',
        description: 'ETF S&P 500 CAD',
        quantity: 120,
        bookValue: 9500,
        marketValue: 11200,
        currency: 'CAD'
      }
    });

    await prisma.investmentTransaction.create({
      data: {
        accountId: account.id,
        holdingId: holding.id,
        transactionType: 'BUY',
        symbol: 'VFV',
        tradeDate: new Date('2025-02-10'),
        quantity: 120,
        price: 92.35,
        fees: 9.99
      }
    });

  // Financial goals
    const goal = await prisma.financialGoal.create({
      data: {
        userId,
        name: 'Mise de fonds chalet',
        goalType: 'PURCHASE',
        targetAmount: 80000,
        targetDate: new Date('2028-09-01'),
        priority: 2
      }
    });

    await prisma.financialGoalProgress.create({
      data: {
        goalId: goal.id,
        progressDate: new Date('2025-03-01'),
        amount: 15000,
        notes: 'Épargne accumulée à date'
      }
    });
  });

  afterAll(async () => {
    await purgeUsersByIds(userId);
  });

  it('refuse l’accès sans authentification', async () => {
    await request(app).get('/api/profile/bootstrap').expect(401);
  });

  it('retourne un portrait financier consolidé', async () => {
    const response = await request(app)
      .get('/api/profile/bootstrap')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = response.body as Record<string, unknown>;

    expect(Array.isArray(body.personalAssets)).toBe(true);
    expect(Array.isArray(body.personalLiabilities)).toBe(true);
    expect(Array.isArray(body.personalExpenses)).toBe(true);
    expect(Array.isArray(body.investmentAccounts)).toBe(true);
    expect(Array.isArray(body.financialGoals)).toBe(true);

    const [asset] = body.personalAssets as Array<Record<string, unknown>>;
    expect(asset).toMatchObject({ label: 'Maison familiale', valuation: expect.any(Number) });

    const [account] = body.investmentAccounts as Array<Record<string, unknown>>;
    expect(account).toMatchObject({ label: 'Compte non enregistré', totals: expect.any(Object) });
    expect(Array.isArray(account.holdings)).toBe(true);
    expect(Array.isArray(account.transactions)).toBe(true);

    const [goal] = body.financialGoals as Array<Record<string, unknown>>;
    expect(goal).toMatchObject({ name: 'Mise de fonds chalet', targetAmount: expect.any(Number) });
    expect(Array.isArray(goal.progress)).toBe(true);
  });
});
