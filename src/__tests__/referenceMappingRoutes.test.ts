import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';
import { purgeUsersByEmails, purgeUsersByIds } from './helpers/prismaCleanup';

describe('Reference routes - tax mapping', () => {
  jest.setTimeout(20000);

  const email = 'tax-mapping@nowis.local';
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

    // Bootstrap minimal accounts referenced by mapping if missing
    const needAccounts = [
      { code: '4100', name: 'Revenus de loyers', type: 'REVENUE' },
      { code: '5200', name: 'Assurances', type: 'EXPENSE' },
      { code: '5100', name: 'Entretien', type: 'EXPENSE' },
      { code: '5300', name: 'Intérêts', type: 'EXPENSE' },
      { code: '5000', name: 'Charges', type: 'EXPENSE' }
    ];
    for (const a of needAccounts) {
      const exists = await prisma.account.findFirst({ where: { userId: null, code: a.code } });
      if (!exists) {
        await prisma.account.create({ data: { userId: null, code: a.code, name: a.name, type: a.type, isActive: true } });
      }
    }

    // Bootstrap minimal mapping if missing
    const form = 'T776';
    const jurisdiction = 'CA';
    const baseMapping = [
      { lineCode: 'RENTAL_INCOME', accountCode: '4100', lineLabel: 'Loyers bruts' },
      { lineCode: 'PROPERTY_TAXES', accountCode: '5000', lineLabel: 'Taxes foncières' },
      { lineCode: 'INSURANCE', accountCode: '5200', lineLabel: 'Assurances' },
      { lineCode: 'MAINTENANCE', accountCode: '5100', lineLabel: 'Entretien' },
      { lineCode: 'INTEREST', accountCode: '5300', lineLabel: 'Intérêts hypothécaires' }
    ];

    for (const m of baseMapping) {
      const exists = await prisma.taxLineToAccountMap.findFirst({
        where: { userId: null, form, jurisdiction, lineCode: m.lineCode }
      });
      if (!exists) {
        await prisma.taxLineToAccountMap.create({
          data: { userId: null, form, jurisdiction, lineCode: m.lineCode, lineLabel: m.lineLabel, accountCode: m.accountCode }
        });
      }
    }
  });

  afterAll(async () => {
    await purgeUsersByIds(userId);
  });

  it('lists mapping and reports coverage', async () => {
    const list = await request(app)
      .get('/api/mdc/reference/tax-mapping?form=T776&jurisdiction=CA')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.length).toBeGreaterThanOrEqual(5);

    const coverage = await request(app)
      .get('/api/mdc/reference/tax-mapping/coverage?form=T776&jurisdiction=CA')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(coverage.body).toHaveProperty('requiredCount');
    expect(coverage.body).toHaveProperty('missing');
  });
});
