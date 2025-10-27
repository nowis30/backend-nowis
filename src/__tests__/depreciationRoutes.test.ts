import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';
import { purgeUsersByEmails, purgeUsersByIds } from './helpers/prismaCleanup';

describe('Depreciation routes', () => {
  jest.setTimeout(15000);

  const email = 'depreciation-case@nowis.local';
  let token: string;
  let userId: number;
  let propertyId: number;

  beforeAll(async () => {
  await purgeUsersByEmails(email);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'irrelevant',
        properties: {
          create: {
            name: 'Immeuble CCA',
            currentValue: 500000,
            revenues: {
              create: {
                label: 'Loyers',
                amount: 5000,
                frequency: 'MENSUEL',
                startDate: new Date('2024-01-01')
              }
            },
            expenses: {
              create: {
                label: 'Assurances',
                category: 'Assurance',
                amount: 1000,
                frequency: 'MENSUEL',
                startDate: new Date('2024-01-01')
              }
            }
          }
        }
      },
      include: {
        properties: true
      }
    });

    userId = user.id;
    propertyId = user.properties[0].id;
    token = jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await purgeUsersByIds(userId);
  });

  it('returns default depreciation values when nothing is configured', async () => {
    const response = await request(app)
      .get(`/api/properties/${propertyId}/depreciation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      classCode: '',
      ccaRate: 0,
      openingUcc: 0,
      additions: 0,
      dispositions: 0
    });
  });

  it('saves depreciation settings and integrates them into the summary', async () => {
    const payload = {
      classCode: '1',
      ccaRate: 0.04,
      openingUcc: 100000,
      additions: 10000,
      dispositions: 0
    };

    const saveResponse = await request(app)
      .put(`/api/properties/${propertyId}/depreciation`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(200);

    expect(saveResponse.body).toEqual(payload);

    const fetchResponse = await request(app)
      .get(`/api/properties/${propertyId}/depreciation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(fetchResponse.body).toEqual(payload);

    const summaryResponse = await request(app)
      .get('/api/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const propertySummary = summaryResponse.body.properties.find(
      (item: { propertyId: number }) => item.propertyId === propertyId
    );

    expect(propertySummary).toBeDefined();
    expect(propertySummary.cca).toBeCloseTo(4000, 2);
    expect(summaryResponse.body.totals.cca).toBeCloseTo(4000, 2);
  });
});
