/// <reference types="jest" />
import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Mocks avant d'importer l'app
jest.mock('../server/middlewares/authenticated', () => ({
  authenticated: (req: any, _res: any, next: any) => {
    req.userId = 1;
    next();
  }
}));

// Mock du client Prisma utilisé par la route
const db: any = {
  shareholders: [] as any[],
  users: [{ id: 1, email: 'user@example.com' }],
  personalIncomes: [] as any[],
  personalTaxReturns: [] as any[],
  taxSlips: [] as any[],
  taxSlipLines: [] as any[],
  journalEntries: [] as any[],
  journalLines: [] as any[]
};

jest.mock('../server/lib/prisma', () => ({
  prisma: {
    shareholder: {
      findMany: jest.fn(async (args: any) => db.shareholders.filter((s: any) => s.userId === args.where.userId)),
      findFirst: jest.fn(async (args: any) =>
        db.shareholders.find((s: any) => s.userId === args.where.userId && (!args.where.id || s.id === args.where.id)) || null
      ),
      create: jest.fn(async (args: any) => {
        const id = db.shareholders.length + 1;
        const rec = { id, ...args.data };
        db.shareholders.push(rec);
        return args.select ? { id } : rec;
      })
    },
    user: {
  findUnique: jest.fn(async (args: any) => db.users.find((u: any) => u.id === args.where.id) || null)
    },
    personalIncome: {
      findMany: jest.fn(async (_args: any) => db.personalIncomes),
      create: jest.fn(async (args: any) => {
        const id = db.personalIncomes.length + 1;
        const rec = { id, createdAt: new Date(), updatedAt: new Date(), ...args.data };
        db.personalIncomes.push(rec);
        return args.select ? { id } : rec;
      }),
      deleteMany: jest.fn(async (_args: any) => ({ count: 0 }))
    },
    journalEntry: {
      create: jest.fn(async (args: any) => {
        const id = db.journalEntries.length + 1;
        const rec = { id, createdAt: new Date(), updatedAt: new Date(), ...args.data };
        db.journalEntries.push(rec);
        return args.select ? { id } : rec;
      })
    },
    journalEntryLine: {
      create: jest.fn(async (args: any) => {
        const id = db.journalLines.length + 1;
        const rec = { id, createdAt: new Date(), updatedAt: new Date(), ...args.data };
        db.journalLines.push(rec);
        return rec;
      })
    },
    personalTaxReturn: {
      findFirst: jest.fn(async (args: any) =>
        db.personalTaxReturns.find((r: any) => r.shareholderId === args.where.shareholderId && r.taxYear === args.where.taxYear) || null
      ),
      create: jest.fn(async (args: any) => {
        const id = db.personalTaxReturns.length + 1;
        const rec = { id, createdAt: new Date(), updatedAt: new Date(), ...args.data };
        db.personalTaxReturns.push(rec);
        return rec;
      }),
      update: jest.fn(async (args: any) => {
        const rec = db.personalTaxReturns.find((r: any) => r.id === args.where.id);
        if (!rec) return null;
        Object.assign(rec, args.data, { updatedAt: new Date() });
        return rec;
      })
    },
    taxSlip: {
      findMany: jest.fn(async (args: any) => db.taxSlips.filter((s: any) => !args?.where?.returnId || s.returnId === args.where.returnId)),
      create: jest.fn(async (args: any) => {
        const id = db.taxSlips.length + 1;
        const rec = { id, createdAt: new Date(), updatedAt: new Date(), ...args.data };
        db.taxSlips.push(rec);
        return args.select ? { id } : rec;
      }),
      deleteMany: jest.fn(async (args: any) => {
        const before = db.taxSlips.length;
        const retId = args?.where?.returnId;
        db.taxSlips = db.taxSlips.filter((s: any) => (retId ? s.returnId !== retId : true));
        return { count: before - db.taxSlips.length };
      })
    },
    taxSlipLine: {
      findMany: jest.fn(async (args: any) => db.taxSlipLines.filter((l: any) => !args?.where?.slipId || l.slipId === args.where.slipId)),
      create: jest.fn(async (args: any) => {
        const id = db.taxSlipLines.length + 1;
        const rec = { id, createdAt: new Date(), updatedAt: new Date(), ...args.data };
        db.taxSlipLines.push(rec);
        return args.select ? { id } : rec;
      }),
      deleteMany: jest.fn(async (args: any) => {
        const before = db.taxSlipLines.length;
        const retId = args?.where?.slip?.returnId;
        if (retId) {
          // Supprime toutes les lignes appartenant aux slips du retour
          const slipIds = new Set(db.taxSlips.filter((s: any) => s.returnId === retId).map((s: any) => s.id));
          db.taxSlipLines = db.taxSlipLines.filter((l: any) => !slipIds.has(l.slipId));
        }
        return { count: before - db.taxSlipLines.length };
      })
    }
  }
}));

// Mock de l'extracteur
const mockExtract = jest.fn() as jest.MockedFunction<(...args: any[]) => Promise<any>>;
jest.mock('../server/services/tax', () => ({
  extractPersonalTaxReturn: (...args: any[]) => mockExtract(...args)
}));

// Par défaut, on veut une clé OpenAI présente pour activer l'import
jest.mock('../server/env', () => ({
  env: {
    PORT: 4000,
    DATABASE_URL: 'file:mock',
    JWT_SECRET: 'x'.repeat(32),
    ADVISOR_ENGINE: 'heuristic',
    OPENAI_API_KEY: 'test-key',
    POST_TO_LEDGER_DEFAULT: false
  }
}));

import { app } from '../server/app';

describe('POST /api/personal-incomes/import', () => {
  beforeEach(() => {
    db.shareholders.length = 0;
    db.personalIncomes.length = 0;
    db.personalTaxReturns.length = 0;
    db.taxSlips.length = 0;
    db.taxSlipLines.length = 0;
    db.journalEntries.length = 0;
    db.journalLines.length = 0;
    mockExtract.mockReset();
  });

  it('retourne 400 si aucun fichier fourni', async () => {
    const res = await request(app)
      .post('/api/personal-incomes/import')
      .set('Authorization', 'Bearer fake')
      .expect(400);
    expect(res.body).toHaveProperty('error');
  });

  it('retourne 501 si OPENAI_API_KEY absent', async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    jest.resetModules();
    jest.doMock('../server/env', () => ({
      env: {
        PORT: 4000,
        DATABASE_URL: 'file:mock',
        JWT_SECRET: 'x'.repeat(32),
        ADVISOR_ENGINE: 'heuristic',
        OPENAI_API_KEY: undefined
      }
    }));

    // Ré-importer dynamiquement la route avec l'env mocké
    const { app: appWithNoKey } = await import('../server/app');
    const res = await request(appWithNoKey)
      .post('/api/personal-incomes/import')
      .set('Authorization', 'Bearer fake')
      .attach('file', Buffer.from('pdf-bytes'), {
        filename: 'test.pdf',
        contentType: 'application/pdf'
      })
      .expect(501);
    expect(res.body).toHaveProperty('error');

    process.env.OPENAI_API_KEY = previousKey;
  });

  it('crée des revenus quand autoCreate=true et extraction réussie', async () => {
    mockExtract.mockResolvedValue({
      taxYear: 2023,
      items: [
        { category: 'EMPLOYMENT', label: 'Salaire – ACME', amount: 50000, source: 'ACME', slipType: 'T4' },
        { category: 'ELIGIBLE_DIVIDEND', label: 'Dividendes – Banque X', amount: 1200, source: 'Banque X', slipType: 'T5' }
      ],
      confidence: 0.9
    });

    const res = await request(app)
      .post('/api/personal-incomes/import?autoCreate=true')
      .set('Authorization', 'Bearer fake')
      .attach('file', Buffer.from('pdf-bytes'), {
        filename: 'test.pdf',
        contentType: 'application/pdf'
      })
      .expect(200);

    expect(res.body).toMatchObject({ taxYear: 2023 });
    expect(Array.isArray(res.body.createdIds)).toBe(true);
    expect(res.body.createdIds.length).toBe(2);
    expect(db.personalIncomes.length).toBe(2);
  });

  it('persiste le retour et les feuillets quand persistDetails=true', async () => {
    mockExtract.mockResolvedValue({
      taxYear: 2024,
      items: [
        { category: 'EMPLOYMENT', label: 'Salaire – ACME', amount: 60000, source: 'ACME', slipType: 'T4' }
      ],
      slips: [
        {
          slipType: 'T4',
          issuer: 'ACME',
          lines: [
            { code: '14', label: 'Employment income', amount: 60000 },
            { code: '22', label: 'Income tax deducted', amount: 9000 }
          ]
        }
      ],
      confidence: 0.92
    });

    const res = await request(app)
      .post('/api/personal-incomes/import?persistDetails=true')
      .set('Authorization', 'Bearer fake')
      .attach('file', Buffer.from('pdf-bytes'), {
        filename: 'test.pdf',
        contentType: 'application/pdf'
      })
      .expect(200);

    expect(res.body).toMatchObject({ taxYear: 2024 });
    expect(typeof res.body.createdReturnId).toBe('number');
    expect(Array.isArray(res.body.createdSlipIds)).toBe(true);
    expect(res.body.createdSlipIds.length).toBe(1);
    // Vérifie persistance en mémoire
    expect(db.personalTaxReturns.length).toBe(1);
    expect(db.taxSlips.length).toBe(1);
    expect(db.taxSlipLines.length).toBe(2);
  });

  it('retourne 400 pour un MIME non supporté', async () => {
    // Même avec la clé, la validation Multer doit refuser ce type
    const res = await request(app)
      .post('/api/personal-incomes/import')
      .set('Authorization', 'Bearer fake')
      .attach('file', Buffer.from('hello world'), {
        filename: 'bad.txt',
        contentType: 'text/plain'
      })
      .expect(400);
    expect(res.body).toHaveProperty('error');
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it('accepte application/octet-stream si le nom de fichier est .pdf', async () => {
    mockExtract.mockResolvedValue({
      taxYear: 2024,
      items: [
        { category: 'EMPLOYMENT', label: 'Salaire – ACME', amount: 1000, source: 'ACME', slipType: 'T4' },
        { category: 'OTHER', label: 'Autre revenu', amount: 200 }
      ],
      confidence: 0.8
    });

    const res = await request(app)
      .post('/api/personal-incomes/import?autoCreate=true')
      .set('Authorization', 'Bearer fake')
      .attach('file', Buffer.from('pdf-content'), {
        filename: 'test.pdf',
        contentType: 'application/octet-stream'
      })
      .expect(200);

    expect(res.body.createdIds.length).toBe(2);
    expect(db.personalIncomes.length).toBe(2);
  });

  it('chemin image fonctionne (png)', async () => {
    mockExtract.mockResolvedValue({
      taxYear: 2024,
      items: [
        { category: 'EMPLOYMENT', label: 'Salaire – ACME', amount: 1000 }
      ],
      confidence: 0.7
    });

    const res = await request(app)
      .post('/api/personal-incomes/import?autoCreate=true')
      .set('Authorization', 'Bearer fake')
      .attach('file', Buffer.from([137,80,78,71]), {
        filename: 'slip.png',
        contentType: 'image/png'
      })
      .expect(200);

    expect(res.body.createdIds.length).toBe(1);
    expect(db.personalIncomes.length).toBe(1);
  });

  it('override shareholderId et taxYear via query', async () => {
    // Provisionne un actionnaire 42 pour l'utilisateur 1
    db.shareholders.push({ id: 42, userId: 1, displayName: 'Actionnaire test' });

    mockExtract.mockResolvedValue({
      taxYear: 2021, // sera surchargé par la query
      items: [
        { category: 'OTHER', label: 'Revenu X', amount: 300 }
      ],
      confidence: 0.6
    });

    const res = await request(app)
      .post('/api/personal-incomes/import?autoCreate=true&shareholderId=42&taxYear=2022')
      .set('Authorization', 'Bearer fake')
      .attach('file', Buffer.from('pdf-bytes'), {
        filename: 'test.pdf',
        contentType: 'application/pdf'
      })
      .expect(200);

    expect(res.body.shareholderId).toBe(42);
    expect(res.body.taxYear).toBe(2022);
    expect(db.personalIncomes.length).toBe(1);
    expect(db.personalIncomes[0].shareholderId).toBe(42);
    expect(db.personalIncomes[0].taxYear).toBe(2022);
  });

  it('postToLedger=true poste des écritures équilibrées et retourne les entryIds', async () => {
    mockExtract.mockResolvedValue({
      taxYear: 2024,
      items: [
        { category: 'EMPLOYMENT', label: 'Salaire – ACME', amount: 1000 },
        { category: 'OTHER', label: 'Autre revenu', amount: 200 }
      ],
      confidence: 0.7
    });

    const res = await request(app)
      .post('/api/personal-incomes/import?postToLedger=true')
      .set('Authorization', 'Bearer fake')
      .attach('file', Buffer.from('pdf-bytes'), {
        filename: 'test.pdf',
        contentType: 'application/pdf'
      })
      .expect(200);

    expect(Array.isArray(res.body.postedEntryIds)).toBe(true);
    expect(res.body.postedEntryIds.length).toBe(2);
    expect(db.journalEntries.length).toBe(2);
    // 2 lignes par écriture
    expect(db.journalLines.length).toBe(4);
  });

  it('utilise POST_TO_LEDGER_DEFAULT=true quand le paramètre postToLedger est omis', async () => {
    jest.resetModules();
    // Réinjecte les mocks d'env avec POST_TO_LEDGER_DEFAULT true
    jest.doMock('../server/env', () => ({
      env: {
        PORT: 4000,
        DATABASE_URL: 'file:mock',
        JWT_SECRET: 'x'.repeat(32),
        ADVISOR_ENGINE: 'heuristic',
        OPENAI_API_KEY: 'test-key',
        POST_TO_LEDGER_DEFAULT: true
      }
    }));

    // Préparer une extraction simple
    mockExtract.mockResolvedValue({
      taxYear: 2024,
      items: [
        { category: 'EMPLOYMENT', label: 'Salaire – ACME', amount: 1000 },
        { category: 'OTHER', label: 'Autre revenu', amount: 200 }
      ],
      confidence: 0.7
    });

    const { app: appDefaultPost } = await import('../server/app');
    const res = await request(appDefaultPost)
      .post('/api/personal-incomes/import')
      .set('Authorization', 'Bearer fake')
      .attach('file', Buffer.from('pdf-bytes'), {
        filename: 'test.pdf',
        contentType: 'application/pdf'
      })
      .expect(200);

    expect(Array.isArray(res.body.postedEntryIds)).toBe(true);
    expect(res.body.postedEntryIds.length).toBe(2);
  });

  it("retourne 422 si l'année n'est pas détectée et non fournie", async () => {
    // L'extracteur ne renvoie pas taxYear
    mockExtract.mockResolvedValue({
      items: [
        { category: 'EMPLOYMENT', label: 'Salaire – ACME', amount: 50000, source: 'ACME', slipType: 'T4' }
      ],
      confidence: 0.8
    });

    const res = await request(app)
      .post('/api/personal-incomes/import')
      .set('Authorization', 'Bearer fake')
      .attach('file', Buffer.from('pdf-bytes'), {
        filename: 'test.pdf',
        contentType: 'application/pdf'
      })
      .expect(422);

    expect(res.body).toHaveProperty('error');
    expect(db.personalIncomes.length).toBe(0);
  });
});
