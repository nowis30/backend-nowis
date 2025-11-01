/// <reference types="jest" />
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';

describe('Personal assets routes', () => {
  const email = 'personal-assets@nowis.local';
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
    await request(app).get('/api/personal-assets').expect(401);
    await request(app).post('/api/personal-assets').expect(401);
  });

  it("permet de créer, lister, mettre à jour et supprimer un actif personnel", async () => {
    const createAsset = await request(app)
      .post('/api/personal-assets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        label: 'Chalet familial',
        category: 'PROPERTY',
        ownerType: 'family',
        valuation: 450000,
        valuationDate: '2024-05-01',
        liquidityTag: 'LOW',
        notes: 'À conserver long terme'
      })
      .expect(201);

    expect(createAsset.body).toMatchObject({
      label: 'Chalet familial',
      valuation: 450000,
      ownerType: 'family'
    });

    const assetId = createAsset.body.id as number;

    const listAssets = await request(app)
      .get('/api/personal-assets')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listAssets.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: assetId, liquidityTag: 'LOW' })])
    );

    const updateAsset = await request(app)
      .put(`/api/personal-assets/${assetId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        label: 'Chalet familial',
        category: 'PROPERTY',
        ownerType: 'family',
        ownerNotes: 'Succession',
        valuation: 480000,
        valuationDate: '2025-01-15',
        liquidityTag: 'LOW',
        notes: 'Valeur ajustée'
      })
      .expect(200);

    expect(updateAsset.body).toMatchObject({ valuation: 480000, ownerNotes: 'Succession' });

    await request(app)
      .delete(`/api/personal-assets/${assetId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const afterDelete = await request(app)
      .get('/api/personal-assets')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(afterDelete.body).toEqual(expect.not.arrayContaining([expect.objectContaining({ id: assetId })]));
  });
});
