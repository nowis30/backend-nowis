import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';

describe('Companies routes', () => {
  const email = 'companies-e2e@nowis.local';
  const otherEmail = 'companies-e2e-other@nowis.local';
  let token: string;
  let otherCompanyId: number;

  beforeAll(async () => {
    await prisma.userRole.deleteMany({ where: { user: { email: { in: [email, otherEmail] } } } });
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });

    const adminRole = await prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN' }
    });

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'irrelevant'
      }
    });

    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: adminRole.id
      }
    });

    token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: '1h' });

    const otherUser = await prisma.user.create({
      data: {
        email: otherEmail,
        passwordHash: 'irrelevant',
        companies: {
          create: {
            name: 'Autre Compagnie'
          }
        }
      },
      include: {
        companies: true
      }
    });

    otherCompanyId = otherUser.companies[0].id;
  });

  afterAll(async () => {
    await prisma.userRole.deleteMany({ where: { user: { email: { in: [email, otherEmail] } } } });
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
  });

  it('gère le cycle de vie complet des entreprises et ressources associées', async () => {
    const listEmpty = await request(app)
      .get('/api/companies')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listEmpty.body).toEqual([]);

    const createResponse = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Compagnie Tremblay',
        province: 'QC',
        fiscalYearEnd: '2024-12-31',
        neq: '1160000001'
      })
      .expect(201);

    expect(createResponse.body).toMatchObject({
      name: 'Compagnie Tremblay',
      province: 'QC',
      neq: '1160000001'
    });

    const companyId: number = createResponse.body.id;

    const detailResponse = await request(app)
      .get(`/api/companies/${companyId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(detailResponse.body).toMatchObject({
      id: companyId,
      name: 'Compagnie Tremblay',
      shareClasses: [],
      shareholders: [],
      shareTransactions: []
    });

    const shareholdersEmpty = await request(app)
      .get(`/api/companies/${companyId}/shareholders`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(shareholdersEmpty.body).toEqual([]);

    const createShareholder = await request(app)
      .post(`/api/companies/${companyId}/shareholders`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        shareholder: {
          displayName: 'Jean Tremblay',
          type: 'person',
          contactEmail: 'jean@example.com'
        },
        role: 'Administrateur'
      })
      .expect(201);

    expect(createShareholder.body).toMatchObject({
      role: 'Administrateur',
      shareholder: {
        displayName: 'Jean Tremblay',
        type: 'PERSON'
      }
    });

    const linkId: number = createShareholder.body.id;
    const shareholderId: number = createShareholder.body.shareholder.id;

    const updateShareholder = await request(app)
      .put(`/api/companies/${companyId}/shareholders/${linkId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        role: 'Président',
        votingPercent: 65,
        shareholder: {
          displayName: 'Jean-François Tremblay',
          contactEmail: 'jtremblay@example.com',
          contactPhone: '514-555-0101'
        }
      })
      .expect(200);

    expect(updateShareholder.body).toMatchObject({
      role: 'Président',
      votingPercent: 65,
      shareholder: {
        displayName: 'Jean-François Tremblay',
        contactEmail: 'jtremblay@example.com',
        contactPhone: '514-555-0101'
      }
    });

    const refreshedDetailAfterShareholder = await request(app)
      .get(`/api/companies/${companyId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(refreshedDetailAfterShareholder.body.shareholders[0]).toMatchObject({
      role: 'Président',
      shareholder: {
        displayName: 'Jean-François Tremblay',
        contactPhone: '514-555-0101'
      }
    });

    const createShareClass = await request(app)
      .post(`/api/companies/${companyId}/share-classes`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'A',
        description: 'Actions ordinaires'
      })
      .expect(201);

    expect(createShareClass.body).toMatchObject({
      code: 'A',
      hasVotingRights: true
    });

    const shareClassId: number = createShareClass.body.id;

    const updateShareClass = await request(app)
      .put(`/api/companies/${companyId}/share-classes/${shareClassId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'A',
        description: 'Actions ordinaires participantes',
        hasVotingRights: false,
        participatesInGrowth: true,
        dividendPolicy: 'Dividende au besoin.'
      })
      .expect(200);

    expect(updateShareClass.body).toMatchObject({
      id: shareClassId,
      hasVotingRights: false,
      dividendPolicy: 'Dividende au besoin.'
    });

    const createStatement = await request(app)
      .post(`/api/companies/${companyId}/statements`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        statementType: 'income_statement',
        periodStart: '2024-01-01',
        periodEnd: '2024-12-31',
        totalAssets: 200000,
        totalLiabilities: 120000,
        totalEquity: 80000,
        totalRevenue: 150000,
        totalExpenses: 110000,
        netIncome: 40000,
        lines: [
          { category: 'REVENUE', label: 'Ventes', amount: 150000, orderIndex: 0 },
          { category: 'EXPENSE', label: 'Charges', amount: 110000, orderIndex: 1 }
        ]
      })
      .expect(201);

    expect(createStatement.body).toMatchObject({
      statementType: 'INCOME_STATEMENT',
      totals: {
        assets: 200000,
        liabilities: 120000,
        netIncome: 40000
      }
    });

    const statementId: number = createStatement.body.id;

    const updateStatement = await request(app)
      .put(`/api/companies/${companyId}/statements/${statementId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        totalAssets: 210000,
        totalEquity: 90000,
        lines: [
          { category: 'REVENUE', label: 'Ventes', amount: 155000, orderIndex: 0 },
          { category: 'EXPENSE', label: 'Charges', amount: 110000, orderIndex: 1 },
          { category: 'EXPENSE', label: 'Frais administratifs', amount: 5000, orderIndex: 2 }
        ]
      })
      .expect(200);

    expect(updateStatement.body).toMatchObject({
      totals: {
        assets: 210000,
        equity: 90000
      },
      lines: expect.arrayContaining([
        expect.objectContaining({ label: 'Frais administratifs', amount: 5000 })
      ])
    });

    const createResolution = await request(app)
      .post(`/api/companies/${companyId}/resolutions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'dividend_declaration',
        title: 'Distribution annuelle',
        resolutionDate: '2024-06-30',
        body: 'Distribution de dividendes de 20 000 $.'
      })
      .expect(201);

    expect(createResolution.body).toMatchObject({
      type: 'DIVIDEND_DECLARATION',
      title: 'Distribution annuelle'
    });

    const resolutionId: number = createResolution.body.id;

    const updateResolution = await request(app)
      .put(`/api/companies/${companyId}/resolutions/${resolutionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Distribution annuelle révisée',
        body: 'Distribution ajustée à 18 000 $.',
        metadata: 'APPROVED'
      })
      .expect(200);

    expect(updateResolution.body).toMatchObject({
      title: 'Distribution annuelle révisée',
      body: 'Distribution ajustée à 18 000 $.',
      metadata: 'APPROVED'
    });

    const createTransaction = await request(app)
      .post(`/api/companies/${companyId}/share-transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        shareholderId,
        shareClassId,
        type: 'issuance',
        transactionDate: '2024-01-01',
        quantity: 1000,
        pricePerShare: 1,
        considerationPaid: 1000,
        fairMarketValue: 1000,
        notes: 'Émission initiale'
      })
      .expect(201);

    expect(createTransaction.body).toMatchObject({
      type: 'ISSUANCE',
      quantity: 1000,
      shareholder: {
        id: shareholderId
      },
      shareClass: {
        id: shareClassId
      }
    });

    const transactionId: number = createTransaction.body.id;

    const updateTransaction = await request(app)
      .put(`/api/companies/${companyId}/share-transactions/${transactionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        shareholderId,
        shareClassId,
        type: 'transfer',
        transactionDate: '2024-02-01',
        quantity: 900,
        pricePerShare: 1.1,
        considerationPaid: 990,
        fairMarketValue: 990
      })
      .expect(200);

    expect(updateTransaction.body).toMatchObject({
      id: transactionId,
      type: 'TRANSFER',
      quantity: 900,
      pricePerShare: 1.1
    });

    const transactionsList = await request(app)
      .get(`/api/companies/${companyId}/share-transactions`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(transactionsList.body).toHaveLength(1);

    await request(app)
      .delete(`/api/companies/${companyId}/share-transactions/${transactionId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    await request(app)
      .delete(`/api/companies/${companyId}/statements/${statementId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    await request(app)
      .delete(`/api/companies/${companyId}/resolutions/${resolutionId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    await request(app)
      .delete(`/api/companies/${companyId}/share-classes/${shareClassId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    await request(app)
      .delete(`/api/companies/${companyId}/shareholders/${linkId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    await request(app)
      .delete(`/api/companies/${companyId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const listAfterDelete = await request(app)
      .get('/api/companies')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listAfterDelete.body).toEqual([]);
  });

  it("refuse l'accès aux entreprises d'un autre utilisateur", async () => {
    await request(app)
      .get(`/api/companies/${otherCompanyId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    await request(app)
      .post(`/api/companies/${otherCompanyId}/share-classes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'X' })
      .expect(404);
  });
});
