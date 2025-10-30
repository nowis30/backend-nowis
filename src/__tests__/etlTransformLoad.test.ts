import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../server/lib/prisma', () => ({
  prisma: {
    journalEntry: {
      create: jest.fn()
    },
    journalEntryLine: {
      create: jest.fn()
    }
  }
}));

import { transformPersonalIncomeItemsToJournalDrafts } from '../server/services/etl/transform';
import { postJournalDrafts } from '../server/services/etl/load';
import { prisma } from '../server/lib/prisma';

describe('ETL Transform + Load', () => {
  const mem: any = {
    entries: [] as any[],
    lines: [] as any[]
  };

  beforeEach(() => {
    mem.entries.length = 0;
    mem.lines.length = 0;
    (prisma.journalEntry.create as any).mockImplementation(async (args: any) => {
      const id = mem.entries.length + 1;
      const rec = { id, createdAt: new Date(), updatedAt: new Date(), ...args.data };
      mem.entries.push(rec);
      return args.select ? { id } : rec;
    });
    (prisma.journalEntryLine.create as any).mockImplementation(async (args: any) => {
      const id = mem.lines.length + 1;
      const rec = { id, createdAt: new Date(), updatedAt: new Date(), ...args.data };
      mem.lines.push(rec);
      return rec;
    });
  });

  it('maps income items to balanced drafts and posts them', async () => {
    const drafts = transformPersonalIncomeItemsToJournalDrafts({
      userId: 1,
      taxYear: 2023,
      items: [
        { category: 'EMPLOYMENT', label: 'Salaire – ACME', amount: 50000, source: 'ACME', slipType: 'T4' },
        { category: 'ELIGIBLE_DIVIDEND', label: 'Dividendes – Banque X', amount: 1200, source: 'Banque X', slipType: 'T5' }
      ]
    });

    expect(drafts.length).toBe(2);
    for (const d of drafts) {
      const debit = d.lines.reduce((s, l) => s + l.debit, 0);
      const credit = d.lines.reduce((s, l) => s + l.credit, 0);
      expect(Math.round(debit * 100) / 100).toBe(Math.round(credit * 100) / 100);
      // default mapping uses 1100 and 4200
      const codes = d.lines.map((l) => l.accountCode).sort();
      expect(codes).toEqual(['1100', '4200']);
    }

    const res = await postJournalDrafts(drafts);
    expect(res.entryIds.length).toBe(2);
    expect(mem.entries.length).toBe(2);
    expect(mem.lines.length).toBe(4);
  });

  it('rejects unbalanced draft', async () => {
    const badDraft = [{
      userId: 1,
      entryDate: new Date(),
      lines: [
        { accountCode: '1100', debit: 100, credit: 0 },
        { accountCode: '4200', debit: 0, credit: 90 }
      ]
    }];
    await expect(postJournalDrafts(badDraft as any)).rejects.toThrow(/Unbalanced journal/);
  });
});
