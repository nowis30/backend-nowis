import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';
import { purgeUsersByEmails, purgeUsersByIds } from './helpers/prismaCleanup';

describe('Advisors AI route', () => {
  jest.setTimeout(25000);

  const email = 'advisors-route@nowis.local';
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

  it('renvoie le questionnaire complet', async () => {
    const response = await request(app)
      .get('/api/advisors/questions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const payload = response.body as { questions: Array<Record<string, unknown>> };
    expect(Array.isArray(payload.questions)).toBe(true);
    expect(payload.questions).toHaveLength(8);
    expect(payload.questions[0]).toMatchObject({ id: 'assetProfile', label: expect.any(String) });
  });

  it('pose les questions une à une avant de livrer les conseils', async () => {
    const partialResponse = await request(app)
      .post('/api/advisors/evaluate')
      .set('Authorization', `Bearer ${token}`)
      .set('x-advisor-engine', 'heuristic')
      .send({
        answers: [
          { questionId: 'assetProfile', value: 'BUSINESS' },
          { questionId: 'taxableIncome', value: '350000' },
          { questionId: 'profitMargin', value: '28' }
        ]
      })
      .expect(200);

    expect(partialResponse.body.completed).toBe(false);
    expect(partialResponse.body.nextQuestion).toMatchObject({ id: 'province' });

    const finalResponse = await request(app)
      .post('/api/advisors/evaluate')
      .set('Authorization', `Bearer ${token}`)
      .set('x-advisor-engine', 'heuristic')
      .send({
        answers: [
          { questionId: 'assetProfile', value: 'BUSINESS' },
          { questionId: 'taxableIncome', value: '350000' },
          { questionId: 'profitMargin', value: '28' },
          { questionId: 'province', value: 'QC' },
          { questionId: 'holdingStructure', value: 'YES' },
          { questionId: 'dividendIntent', value: 'LOW' },
          { questionId: 'liquidityGoal', value: 'GROWTH' },
          { questionId: 'legalConcern', value: 'SUCCESSION' }
        ]
      })
      .expect(200);

    expect(finalResponse.body.completed).toBe(true);
    expect(finalResponse.body.nextQuestion).toBeNull();
    expect(finalResponse.body.recommendations).toHaveLength(4);
    expect(finalResponse.body.metrics.length).toBeGreaterThanOrEqual(4);
    expect(finalResponse.body.followUps.length).toBeGreaterThan(0);
    expect(typeof finalResponse.body.coordinatorSummary).toBe('string');
  });
});
