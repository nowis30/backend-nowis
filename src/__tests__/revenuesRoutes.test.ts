import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';

describe('Revenues routes', () => {
  const email = 'revenues-case@nowis.local';
  let token: string;
  let userId: number;
  let propertyId: number;
  let revenueId: number;

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email } });

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'irrelevant',
        properties: {
          create: {
            name: 'Bloc Revenus',
            currentValue: 350000,
            expenses: {
              create: {
                label: 'Assurances',
                category: 'Assurance',
                amount: 900,
                frequency: 'ANNUEL',
                startDate: new Date('2024-01-01')
              }
            }
          }
        }
      },
      include: { properties: true }
    });

    userId = user.id;
    propertyId = user.properties[0].id;
    token = jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await prisma.revenue.deleteMany({ where: { property: { userId } } });
    await prisma.expense.deleteMany({ where: { property: { userId } } });
    await prisma.property.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('creates, updates and removes recurring revenues while updating the summary', async () => {
    const listResponse = await request(app)
      .get('/api/revenues')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listResponse.body).toEqual([]);

    const createResponse = await request(app)
      .post('/api/revenues')
      .set('Authorization', `Bearer ${token}`)
      .send({
        propertyId,
        label: 'Loyers résidentiels',
        amount: 2400,
        frequency: 'MENSUEL',
        startDate: '2024-01-01'
      })
      .expect(201);

    revenueId = createResponse.body.id;
    expect(createResponse.body).toMatchObject({
      propertyId,
      label: 'Loyers résidentiels',
      amount: 2400,
      frequency: 'MENSUEL'
    });

    const summaryAfterCreate = await request(app)
      .get('/api/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const propertySummary = summaryAfterCreate.body.properties.find(
      (item: { propertyId: number }) => item.propertyId === propertyId
    );

    expect(propertySummary).toBeDefined();
    expect(propertySummary.grossIncome).toBeCloseTo(2400, 2);

    const updateResponse = await request(app)
      .put(`/api/revenues/${revenueId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        propertyId,
        label: 'Loyers résidentiels',
        amount: 2700,
        frequency: 'MENSUEL',
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      })
      .expect(200);

    expect(updateResponse.body).toMatchObject({ amount: 2700, endDate: '2024-12-31T00:00:00.000Z' });

    const summaryAfterUpdate = await request(app)
      .get('/api/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const updatedSummary = summaryAfterUpdate.body.properties.find(
      (item: { propertyId: number }) => item.propertyId === propertyId
    );

    expect(updatedSummary).toBeDefined();
    expect(updatedSummary.grossIncome).toBeCloseTo(2700, 2);

    await request(app)
      .delete(`/api/revenues/${revenueId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const summaryAfterDelete = await request(app)
      .get('/api/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const finalSummary = summaryAfterDelete.body.properties.find(
      (item: { propertyId: number }) => item.propertyId === propertyId
    );

    expect(finalSummary).toBeDefined();
    expect(finalSummary.grossIncome).toBeCloseTo(0, 2);
  });

  it('rejects invalid payloads (amount <= 0, label vide)', async () => {
    const response = await request(app)
      .post('/api/revenues')
      .set('Authorization', `Bearer ${token}`)
      .send({
        propertyId,
        label: '   ',
        amount: 0,
        frequency: 'MENSUEL',
        startDate: '2024-01-01'
      })
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  it('filtre les revenus par immeuble', async () => {
    const otherProperty = await prisma.property.create({
      data: {
        userId,
        name: 'Bloc Commercial',
        currentValue: 600000
      }
    });

    await prisma.revenue.create({
      data: {
        propertyId: otherProperty.id,
        label: 'Local commercial',
        amount: 5000,
        frequency: 'MENSUEL',
        startDate: new Date('2024-01-01')
      }
    });

    const response = await request(app)
      .get(`/api/revenues?propertyId=${otherProperty.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ propertyId: otherProperty.id, label: 'Local commercial' });
  });

  it('importe un fichier CSV et ignore les lignes invalides', async () => {
    const csvProperty = await prisma.property.create({
      data: {
        userId,
        name: 'Bloc CSV',
        currentValue: 250000
      }
    });

    const csvPayload = [
      'propertyId,propertyName,label,amount,frequency,startDate,endDate',
      `${propertyId},,Loyer 1,1200,MENSUEL,2024-01-01,`,
      `,${csvProperty.name},Loyer 2,1500,MENSUEL,2024-02-01,2024-12-31`,
      `,,Ligne invalide,1500,MENSUEL,2024-02-01,`
    ].join('\n');

    const response = await request(app)
      .post('/api/revenues/import')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'text/csv')
      .send(csvPayload)
      .expect(201);

    expect(response.body.inserted).toBe(2);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          line: 4,
          message: expect.stringMatching(/Immeuble introuvable|Identifiant immeuble manquant/)
        })
      ])
    );

    const importedLabels = await prisma.revenue.findMany({
      where: { property: { userId }, label: { in: ['Loyer 1', 'Loyer 2'] } },
      select: { label: true }
    });

    expect(importedLabels).toHaveLength(2);

    await prisma.revenue.deleteMany({ where: { property: { userId }, label: { in: ['Loyer 1', 'Loyer 2'] } } });
    await prisma.property.delete({ where: { id: csvProperty.id } });
  });
});
