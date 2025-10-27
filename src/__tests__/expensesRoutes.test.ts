import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';
import { purgeUsersByEmails, purgeUsersByIds } from './helpers/prismaCleanup';

describe('Expenses routes', () => {
  jest.setTimeout(20000);

  const email = 'expenses-case@nowis.local';
  let token: string;
  let userId: number;
  let propertyId: number;
  let expenseId: number;

  beforeAll(async () => {
    await purgeUsersByEmails(email);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'irrelevant',
        properties: {
          create: {
            name: 'Bloc Taxes',
            currentValue: 400000,
            revenues: {
              create: {
                label: 'Loyer mensuel',
                amount: 2500,
                frequency: 'MENSUEL',
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
    await purgeUsersByIds(userId);
  });

  it('creates, updates and removes recurring expenses while updating the summary', async () => {
    const listResponse = await request(app)
      .get('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listResponse.body).toEqual([]);

    const createResponse = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        propertyId,
        label: 'Assurances habitation',
        category: 'Assurance',
        amount: 1200,
        frequency: 'ANNUEL',
        startDate: '2024-01-01'
      })
      .expect(201);

    expenseId = createResponse.body.id;
    expect(createResponse.body).toMatchObject({
      propertyId,
      label: 'Assurances habitation',
      category: 'Assurance',
      amount: 1200,
      frequency: 'ANNUEL'
    });

    const summaryAfterCreate = await request(app)
      .get('/api/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const propertySummary = summaryAfterCreate.body.properties.find(
      (item: { propertyId: number }) => item.propertyId === propertyId
    );

    expect(propertySummary).toBeDefined();
    expect(propertySummary.operatingExpenses).toBeCloseTo(1200, 2);

    const updateResponse = await request(app)
      .put(`/api/expenses/${expenseId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        propertyId,
        label: 'Assurances habitation',
        category: 'Assurance',
        amount: 1500,
        frequency: 'ANNUEL',
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      })
      .expect(200);

    expect(updateResponse.body).toMatchObject({ amount: 1500, endDate: '2024-12-31T00:00:00.000Z' });

    const summaryAfterUpdate = await request(app)
      .get('/api/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const updatedPropertySummary = summaryAfterUpdate.body.properties.find(
      (item: { propertyId: number }) => item.propertyId === propertyId
    );

    expect(updatedPropertySummary).toBeDefined();
    expect(updatedPropertySummary.operatingExpenses).toBeCloseTo(1500, 2);

    await request(app)
      .delete(`/api/expenses/${expenseId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const summaryAfterDelete = await request(app)
      .get('/api/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const finalPropertySummary = summaryAfterDelete.body.properties.find(
      (item: { propertyId: number }) => item.propertyId === propertyId
    );

    expect(finalPropertySummary).toBeDefined();
    expect(finalPropertySummary.operatingExpenses).toBeCloseTo(0, 2);
  });

  it('rejects invalid payloads (amount <= 0, labels vides)', async () => {
    const response = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        propertyId,
        label: '   ',
        category: '   ',
        amount: 0,
        frequency: 'ANNUEL',
        startDate: '2024-01-01'
      })
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  it("exporte le rapport fiscal des dépenses en JSON et CSV", async () => {
    const reportProperty = await prisma.property.create({
      data: {
        userId,
        name: 'Bloc Fiscal'
      }
    });

    const otherProperty = await prisma.property.create({
      data: {
        userId,
        name: 'Bloc Fiscal 2'
      }
    });

    const createdExpenseIds: number[] = [];

    const monthly = await prisma.expense.create({
      data: {
        propertyId: reportProperty.id,
        label: 'Taxes mensuelles',
        category: 'Taxes',
        amount: 100,
        frequency: 'MENSUEL',
        startDate: new Date('2024-01-01')
      }
    });
    createdExpenseIds.push(monthly.id);

    const punctual = await prisma.expense.create({
      data: {
        propertyId: reportProperty.id,
        label: 'Réparation urgente',
        category: 'Entretien',
        amount: 800,
        frequency: 'PONCTUEL',
        startDate: new Date('2024-03-15')
      }
    });
    createdExpenseIds.push(punctual.id);

    const weekly = await prisma.expense.create({
      data: {
        propertyId: reportProperty.id,
        label: 'Entretien paysager',
        category: 'Entretien',
        amount: 50,
        frequency: 'HEBDOMADAIRE',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-28')
      }
    });
    createdExpenseIds.push(weekly.id);

    const annual = await prisma.expense.create({
      data: {
        propertyId: otherProperty.id,
        label: 'Assurance multirisque',
        category: 'Assurance',
        amount: 600,
        frequency: 'ANNUEL',
        startDate: new Date('2023-07-01'),
        endDate: new Date('2025-07-01')
      }
    });
    createdExpenseIds.push(annual.id);

    const jsonResponse = await request(app)
      .get('/api/expenses/export/fiscal?year=2024')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(jsonResponse.body).toHaveProperty('year', 2024);
    expect(jsonResponse.body).toHaveProperty('generatedAt');

    const propertyReport = jsonResponse.body.properties.find(
  (entry: { propertyId: number }) => entry.propertyId === reportProperty.id
    );

    expect(propertyReport).toBeDefined();
    expect(propertyReport.totalAmount).toBeCloseTo(1200 + 800 + 200, 2);

    const taxesCategory = propertyReport.categories.find(
      (category: { category: string }) => category.category === 'Taxes'
    );
    expect(taxesCategory).toBeDefined();
    expect(taxesCategory.totalAmount).toBeCloseTo(1200, 2);
    expect(taxesCategory.items[0]).toMatchObject({ occurrences: 12, totalAmount: 1200 });

    const entretienCategory = propertyReport.categories.find(
      (category: { category: string }) => category.category === 'Entretien'
    );
    expect(entretienCategory).toBeDefined();
    expect(entretienCategory.totalAmount).toBeCloseTo(800 + 200, 2);

    const otherPropertyReport = jsonResponse.body.properties.find(
      (entry: { propertyId: number }) => entry.propertyId === otherProperty.id
    );
    expect(otherPropertyReport).toBeDefined();
    expect(otherPropertyReport.totalAmount).toBeCloseTo(600, 2);

    expect(jsonResponse.body.totalAmount).toBeCloseTo(1200 + 800 + 200 + 600, 2);

    const csvResponse = await request(app)
      .get('/api/expenses/export/fiscal?year=2024&format=csv')
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /text\/csv/)
      .expect(200);

  expect(csvResponse.text).toContain('Bloc Fiscal');
  expect(csvResponse.text).toContain('Assurance multirisque');
  expect(csvResponse.text).toContain('TOTAL IMMEUBLE');

    await prisma.expense.deleteMany({ where: { id: { in: createdExpenseIds } } });
    await prisma.property.deleteMany({ where: { id: { in: [reportProperty.id, otherProperty.id] } } });
  });
});
