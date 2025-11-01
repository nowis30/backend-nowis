/// <reference types="jest" />
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';
import { purgeUsersByEmails, purgeUsersByIds } from './helpers/prismaCleanup';

describe('MDC finance routes (incomes)', () => {
  jest.setTimeout(20000);

  const email = 'mdc-finance@nowis.local';
  let token: string;
  let userId: number;
  let incomeId: number;

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

  it('creates and lists generic incomes', async () => {
    const empty = await request(app)
      .get('/api/mdc/incomes')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(empty.body).toEqual([]);

    const create = await request(app)
      .post('/api/mdc/incomes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        label: 'Consultation ponctuelle',
        amount: 1234.56,
        incomeDate: '2025-01-15'
      })
      .expect(201);

    incomeId = create.body.id;
    expect(typeof incomeId).toBe('number');

    const list = await request(app)
      .get('/api/mdc/incomes')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.length).toBe(1);
    expect(list.body[0]).toMatchObject({ label: 'Consultation ponctuelle', amount: 1234.56 });

    await request(app)
      .delete(`/api/mdc/incomes/${incomeId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const afterDelete = await request(app)
      .get('/api/mdc/incomes')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(afterDelete.body).toEqual([]);
  });
});
