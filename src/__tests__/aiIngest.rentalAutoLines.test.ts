/// <reference types="jest" />
import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Auth mock
jest.mock('../server/middlewares/authenticated', () => ({
  authenticated: (req: any, _res: any, next: any) => {
    req.userId = 1;
    next();
  }
}));

// In-memory DB for this suite
const db: any = {
  users: [{ id: 1, email: 'ingest@example.com' }],
  shareholders: [] as any[],
  uploadedDocuments: [] as any[],
  personalTaxReturns: [] as any[],
  personalTaxReturnLines: [] as any[],
  taxSlips: [] as any[],
  taxSlipLines: [] as any[],
  properties: [] as any[],
  revenues: [] as any[],
  expenses: [] as any[],
  rentalTaxStatements: [] as any[]
};

// Prisma mock (subset used by ingest for rental auto-lines)
jest.mock('../server/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async (args: any) => db.users.find((u: any) => u.id === args.where.id) || null)
    },
    shareholder: {
      findFirst: jest.fn(async (args: any) => {
        const where = args.where || {};
        if (where.id && where.userId) {
          return db.shareholders.find((s: any) => s.id === where.id && s.userId === where.userId) || null;
        }
        if (where.userId) {
          return db.shareholders.filter((s: any) => s.userId === where.userId).sort((a: any, b: any) => a.id - b.id)[0] || null;
        }
        return null;
      }),
      create: jest.fn(async (args: any) => {
        const id = db.shareholders.length + 1;
        const rec = { id, ...args.data };
        db.shareholders.push(rec);
        return args.select ? { id } : rec;
      }),
      update: jest.fn(async (args: any) => {
        const idx = db.shareholders.findIndex((s: any) => s.id === args.where.id);
        if (idx >= 0) {
          db.shareholders[idx] = { ...db.shareholders[idx], ...args.data };
          return db.shareholders[idx];
        }
        throw new Error('Shareholder not found');
      })
    },
    uploadedDocument: {
      findFirst: jest.fn(async (args: any) =>
        db.uploadedDocuments.find(
          (d: any) => d.userId === args.where.userId && d.domain === args.where.domain && d.checksum === args.where.checksum
        ) || null
      ),
      create: jest.fn(async (args: any) => {
        const id = db.uploadedDocuments.length + 1;
        const rec = { id, createdAt: new Date(), updatedAt: new Date(), ...args.data };
        db.uploadedDocuments.push(rec);
        return rec;
      }),
      update: jest.fn(async (args: any) => {
        const idx = db.uploadedDocuments.findIndex((d: any) => d.id === args.where.id);
        if (idx >= 0) {
          db.uploadedDocuments[idx] = { ...db.uploadedDocuments[idx], ...args.data };
          return db.uploadedDocuments[idx];
        }
        throw new Error('Doc not found');
      })
    },
    personalTaxReturn: {
      upsert: jest.fn(async (args: any) => {
        const existing = db.personalTaxReturns.find(
          (r: any) => r.shareholderId === args.where.shareholderId_taxYear.shareholderId && r.taxYear === args.where.shareholderId_taxYear.taxYear
        );
        if (existing) {
          Object.assign(existing, args.update);
          return existing;
        } else {
          const id = db.personalTaxReturns.length + 1;
          const rec = { id, createdAt: new Date(), updatedAt: new Date(), ...args.create };
          db.personalTaxReturns.push(rec);
          return rec;
        }
      }),
      update: jest.fn(async (args: any) => {
        const idx = db.personalTaxReturns.findIndex((r: any) => r.id === args.where.id);
        if (idx >= 0) {
          db.personalTaxReturns[idx] = { ...db.personalTaxReturns[idx], ...args.data };
          return db.personalTaxReturns[idx];
        }
        throw new Error('Return not found');
      })
    },
    personalTaxReturnLine: {
      deleteMany: jest.fn(async (args: any) => {
        const before = db.personalTaxReturnLines.length;
        db.personalTaxReturnLines = db.personalTaxReturnLines.filter((l: any) => !(l.returnId === args.where.returnId && l.section === args.where.section));
        return { count: before - db.personalTaxReturnLines.length };
      }),
      create: jest.fn(async (args: any) => {
        const id = db.personalTaxReturnLines.length + 1;
        const rec = { id, createdAt: new Date(), updatedAt: new Date(), ...args.data };
        db.personalTaxReturnLines.push(rec);
        return rec;
      })
    },
    taxSlip: {
      deleteMany: jest.fn(async (args: any) => {
        const before = db.taxSlips.length;
        db.taxSlips = db.taxSlips.filter((s: any) => s.returnId !== args.where.returnId);
        return { count: before - db.taxSlips.length };
      }),
      create: jest.fn(async (args: any) => {
        const id = db.taxSlips.length + 1;
        const rec = { id, createdAt: new Date(), updatedAt: new Date(), ...args.data };
        db.taxSlips.push(rec);
        return rec;
      })
    },
    taxSlipLine: {
      create: jest.fn(async (args: any) => {
        const id = db.taxSlipLines.length + 1;
        const rec = { id, createdAt: new Date(), updatedAt: new Date(), ...args.data };
        db.taxSlipLines.push(rec);
        return rec;
      })
    },
    property: {
      findMany: jest.fn(async (args: any) => db.properties.filter((p: any) => p.userId === args.where.userId)),
      create: jest.fn(async (args: any) => {
        const id = db.properties.length + 1;
        const rec = { id, ...args.data };
        db.properties.push(rec);
        return args.select ? { id: rec.id, name: rec.name, address: rec.address } : rec;
      })
    },
    revenue: {
      findFirst: jest.fn(async (args: any) =>
        db.revenues.find((r: any) => r.propertyId === args.where.propertyId && r.label === args.where.label && new Date(r.startDate).getTime() === new Date(args.where.startDate).getTime()) || null
      ),
      create: jest.fn(async (args: any) => {
        const id = db.revenues.length + 1;
        const rec = { id, ...args.data };
        db.revenues.push(rec);
        return rec;
      })
    },
    expense: {
      findFirst: jest.fn(async (args: any) =>
        db.expenses.find((e: any) => e.propertyId === args.where.propertyId && e.label === args.where.label && new Date(e.startDate).getTime() === new Date(args.where.startDate).getTime()) || null
      ),
      create: jest.fn(async (args: any) => {
        const id = db.expenses.length + 1;
        const rec = { id, ...args.data };
        db.expenses.push(rec);
        return rec;
      })
    },
    rentalTaxStatement: {
      create: jest.fn(async (args: any) => {
        const id = db.rentalTaxStatements.length + 1;
        const rec = { id, createdAt: new Date(), updatedAt: new Date(), ...args.data };
        db.rentalTaxStatements.push(rec);
        return rec;
      })
    }
  }
}));

// Mock extractors
const mockExtract = jest.fn() as jest.MockedFunction<(...args: any[]) => Promise<any>>;
const mockExtractRent = jest.fn() as jest.MockedFunction<(...args: any[]) => Promise<any>>;
jest.mock('../server/services/tax', () => ({
  extractPersonalTaxReturn: (...args: any[]) => mockExtract(...args),
  extractRentalTaxSummaries: (...args: any[]) => mockExtractRent(...args)
}));

// Mock FS storage
const mockSave: any = jest.fn();
jest.mock('../server/services/documentStorage', () => ({
  saveUserDocumentFile: (...args: any[]) => mockSave(...args)
}));

// Env
jest.mock('../server/env', () => ({
  env: {
    PORT: 4000,
    DATABASE_URL: 'file:mock',
    JWT_SECRET: 'x'.repeat(32),
    ADVISOR_ENGINE: 'heuristic',
    OPENAI_API_KEY: 'test-key'
  }
}));

import { app } from '../server/app';

describe('AI ingest – auto-lignes Immeuble depuis T776/TP-128 (idempotent)', () => {
  beforeEach(() => {
    db.shareholders.length = 0;
    db.uploadedDocuments.length = 0;
    db.personalTaxReturns.length = 0;
    db.personalTaxReturnLines.length = 0;
    db.taxSlips.length = 0;
    db.taxSlipLines.length = 0;
    db.properties.length = 0;
    db.revenues.length = 0;
    db.expenses.length = 0;
    db.rentalTaxStatements.length = 0;
    mockExtract.mockReset();
    mockExtractRent.mockReset();
    mockSave.mockReset();
    mockSave.mockResolvedValue({ storagePath: 'user-1/docs/fixed.bin', checksum: 'fixedsum', filename: 'fixed.bin' });
  });

  it('crée lignes Revenus/Dépenses ANNUELLES lors de l’ingestion, puis ne duplique pas au ré-import', async () => {
    // Extraction principale: année ciblée
    mockExtract.mockResolvedValue({ taxYear: 2024, items: [] });
    // Résumé locatif: un seul bloc T776
    mockExtractRent.mockResolvedValue([
      {
        formType: 'T776',
        taxYear: 2024,
        propertyName: 'Duplex St-Denis',
        propertyAddress: '1234 Rue St-Denis, Montréal, QC',
        grossRents: 24000,
        otherIncome: 1200,
        totalExpenses: 8000,
        netIncome: 17200
      }
    ]);

    // 1) Premier import
    const res1 = await request(app)
      .post('/api/ai/ingest?domain=personal-income&autoCreate=true')
      .set('Authorization', 'Bearer fake')
      .attach('file', Buffer.from('%PDF-1.7'), { filename: 'impot-2024.pdf', contentType: 'application/pdf' })
      .expect(200);

  expect(res1.body).toMatchObject({ taxYear: 2024 });
    // Immeuble auto-créé et état locatif créé
    expect(db.properties.length).toBe(1);
    expect(db.rentalTaxStatements.length).toBe(1);
    // Lignes agrégées créées (2 revenus + 1 dépense)
    expect(db.revenues.length).toBe(2);
    expect(db.expenses.length).toBe(1);

    const labels = db.revenues.map((r: any) => r.label).concat(db.expenses.map((e: any) => e.label));
    expect(labels).toEqual(
      expect.arrayContaining([
        'T776 2024 – Loyers bruts',
        'T776 2024 – Autres revenus locatifs',
        'T776 2024 – Dépenses totales (agrégées)'
      ])
    );

    // 2) Ré-ingestion identique → pas de doublons sur lignes
    const res2 = await request(app)
      .post('/api/ai/ingest?domain=personal-income&autoCreate=true')
      .set('Authorization', 'Bearer fake')
      .attach('file', Buffer.from('%PDF-1.7'), { filename: 'impot-2024.pdf', contentType: 'application/pdf' })
      .expect(200);

  expect(res2.body).toMatchObject({ taxYear: 2024 });
    expect(db.properties.length).toBe(1); // pas de nouvel immeuble
    expect(db.rentalTaxStatements.length).toBe(2); // un nouvel état peut être créé (un par import)
    expect(db.revenues.length).toBe(2); // idempotent: pas de nouvelles lignes
    expect(db.expenses.length).toBe(1);
  });
});
