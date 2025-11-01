/// <reference types="jest" />
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';
import { purgeUsersByEmails, purgeUsersByIds } from './helpers/prismaCleanup';

describe('Investment routes', () => {
  jest.setTimeout(15000);

  const email = 'investment-routes@nowis.local';
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
  });

  afterAll(async () => {
    await purgeUsersByIds(userId);
  });

  it('refuse les accès non authentifiés', async () => {
    await request(app).get('/api/investments/accounts').expect(401);
    await request(app).post('/api/investments/accounts').expect(401);
  });

  it("permet de gérer le cycle de vie d'un compte d'investissement", async () => {
    const createAccount = await request(app)
      .post('/api/investments/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        label: 'Portefeuille TSX',
        accountType: 'taxable',
        currency: 'cad'
      })
      .expect(201);

    expect(createAccount.body).toMatchObject({
      label: 'Portefeuille TSX',
      accountType: 'TAXABLE',
      totals: { bookValue: 0, marketValue: 0 }
    });

    const accountId = createAccount.body.id as number;

    const updateAccount = await request(app)
      .put(`/api/investments/accounts/${accountId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        label: 'Portefeuille TSX Core',
        accountType: 'taxable',
        currency: 'CAD',
        institution: 'Questrade'
      })
      .expect(200);

    expect(updateAccount.body).toMatchObject({
      label: 'Portefeuille TSX Core',
      institution: 'Questrade'
    });

    const createHolding = await request(app)
      .post(`/api/investments/accounts/${accountId}/holdings`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: 'XEQT',
        description: 'All-Equity ETF',
        quantity: 120,
        bookValue: 3000,
        marketValue: 3150,
        currency: 'CAD',
        targetAllocation: 0.75
      })
      .expect(201);

    expect(createHolding.body).toMatchObject({ symbol: 'XEQT', quantity: 120 });
    const holdingId = createHolding.body.id as number;

    const updateHolding = await request(app)
      .put(`/api/investments/holdings/${holdingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: 'XEQT',
        description: 'All-Equity ETF',
        quantity: 150,
        bookValue: 3750,
        marketValue: 3900,
        currency: 'CAD',
        targetAllocation: 0.8
      })
      .expect(200);

    expect(updateHolding.body).toMatchObject({ symbol: 'XEQT', quantity: 150, marketValue: 3900 });

    const createTransaction = await request(app)
      .post(`/api/investments/accounts/${accountId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        transactionType: 'BUY',
        symbol: 'XEQT',
        tradeDate: '2024-01-31',
        quantity: 30,
        price: 25,
        fees: 4.95,
        holdingId
      })
      .expect(201);

    expect(createTransaction.body).toMatchObject({ transactionType: 'BUY', quantity: 30 });
    const transactionId = createTransaction.body.id as number;

    const listAccounts = await request(app)
      .get('/api/investments/accounts')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listAccounts.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: accountId,
          holdings: expect.arrayContaining([expect.objectContaining({ id: holdingId })]),
          transactions: expect.arrayContaining([expect.objectContaining({ id: transactionId })])
        })
      ])
    );

    await request(app)
      .delete(`/api/investments/transactions/${transactionId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    await request(app)
      .delete(`/api/investments/holdings/${holdingId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    await request(app)
      .delete(`/api/investments/accounts/${accountId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const afterDelete = await request(app)
      .get('/api/investments/accounts')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(afterDelete.body).toEqual(expect.not.arrayContaining([expect.objectContaining({ id: accountId })]));
  });
});
