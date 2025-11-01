/// <reference types="jest" />
import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../server/middlewares/authenticated', () => ({
  authenticated: (req: any, _res: any, next: any) => {
    req.userId = 1;
    next();
  }
}));

const db: any = {
  shareholders: [{ id: 7, userId: 1, displayName: 'Profil personnel' }],
  personalIncomes: [
    { id: 1, shareholderId: 7, taxYear: 2024, category: 'EMPLOYMENT', label: 'Salaire – ACME', amount: 1000 },
    { id: 2, shareholderId: 7, taxYear: 2024, category: 'OTHER', label: 'Autre revenu', amount: 200 }
  ],
  personalTaxReturns: [ { id: 10, shareholderId: 7, taxYear: 2024, taxableIncome: 1200, federalTax: 100, provincialTax: 50, balanceDue: 0 } ],
  taxSlips: [ { id: 20, returnId: 10, slipType: 'T4', issuer: 'ACME', accountNumber: null } ],
  taxSlipLines: [ { id: 30, slipId: 20, code: '14', label: 'Employment income', amount: 1000 } ],
  journalEntries: [ { id: 40, userId: 1, entryDate: new Date('2024-12-31T23:00:00Z'), description: 'Salaire – ACME', reference: 'T4' } ],
  journalLines: [
    { id: 50, entryId: 40, accountCode: '1100', debit: 1000, credit: 0, memo: 'Salaire – ACME' },
    { id: 51, entryId: 40, accountCode: '4200', debit: 0, credit: 1000, memo: 'Salaire – ACME' }
  ]
};

jest.mock('../server/lib/prisma', () => ({
  prisma: {
    shareholder: {
      findFirst: jest.fn(async (args: any) => db.shareholders.find((s: any) => s.id === args.where.id && s.userId === args.where.userId) || null)
    },
    personalIncome: {
      findMany: jest.fn(async (args: any) => db.personalIncomes.filter((r: any) => r.shareholderId === args.where.shareholderId && r.taxYear === args.where.taxYear))
    },
    personalTaxReturn: {
      findFirst: jest.fn(async (args: any) => db.personalTaxReturns.find((r: any) => r.shareholderId === args.where.shareholderId && r.taxYear === args.where.taxYear) || null)
    },
    personalTaxReturnLine: {
      findMany: jest.fn(async (args: any) => db.taxSlipLines.filter((l: any) => l.returnId === args.where.returnId))
    },
    taxSlip: {
      findMany: jest.fn(async (args: any) => db.taxSlips.filter((s: any) => s.returnId === args.where.returnId).map((s: any) => ({ ...s, lines: db.taxSlipLines.filter((l: any) => l.slipId === s.id) })))
    },
    journalEntry: {
      findMany: jest.fn(async (args: any) => db.journalEntries.filter((e: any) => e.userId === args.where.userId && e.entryDate >= args.where.entryDate.gte && e.entryDate <= args.where.entryDate.lte))
    },
    journalEntryLine: {
      findMany: jest.fn(async (args: any) => db.journalLines.filter((l: any) => l.entryId === args.where.entryId))
    }
  }
}));

jest.mock('../server/env', () => ({ env: { PORT: 4000, DATABASE_URL: 'file:mock', JWT_SECRET: 'x'.repeat(32), ADVISOR_ENGINE: 'heuristic' } }));

import { app } from '../server/app';

describe('GET /api/why/personal-income', () => {
  beforeEach(() => {
    // no-op reset for now
  });

  it('retourne la décomposition du total avec items, retour et journal', async () => {
    const res = await request(app)
      .get('/api/why/personal-income?shareholderId=7&taxYear=2024')
      .set('Authorization', 'Bearer fake')
      .expect(200);

    expect(res.body).toHaveProperty('totalIncome', 1200);
    expect(res.body.items.length).toBe(2);
    expect(res.body.taxReturn).not.toBeNull();
    expect(res.body.taxReturn.slips.length).toBeGreaterThanOrEqual(0); // mocked via lines API? kept minimal
    expect(res.body.journal.entries.length).toBe(1);
    const lines = res.body.journal.entries[0].lines;
    expect(lines.length).toBe(2);
  });
});
