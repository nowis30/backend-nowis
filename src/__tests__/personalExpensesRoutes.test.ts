/// <reference types="jest" />
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';

describe('Personal expenses routes', () => {
  const email = 'personal-expense@nowis.local';
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
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('refuse les accès non authentifiés', async () => {
    await request(app).get('/api/personal-expenses').expect(401);
    await request(app).post('/api/personal-expenses').expect(401);
  });

  it('permet de créer, mettre à jour, lister et supprimer une dépense', async () => {
    const creation = await request(app)
      .post('/api/personal-expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        label: 'Épicerie',
        category: 'FOOD',
        amount: 850,
        frequency: 'monthly',
        essential: true
      })
      .expect(201);

    expect(creation.body).toMatchObject({ label: 'Épicerie', essential: true });
    const expenseId = creation.body.id as number;

    const list = await request(app)
      .get('/api/personal-expenses')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(list.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: expenseId })]));

    const updated = await request(app)
      .put(`/api/personal-expenses/${expenseId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        label: 'Épicerie familiale',
        category: 'FOOD',
        amount: 900,
        frequency: 'MONTHLY',
        essential: true,
        notes: 'Coût ajusté'
      })
      .expect(200);

    expect(updated.body).toMatchObject({ label: 'Épicerie familiale', amount: 900 });

    await request(app)
      .delete(`/api/personal-expenses/${expenseId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const afterDelete = await request(app)
      .get('/api/personal-expenses')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(afterDelete.body).toEqual(expect.not.arrayContaining([expect.objectContaining({ id: expenseId })]));
  });
});
