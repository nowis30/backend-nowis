/// <reference types="jest" />
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';
import { calculateScheduledPayment } from '../server/services/amortization';
import { purgeUsersByIds, purgeUsersByEmails } from './helpers/prismaCleanup';

describe('Summary route enriched metrics', () => {
  jest.setTimeout(15000);

  const email = 'summary-metrics@nowis.local';
  let token: string;
  let userId: number;

  beforeAll(async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    await purgeUsersByEmails(email);

    const mortgageOnePayment = calculateScheduledPayment({
      principal: 100000,
      rateAnnual: 0.04,
      amortizationMonths: 300,
      paymentFrequency: 12
    });

    const mortgageTwoPayment = calculateScheduledPayment({
      principal: 50000,
      rateAnnual: 0.06,
      amortizationMonths: 240,
      paymentFrequency: 12
    });

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'irrelevant',
        properties: {
          create: {
            name: 'Immeuble métriques',
            currentValue: 300000,
            units: {
              create: [
                { label: 'Unité A', rentExpected: 1500, squareFeet: 900 },
                { label: 'Unité B', rentExpected: 1200, squareFeet: 800 }
              ]
            },
            revenues: {
              create: {
                label: 'Loyers récurrents',
                amount: 2700,
                frequency: 'MENSUEL',
                startDate: new Date('2025-01-01')
              }
            },
            expenses: {
              create: {
                label: 'Charges communes',
                amount: 500,
                category: 'Maintenance',
                frequency: 'MENSUEL',
                startDate: new Date('2025-01-01')
              }
            },
            mortgages: {
              create: [
                {
                  lender: 'Banque 1',
                  principal: 100000,
                  rateAnnual: 0.04,
                  termMonths: 60,
                  amortizationMonths: 300,
                  startDate: new Date('2025-01-01'),
                  paymentFrequency: 12,
                  paymentAmount: mortgageOnePayment
                },
                {
                  lender: 'Banque 2',
                  principal: 50000,
                  rateAnnual: 0.06,
                  termMonths: 60,
                  amortizationMonths: 240,
                  startDate: new Date('2025-01-01'),
                  paymentFrequency: 12,
                  paymentAmount: mortgageTwoPayment
                }
              ]
            }
          }
        }
      }
    });

    userId = user.id;
    token = jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: '1h' });

    const company = await prisma.company.create({
      data: {
        userId,
        name: 'Nouvelle Société',
        fiscalYearEnd: new Date('2024-12-31')
      }
    });

    const shareholder = await prisma.shareholder.create({
      data: {
        userId,
        displayName: 'Actionnaire principal',
        type: 'PERSON',
        contactEmail: 'principal@example.com'
      }
    });

    await prisma.companyShareholder.create({
      data: {
        companyId: company.id,
        shareholderId: shareholder.id,
        role: 'Administrateur',
        votingPercent: 65
      }
    });

    const shareClass = await prisma.shareClass.create({
      data: {
        companyId: company.id,
        code: 'ORD',
        description: 'Actions ordinaires'
      }
    });

    await prisma.shareTransaction.create({
      data: {
        companyId: company.id,
        shareClassId: shareClass.id,
        shareholderId: shareholder.id,
        type: 'ISSUANCE',
        transactionDate: new Date('2024-01-15'),
        quantity: 1000,
        pricePerShare: 10,
        considerationPaid: 10000,
        fairMarketValue: 12500,
        notes: 'Émission initiale d’actions'
      }
    });

    await prisma.corporateStatement.create({
      data: {
        companyId: company.id,
        statementType: 'INCOME_STATEMENT',
        periodStart: new Date('2023-01-01'),
        periodEnd: new Date('2023-12-31'),
        totalAssets: 250000,
        totalLiabilities: 150000,
        totalEquity: 100000,
        netIncome: 42000
      }
    });

    await prisma.corporateResolution.create({
      data: {
        companyId: company.id,
        type: 'DIVIDEND_DECLARATION',
        title: 'Distribution 2024',
        resolutionDate: new Date('2024-06-30'),
        body: 'Distribution d’un dividende exceptionnel.'
      }
    });
  });

  afterAll(async () => {
    jest.useRealTimers();

    await purgeUsersByIds(userId);
  });

  it('expose les indicateurs enrichis pour les propriétés et totaux', async () => {
    const response = await request(app)
      .get('/api/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const { properties, totals, corporate } = response.body as {
      properties: Array<Record<string, number>>;
      totals: Record<string, number>;
      corporate: Record<string, unknown>;
    };

    expect(properties).toHaveLength(1);
    const property = properties[0];

    expect(property.unitsCount).toBe(2);
    expect(property.rentPotentialMonthly).toBeCloseTo(2700, 2);
    expect(property.squareFeetTotal).toBeCloseTo(1700, 2);
    expect(property.mortgageCount).toBe(2);
    expect(property.outstandingDebt).toBeCloseTo(150000, 2);
    expect(property.averageMortgageRate).toBeCloseTo(0.0466666, 5);
    expect(property.loanToValue).toBeCloseTo(0.5, 5);

    expect(totals.unitsCount).toBe(2);
    expect(totals.rentPotentialMonthly).toBeCloseTo(2700, 2);
    expect(totals.squareFeetTotal).toBeCloseTo(1700, 2);
    expect(totals.mortgageCount).toBe(2);
    expect(totals.outstandingDebt).toBeCloseTo(150000, 2);
    expect(totals.averageMortgageRate).toBeCloseTo(0.0466666, 5);
    expect(totals.loanToValue).toBeCloseTo(0.5, 5);

    expect(corporate).toMatchObject({
      companiesCount: 1,
      shareholdersCount: 1,
      shareClassesCount: 1,
      shareTransactionsCount: 1,
      statementsCount: 1,
      resolutionsCount: 1
    });
    expect(corporate.latestStatement).toMatchObject({
      companyName: 'Nouvelle Société',
      statementType: 'INCOME_STATEMENT',
      netIncome: 42000
    });
    expect(corporate.latestResolution).toMatchObject({
      companyName: 'Nouvelle Société',
      type: 'DIVIDEND_DECLARATION'
    });
  });
});
