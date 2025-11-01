/// <reference types="jest" />
import request from 'supertest';
import jwt from 'jsonwebtoken';

const SAMPLE_ATTACHMENT = Buffer.from('Example attachment content', 'utf-8');

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';
import { calculateScheduledPayment } from '../server/services/amortization';

describe('Properties nested routes', () => {
  const email = 'properties-nested@nowis.local';
  const otherEmail = 'properties-nested-other@nowis.local';
  let token: string;
  let propertyId: number;

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'irrelevant',
        properties: {
          create: {
            name: 'Bloc Test',
            currentValue: 350000
          }
        }
      },
      include: { properties: true }
    });

    token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: '1h' });
    propertyId = user.properties[0].id;

    await prisma.user.create({
      data: {
        email: otherEmail,
        passwordHash: 'irrelevant',
        properties: {
          create: {
            name: 'Bloc Autre'
          }
        }
      }
    });
  });

  afterAll(async () => {
    await prisma.attachment.deleteMany({ where: { property: { user: { email } } } });
    await prisma.mortgage.deleteMany({ where: { property: { user: { email } } } });
    await prisma.propertyUnit.deleteMany({ where: { property: { user: { email } } } });
    await prisma.property.deleteMany({ where: { user: { email: { in: [email, otherEmail] } } } });
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
  });

  it('gère le cycle de vie complet des unités', async () => {
    const getEmpty = await request(app)
      .get(`/api/properties/${propertyId}/units`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(getEmpty.body).toEqual([]);

    const createResponse = await request(app)
      .post(`/api/properties/${propertyId}/units`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Logement 201', squareFeet: 900, rentExpected: 1250 })
      .expect(201);

    expect(createResponse.body).toMatchObject({
      propertyId,
      label: 'Logement 201',
      squareFeet: 900,
      rentExpected: 1250
    });

    const unitId = createResponse.body.id;

    const updateResponse = await request(app)
      .put(`/api/properties/${propertyId}/units/${unitId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Logement 201B', squareFeet: 910, rentExpected: 1300 })
      .expect(200);

    expect(updateResponse.body).toMatchObject({
      id: unitId,
      label: 'Logement 201B',
      squareFeet: 910,
      rentExpected: 1300
    });

    const getList = await request(app)
      .get(`/api/properties/${propertyId}/units`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(getList.body).toEqual([
      expect.objectContaining({ id: unitId, label: 'Logement 201B' })
    ]);

    await request(app)
      .delete(`/api/properties/${propertyId}/units/${unitId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const afterDelete = await request(app)
      .get(`/api/properties/${propertyId}/units`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(afterDelete.body).toEqual([]);
  });

  it("refuse la création d'une unité sur un immeuble non autorisé", async () => {
    const otherProperty = await prisma.property.findFirstOrThrow({ where: { user: { email: otherEmail } } });

    const response = await request(app)
      .post(`/api/properties/${otherProperty.id}/units`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Interdit', squareFeet: 500, rentExpected: 900 })
      .expect(404);

    expect(response.body).toMatchObject({ error: 'Immeuble introuvable.' });
  });

  it('gère le cycle de vie complet des hypothèques', async () => {
    const createResponse = await request(app)
      .post(`/api/properties/${propertyId}/mortgages`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        lender: 'Banque Demo',
        principal: 250000,
        rateAnnual: 0.04,
        termMonths: 60,
        amortizationMonths: 300,
        startDate: '2024-01-01',
        paymentFrequency: 12
      })
      .expect(201);

    const expectedInitialPayment = calculateScheduledPayment({
      principal: 250000,
      rateAnnual: 0.04,
      amortizationMonths: 300,
      paymentFrequency: 12
    });

    expect(createResponse.body).toMatchObject({
      lender: 'Banque Demo',
      principal: 250000,
      rateAnnual: 0.04,
      termMonths: 60,
      paymentFrequency: 12,
      paymentAmount: expectedInitialPayment
    });
    expect(createResponse.body.paymentAmount).toBeCloseTo(expectedInitialPayment, 2);

    const mortgageId = createResponse.body.id;

    const listResponse = await request(app)
      .get(`/api/properties/${propertyId}/mortgages`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listResponse.body).toEqual([
      expect.objectContaining({ id: mortgageId, lender: 'Banque Demo' })
    ]);

    const updateResponse = await request(app)
      .put(`/api/properties/${propertyId}/mortgages/${mortgageId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        lender: 'Banque Demo',
        principal: 245000,
        rateAnnual: 0.041,
        termMonths: 48,
        amortizationMonths: 280,
        startDate: '2024-02-01',
        paymentFrequency: 26
      })
      .expect(200);

    const expectedUpdatedPayment = calculateScheduledPayment({
      principal: 245000,
      rateAnnual: 0.041,
      amortizationMonths: 280,
      paymentFrequency: 26
    });

    expect(updateResponse.body).toMatchObject({
      id: mortgageId,
      principal: 245000,
      rateAnnual: 0.041,
      termMonths: 48,
      paymentFrequency: 26,
      paymentAmount: expectedUpdatedPayment
    });
    expect(updateResponse.body.paymentAmount).toBeCloseTo(expectedUpdatedPayment, 2);

    await request(app)
      .delete(`/api/properties/${propertyId}/mortgages/${mortgageId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const emptyList = await request(app)
      .get(`/api/properties/${propertyId}/mortgages`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(emptyList.body).toEqual([]);
  });

  it("fournit un aperçu d'amortissement détaillé", async () => {
    const previewPayload = {
      lender: 'Banque Analyse',
      principal: 300000,
      rateAnnual: 0.045,
      termMonths: 60,
      amortizationMonths: 300,
      startDate: '2024-03-01',
      paymentFrequency: 12
    };

    const expectedPayment = calculateScheduledPayment({
      principal: previewPayload.principal,
      rateAnnual: previewPayload.rateAnnual,
      amortizationMonths: previewPayload.amortizationMonths,
      paymentFrequency: previewPayload.paymentFrequency
    });

    const previewResponse = await request(app)
      .post(`/api/properties/${propertyId}/mortgages/preview`)
      .set('Authorization', `Bearer ${token}`)
      .send(previewPayload)
      .expect(200);

    expect(previewResponse.body.paymentAmount).toBeCloseTo(expectedPayment, 2);
    expect(previewResponse.body.schedule).toHaveLength(previewResponse.body.totalPeriods);
    expect(previewResponse.body.annualBreakdown.length).toBeGreaterThan(0);

    const createResponse = await request(app)
      .post(`/api/properties/${propertyId}/mortgages`)
      .set('Authorization', `Bearer ${token}`)
      .send(previewPayload)
      .expect(201);

    const mortgageId = createResponse.body.id;

    const analysisResponse = await request(app)
      .get(`/api/properties/${propertyId}/mortgages/${mortgageId}/amortization`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(analysisResponse.body.mortgage.id).toBe(mortgageId);
    expect(analysisResponse.body.analysis.paymentAmount).toBeCloseTo(expectedPayment, 2);
    expect(analysisResponse.body.analysis.schedule.length).toBeGreaterThan(0);
    expect(analysisResponse.body.analysis.annualBreakdown.length).toBeGreaterThan(0);

    await request(app)
      .delete(`/api/properties/${propertyId}/mortgages/${mortgageId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
  });

  it('gère le cycle complet des pièces jointes', async () => {
    const mortgageResponse = await request(app)
      .post(`/api/properties/${propertyId}/mortgages`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        lender: 'Banque Annexe',
        principal: 150000,
        rateAnnual: 0.039,
        termMonths: 60,
        amortizationMonths: 300,
        startDate: '2024-05-01',
        paymentFrequency: 12
      })
      .expect(201);

    const mortgageId = mortgageResponse.body.id as number;

    const uploadResponse = await request(app)
      .post(`/api/properties/${propertyId}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'Contrat prêt')
      .field('mortgageId', String(mortgageId))
      .attach('file', SAMPLE_ATTACHMENT, 'contrat.pdf')
      .expect(201);

    const attachmentId = uploadResponse.body.id as number;

    expect(uploadResponse.body).toMatchObject({
      title: 'Contrat prêt',
      mortgageId
    });

    const listResponse = await request(app)
      .get(`/api/properties/${propertyId}/attachments?mortgageId=${mortgageId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0].id).toBe(attachmentId);

    const downloadResponse = await request(app)
      .get(`/api/properties/${propertyId}/attachments/${attachmentId}/download`)
      .set('Authorization', `Bearer ${token}`)
      .expect('Content-Type', /application\/pdf/)
      .expect(200);

    expect(downloadResponse.header['content-disposition']).toContain('attachment');

    await request(app)
      .delete(`/api/properties/${propertyId}/attachments/${attachmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const afterDelete = await request(app)
      .get(`/api/properties/${propertyId}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(afterDelete.body).toHaveLength(0);
  });
});
