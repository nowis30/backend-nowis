import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';

describe('Personal liabilities routes', () => {
  const email = 'personal-liabilities@nowis.local';
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
    await request(app).get('/api/personal-liabilities').expect(401);
    await request(app).post('/api/personal-liabilities').expect(401);
  });

  it("permet de gérer le cycle d'un passif personnel", async () => {
    const createLiability = await request(app)
      .post('/api/personal-liabilities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        label: 'Hypothèque résidence principale',
        category: 'MORTGAGE',
        counterparty: 'Banque Nationale',
        balance: 325000,
        interestRate: 0.0425,
        maturityDate: '2028-03-01',
        notes: 'Renouvellement dans 3 ans'
      })
      .expect(201);

    expect(createLiability.body).toMatchObject({
      label: 'Hypothèque résidence principale',
      balance: 325000,
      interestRate: 0.0425
    });

    const liabilityId = createLiability.body.id as number;

    const listLiabilities = await request(app)
      .get('/api/personal-liabilities')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listLiabilities.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: liabilityId, counterparty: 'Banque Nationale' })])
    );

    const updateLiability = await request(app)
      .put(`/api/personal-liabilities/${liabilityId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        label: 'Hypothèque résidence principale',
        category: 'MORTGAGE',
        counterparty: 'Banque Nationale',
        balance: 310000,
        interestRate: 0.04,
        maturityDate: '2029-03-01',
        notes: 'Amortissement accéléré'
      })
      .expect(200);

    expect(updateLiability.body).toMatchObject({ balance: 310000, interestRate: 0.04 });

    await request(app)
      .delete(`/api/personal-liabilities/${liabilityId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const afterDelete = await request(app)
      .get('/api/personal-liabilities')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(afterDelete.body).toEqual(expect.not.arrayContaining([expect.objectContaining({ id: liabilityId })]));
  });
});