/// <reference types="jest" />
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';
import { purgeUsersByEmails, purgeUsersByIds } from './helpers/prismaCleanup';

const adminEmail = 'reports-admin@nowis.local';

describe('Reports overview route', () => {
  jest.setTimeout(20000);

  let token: string;
  let userId: number;

  beforeAll(async () => {
    await purgeUsersByEmails(adminEmail);

    const role = await prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN' }
    });

    const user = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: 'irrelevant'
      }
    });

    userId = user.id;

    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id
      }
    });

    // Crée un minimum de données pour le rapport
    const company = await prisma.company.create({
      data: {
        userId: user.id,
        name: 'Rapport Inc.'
      }
    });

    const property = await prisma.property.create({
      data: {
        userId: user.id,
        companyId: company.id,
        name: 'Immeuble Rapport'
      }
    });

    await prisma.revenue.create({
      data: {
        propertyId: property.id,
        label: 'Revenu test',
        amount: 1000,
        frequency: 'MENSUEL',
        startDate: new Date('2024-01-01')
      }
    });

    await prisma.expense.create({
      data: {
        propertyId: property.id,
        label: 'Dépense test',
        category: 'Maintenance',
        amount: 250,
        frequency: 'MENSUEL',
        startDate: new Date('2024-01-01')
      }
    });

    await prisma.corporateStatement.create({
      data: {
        companyId: company.id,
        statementType: 'BALANCE_SHEET',
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-12-31'),
        totalAssets: 500000,
        totalLiabilities: 200000,
        totalEquity: 300000,
        totalRevenue: 250000,
        totalExpenses: 150000,
        netIncome: 100000
      }
    });

    await prisma.corporateResolution.create({
      data: {
        companyId: company.id,
        type: 'ANNUAL_MEETING',
        title: 'Approbation des états',
        resolutionDate: new Date('2025-02-01'),
        body: 'Résolution de test.'
      }
    });

    token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await purgeUsersByIds(userId);
  });

  it('retourne le rapport consolidé pour un administrateur', async () => {
    const response = await request(app)
      .get('/api/reports/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      totals: expect.objectContaining({ users: expect.any(Number) }),
      roles: expect.any(Array),
      topCompaniesByEquity: expect.any(Array),
      recentActivity: expect.any(Array)
    });
  });
});
