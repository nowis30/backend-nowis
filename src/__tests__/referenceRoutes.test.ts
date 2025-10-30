import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';
import { purgeUsersByEmails, purgeUsersByIds } from './helpers/prismaCleanup';

describe('Reference routes (accounts & CCA classes)', () => {
  jest.setTimeout(20000);

  const email = 'references@nowis.local';
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

    // Ensure some global reference data exists (in case seed hasn't been run)
    const existingAcc = await prisma.account.findMany({ where: { userId: null } });
    if (existingAcc.length === 0) {
      await prisma.account.createMany({
        data: [
          { userId: null, code: '1000', name: 'Actif', type: 'ASSET', parentCode: null, isActive: true },
          { userId: null, code: '4000', name: 'Produits', type: 'REVENUE', parentCode: null, isActive: true },
          { userId: null, code: '5000', name: 'Charges', type: 'EXPENSE', parentCode: null, isActive: true }
        ]
      });
    }

    const existingCCA = await prisma.cCAClass.findMany({ where: { userId: null } });
    if (existingCCA.length === 0) {
      await prisma.cCAClass.createMany({
        data: [
          { userId: null, classCode: '1', description: 'Bâtiments', rate: 0.04 },
          { userId: null, classCode: '8', description: 'Mobilier et équipements', rate: 0.2 }
        ]
      });
    }
  });

  afterAll(async () => {
    await purgeUsersByIds(userId);
  });

  it('lists reference accounts and CCA classes, and coherence ok initially', async () => {
    const accounts = await request(app)
      .get('/api/mdc/reference/accounts')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(accounts.body)).toBe(true);
  expect(accounts.body.length).toBeGreaterThanOrEqual(3);

    const cca = await request(app)
      .get('/api/mdc/reference/cca-classes')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(cca.body)).toBe(true);
  expect(cca.body.length).toBeGreaterThanOrEqual(2);

    const coherence = await request(app)
      .get('/api/mdc/reference/accounts/coherence')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(coherence.body).toMatchObject({ ok: true });
  });

  it('flags unknown accounts if journal lines reference non-existing codes', async () => {
    // Create an unbalanced entry with an unknown account code but keep balance correct
    const entry = await request(app)
      .post('/api/mdc/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        entryDate: '2025-01-20',
        description: 'Test unknown account',
        lines: [
          { accountCode: '9999-UNKNOWN', debit: 100 },
          { accountCode: '1000', credit: 100 }
        ]
      })
      .expect(201);

    expect(entry.body.id).toBeTruthy();

    const coherence = await request(app)
      .get('/api/mdc/reference/accounts/coherence')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(coherence.body.ok).toBe(false);
    expect(Array.isArray(coherence.body.unknownAccountCodes)).toBe(true);
    expect(coherence.body.unknownAccountCodes).toContain('9999-UNKNOWN');
  });
});
