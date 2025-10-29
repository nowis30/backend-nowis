import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Auth mock
jest.mock('../server/middlewares/authenticated', () => ({
  authenticated: (req: any, _res: any, next: any) => {
    req.userId = 1;
    next();
  }
}));

// In-memory DB mock
const db: any = {
  users: [{ id: 1, email: 'ingest@example.com' }],
  shareholders: [] as any[],
  uploadedDocuments: [] as any[],
  personalTaxReturns: [] as any[],
  personalTaxReturnLines: [] as any[],
  taxSlips: [] as any[],
  taxSlipLines: [] as any[],
  rentalTaxStatements: [] as any[],
  personalIncomes: [] as any[]
};

// Prisma mock (subset used by ingest)
jest.mock('../server/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async (args: any) => db.users.find((u: any) => u.id === args.where.id) || null)
    },
    personalIncome: {
      findFirst: jest.fn(async (args: any) => {
        // Simule la recherche d'un revenu existant pour la déduplication
        return db.personalIncomes.find(
          (i: any) =>
            i.shareholderId === args.where.shareholderId &&
            i.taxYear === args.where.taxYear &&
            i.label === args.where.label &&
            i.amount === args.where.amount
        ) || null;
      }),
      create: jest.fn(async (args: any) => {
        const id = db.personalIncomes.length + 1;
        const rec = { id, ...args.data };
        db.personalIncomes.push(rec);
        return args.select ? { id } : rec;
      })
    },
    shareholder: {
      findFirst: jest.fn(async (args: any) => {
        // Ignore orderBy/select for test robustness
        const where = args.where || {};
        if (where.id && where.userId) {
          return db.shareholders.find((s: any) => s.id === where.id && s.userId === where.userId) || null;
        }
        if (where.userId) {
          // Return the first shareholder for this userId
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
      }),
      findMany: jest.fn(async (_args: any) => db.uploadedDocuments)
    },
    personalTaxReturn: {
      findFirst: jest.fn(async (args: any) =>
        db.personalTaxReturns
          .filter((r: any) => db.shareholders.find((s: any) => s.id === r.shareholderId && s.userId === args.where.shareholder.userId))
          .sort((a: any, b: any) => b.taxYear - a.taxYear)[0] || null
      ),
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
    property: { findMany: jest.fn(async (_args: any) => []) },
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

// Mock tax extractor result with identity
const mockExtract = jest.fn() as jest.MockedFunction<(...args: any[]) => Promise<any>>;
jest.mock('../server/services/tax', () => ({
  extractPersonalTaxReturn: (...args: any[]) => mockExtract(...args),
  extractRentalTaxSummaries: jest.fn(async () => [])
}));

// Mock document storage to avoid FS and force checksum for duplicates
const mockSave: any = jest.fn();
jest.mock('../server/services/documentStorage', () => ({
  saveUserDocumentFile: (...args: any[]) => mockSave(...args),
  resolveUserDocumentPath: (p: string) => p,
  deleteUserDocumentFile: jest.fn()
}));

// Mock env
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

describe('POST /api/ai/ingest (personal-income)', () => {
  beforeEach(() => {
    db.shareholders.length = 0;
    db.uploadedDocuments.length = 0;
    db.personalTaxReturns.length = 0;
    db.personalTaxReturnLines.length = 0;
    db.taxSlips.length = 0;
    db.taxSlipLines.length = 0;
    mockExtract.mockReset();
    mockSave.mockReset();

    mockSave.mockResolvedValue({ storagePath: 'user-1/docs/fixed.bin', checksum: 'fixedsum', filename: 'fixed.bin' });
  });

  it('ingère un document, crée le retour fiscal et met à jour le profil (identité)', async () => {
    mockExtract.mockResolvedValue({
      taxYear: 2024,
      items: [
        { category: 'EMPLOYMENT', label: 'Salaire – ACME', amount: 60000, source: 'ACME', slipType: 'T4' }
      ],
      slips: [
        { slipType: 'T4', issuer: 'ACME', accountNumber: '123', lines: [{ code: '14', label: 'Revenu d\'emploi', amount: 60000 }] }
      ],
      identity: { fullName: 'Jean Dupont', address: '123 Rue Principale, Montréal QC', birthDate: '1985-04-20', phone: '514-555-0000' },
      confidence: 0.9
    });

    const res = await request(app)
      .post('/api/ai/ingest?domain=personal-income&autoCreate=true')
      .set('Authorization', 'Bearer fake')
      .attach('file', Buffer.from('%PDF-1.7'), { filename: 'impot-2024.pdf', contentType: 'application/pdf' })
      .expect(200);

    expect(res.body).toMatchObject({ status: 'OK', duplicate: false, taxYear: 2024 });
    // Shareholder should exist and be updated
    expect(db.shareholders.length).toBe(1);
    expect(db.shareholders[0].displayName).toBe('Jean Dupont');
    expect(db.shareholders[0].address).toContain('Montréal');
    expect(new Date(db.shareholders[0].birthDate).getFullYear()).toBe(1985);
  });

  it('détecte les doublons par checksum et renvoie le statut DUPLICATE', async () => {
    mockExtract.mockResolvedValue({ taxYear: 2023, items: [], slips: [], confidence: 0.5 });

    // First ingest
    await request(app)
      .post('/api/ai/ingest?domain=personal-income')
      .set('Authorization', 'Bearer fake')
      .attach('file', Buffer.from('same-buf'), { filename: 'a.pdf', contentType: 'application/pdf' })
      .expect(200);

    // Second ingest with same buffer -> same checksum
    const res2 = await request(app)
      .post('/api/ai/ingest?domain=personal-income')
      .set('Authorization', 'Bearer fake')
      .attach('file', Buffer.from('same-buf'), { filename: 'a.pdf', contentType: 'application/pdf' })
      .expect(200);

    expect(res2.body).toMatchObject({ status: 'DUPLICATE', duplicate: true });
  });
});
