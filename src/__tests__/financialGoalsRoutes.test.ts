import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';

describe('Financial goals routes', () => {
  const email = 'financial-goals@nowis.local';
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
    await request(app).get('/api/financial-goals').expect(401);
    await request(app).post('/api/financial-goals').expect(401);
  });

  it("permet de créer, mettre à jour et suivre un objectif financier", async () => {
    const createGoal = await request(app)
      .post('/api/financial-goals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Retraite',
        goalType: 'retirement',
        targetAmount: 1500000,
        priority: 1,
        status: 'active'
      })
      .expect(201);

    expect(createGoal.body).toMatchObject({
      name: 'Retraite',
      goalType: 'RETIREMENT',
      status: 'ACTIVE',
      progress: []
    });

    const goalId = createGoal.body.id as number;

    const updateGoal = await request(app)
      .put(`/api/financial-goals/${goalId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Retraite Anticipée',
        goalType: 'retirement',
        targetAmount: 1750000,
        priority: 1,
        status: 'active',
        description: 'Objectif principal'
      })
      .expect(200);

    expect(updateGoal.body).toMatchObject({
      name: 'Retraite Anticipée',
      targetAmount: 1750000,
      description: 'Objectif principal'
    });

    const addProgress = await request(app)
      .post(`/api/financial-goals/${goalId}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        progressDate: '2024-02-15',
        amount: 250000,
        notes: 'REER et CELI'
      })
      .expect(201);

    expect(addProgress.body).toMatchObject({ amount: 250000, notes: 'REER et CELI' });
    const progressId = addProgress.body.id as number;

    const listGoals = await request(app)
      .get('/api/financial-goals')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listGoals.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: goalId,
          progress: expect.arrayContaining([expect.objectContaining({ id: progressId })])
        })
      ])
    );

    await request(app)
      .delete(`/api/financial-goals/${goalId}/progress/${progressId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    await request(app)
      .delete(`/api/financial-goals/${goalId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const afterDelete = await request(app)
      .get('/api/financial-goals')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(afterDelete.body).toEqual(expect.not.arrayContaining([expect.objectContaining({ id: goalId })]));
  });
});
