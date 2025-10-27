import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';
import { purgeUsersByEmails, purgeUsersByIds } from './helpers/prismaCleanup';

jest.setTimeout(20000);

describe('Advisor conversation persistence', () => {
  const email = 'advisor-convo@nowis.local';
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

  it('stores conversation steps and exposes summaries', async () => {
    const firstResponse = await request(app)
      .post('/api/advisors/convo')
      .set('Authorization', `Bearer ${token}`)
      .send({
        expertId: 'fiscaliste',
        message: 'Bonjour, je veux ouvrir un dossier immobilier.',
        snapshot: {}
      })
      .expect(200);

    expect(firstResponse.body.conversationId).toBeGreaterThan(0);
    const conversationId = firstResponse.body.conversationId as number;
    expect(firstResponse.body.updates).toBeInstanceOf(Array);

    await request(app)
      .post('/api/advisors/convo')
      .set('Authorization', `Bearer ${token}`)
      .send({
        conversationId,
        expertId: 'fiscaliste',
        message: 'Le bien principal est un duplex à Montréal avec des revenus mensuels.',
        snapshot: {}
      })
      .expect(200);

    const listResponse = await request(app)
      .get('/api/advisors/convo')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listResponse.body.conversations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: conversationId,
          expertId: 'fiscaliste',
          status: expect.stringMatching(/active|completed/)
        })
      ])
    );

    const detailResponse = await request(app)
      .get(`/api/advisors/convo/${conversationId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(detailResponse.body.steps)).toBe(true);
    expect(detailResponse.body.steps).toHaveLength(4);
    expect(detailResponse.body.steps[0]).toMatchObject({ role: 'user' });
    expect(detailResponse.body.steps[1]).toMatchObject({ role: 'assistant' });

    const archiveResponse = await request(app)
      .patch(`/api/advisors/convo/${conversationId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'completed' })
      .expect(200);

    expect(archiveResponse.body).toMatchObject({ id: conversationId, status: 'completed' });

    const listAfterArchive = await request(app)
      .get('/api/advisors/convo')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const archived = listAfterArchive.body.conversations.find((item: { id: number }) => item.id === conversationId);
    expect(archived?.status).toBe('completed');
  });
});
