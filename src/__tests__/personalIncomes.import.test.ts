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
  personalIncomes: [] as any[]
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
    OPENAI_API_KEY: 'test-key'
  }
}));

import { app } from '../server/app';

describe('POST /api/personal-incomes/import', () => {
  beforeEach(() => {
    db.shareholders.length = 0;
    db.personalIncomes.length = 0;
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
});
