import request from 'supertest';
import jwt from 'jsonwebtoken';

import { app } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';

describe('MDC transactions routes (journal double-partie)', () => {
  const email = 'mdc-transactions@nowis.local';
  let token: string;
  let userId: number;

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email } });

    const user = await prisma.user.create({
      data: { email, passwordHash: 'irrelevant' }
    });

    userId = user.id;
    token = jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await prisma.journalEntryLine.deleteMany({
      where: { entry: { userId } }
    } as any);
    await prisma.journalEntry.deleteMany({ where: { userId } } as any);
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('refuse une écriture non équilibrée', async () => {
    const res = await request(app)
      .post('/api/mdc/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'Test non équilibré',
        lines: [
          { accountCode: '1000', debit: 100 },
          { accountCode: '2000', credit: 90 }
        ]
      })
      .expect(400);

    expect(res.body.error).toMatch(/Écriture non équilibrée/);
  });

  it('crée puis liste une écriture équilibrée', async () => {
    const created = await request(app)
      .post('/api/mdc/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'Test équilibré',
        reference: 'REF-001',
        lines: [
          { accountCode: '1000', debit: 150 },
          { accountCode: '2000', credit: 150 }
        ]
      })
      .expect(201);

    expect(created.body).toMatchObject({ description: 'Test équilibré', reference: 'REF-001' });
    expect(created.body.lines).toHaveLength(2);

    const list = await request(app)
      .get('/api/mdc/transactions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(list.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ description: 'Test équilibré', lines: expect.any(Array) })
      ])
    );
  });
});
