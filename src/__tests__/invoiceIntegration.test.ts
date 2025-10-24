import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';

describe('Invoices integration', () => {
  const email = 'invoice-summary@nowis.local';
  let token: string;
  let userId: number;
  let propertyId: number;

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email } });

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'irrelevant',
        properties: {
          create: {
            name: 'Bloc Essai',
            currentValue: 100000,
            revenues: {
              create: {
                label: 'Loyer principal',
                amount: 2000,
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
    await prisma.invoice.deleteMany({ where: { property: { userId } } });
    await prisma.revenue.deleteMany({ where: { property: { userId } } });
    await prisma.property.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("crée une facture avec date simplifiée et l'intègre au résumé", async () => {
    await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        propertyId,
        invoiceDate: '2024-08-15',
        supplier: 'Hydro Québec',
        amount: 100,
        category: 'Énergie',
        gst: 5,
        qst: 9.975
      })
      .expect(201);

    const summaryResponse = await request(app)
      .get('/api/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const propertySummary = summaryResponse.body.properties[0];
    expect(propertySummary.operatingExpenses).toBeCloseTo(114.975, 3);
  });
});
